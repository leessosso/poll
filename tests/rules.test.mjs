import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, set, update } from 'firebase/database';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-dcc-poll';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function emulatorHost(name, fallback) {
  const raw = process.env[name] ?? fallback;
  const [host, port] = raw.split(':');
  return { host, port: Number(port) };
}

let testEnv;

function voter(uid = 'voter-1') {
  return testEnv.authenticatedContext(uid).firestore();
}

function admin() {
  return testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
}

function shellAdmin() {
  return testEnv.authenticatedContext('shell_m1', { admin: true, mid: 'm1' }).firestore();
}

function unauth() {
  return testEnv.unauthenticatedContext().firestore();
}

function pollData(overrides = {}) {
  const now = Date.now();
  return {
    title: '안건',
    type: 'yesno',
    options: ['찬성', '반대', '기권'],
    status: 'active',
    createdAt: now,
    showResults: false,
    eligibilityMode: 'roster',
    allowAbstain: true,
    eventId: '',
    durationSeconds: 180,
    startedAt: now - 1000,
    endsAt: now + 60_000,
    castCount: 0,
    passRatio: 0.5,
    ...overrides,
  };
}

function counts(overrides = {}) {
  return { counts: { 찬성: 0, 반대: 0, 기권: 0, ...overrides } };
}

async function seed(write) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await write(context.firestore());
  });
}

before(async () => {
  const firestore = emulatorHost('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
  const database = emulatorHost('FIREBASE_DATABASE_EMULATOR_HOST', '127.0.0.1:9000');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: firestore.host,
      port: firestore.port,
    },
    database: {
      rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
      host: database.host,
      port: database.port,
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearDatabase();
});

describe('firestore rules', () => {
  test('인증 없는 읽기와 다른 컬렉션 쓰기는 거부한다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll1'), pollData());
      await setDoc(doc(db, 'attendanceRawEvents/event_' + UUID), { secret: true });
    });

    await assertFails(getDoc(doc(unauth(), 'polls/poll1')));
    await assertFails(getDoc(doc(voter(), 'attendanceRawEvents/event_' + UUID)));
    await assertFails(setDoc(doc(voter(), 'meeting/current'), { roomCode: '1234', updatedAt: Date.now() }));
    await assertFails(deleteDoc(doc(voter(), 'voters/v1')));
    await assertFails(setDoc(doc(voter(), 'polls/new'), pollData({ status: 'waiting', castCount: 0 })));
  });

  test('셸 uid와 admin·mid 클레임은 관리자 작업을 하고 익명과 비관리자는 못한다', async () => {
    const now = Date.now();
    const db = shellAdmin();
    await assertSucceeds(setDoc(doc(db, 'polls/poll-shell'), pollData({
      status: 'waiting',
      startedAt: null,
      endsAt: null,
      castCount: 0,
    })));
    await assertSucceeds(setDoc(doc(db, 'polls/poll-shell/tally/current'), counts()));
    await assertSucceeds(setDoc(doc(db, 'voters/shell-voter'), {
      name: '이영희',
      externalQrId: '',
      active: true,
      createdAt: now,
    }));
    await assertSucceeds(setDoc(doc(db, 'meeting/current'), { roomCode: '5678', updatedAt: now }));
    await assertSucceeds(deleteDoc(doc(db, 'voters/shell-voter')));

    const anon = testEnv.authenticatedContext('anon-voter').firestore();
    const member = testEnv.authenticatedContext('member-1', { admin: false, mid: 'm9' }).firestore();
    const waiting = pollData({ status: 'waiting', startedAt: null, endsAt: null, castCount: 0 });
    await assertFails(setDoc(doc(anon, 'polls/by-anon'), waiting));
    await assertFails(setDoc(doc(member, 'polls/by-member'), waiting));
    await assertFails(setDoc(doc(member, 'meeting/current'), { roomCode: '0000', updatedAt: now }));
    await assertFails(deleteDoc(doc(anon, 'voters/v1')));
    await assertFails(getDoc(doc(unauth(), 'polls/poll-shell')));
  });

  test('관리자는 투표와 명단과 입장 코드를 만들고 투표자는 명단을 지우지 못한다', async () => {
    const now = Date.now();
    const db = admin();
    const batch = writeBatch(db);
    batch.set(doc(db, 'polls/poll-admin'), pollData({ status: 'waiting', startedAt: null, endsAt: null }));
    batch.set(doc(db, 'polls/poll-admin/tally/current'), counts());
    await assertSucceeds(batch.commit());
    await assertSucceeds(setDoc(doc(db, 'voters/v1'), {
      name: '김철수',
      externalQrId: '',
      active: true,
      createdAt: now,
    }));
    await assertSucceeds(setDoc(doc(db, 'meeting/current'), { roomCode: '1234', updatedAt: now }));
    await assertFails(deleteDoc(doc(voter(), 'voters/v1')));
  });

  test('현장 입장은 비어 있는 이름에만 가능하고 선택 필드는 거부한다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'voters/v1'), {
        name: '김철수',
        externalQrId: '',
        active: true,
        createdAt: 1,
      });
    });

    const claim = {
      voterId: 'v1',
      voterName: '김철수',
      claimedAt: Date.now(),
      claimToken: UUID,
      authUid: 'voter-1',
    };
    await assertSucceeds(setDoc(doc(voter(), 'checkins/v1'), claim));
    await assertFails(setDoc(doc(voter('voter-2'), 'checkins/v1'), { ...claim, authUid: 'voter-2' }));
    await assertFails(setDoc(doc(voter('voter-2'), 'checkins/v2'), {
      ...claim,
      voterId: 'v2',
      authUid: 'voter-2',
      choice: '찬성',
    }));
  });

  test('명단 투표는 한 칸만 올리고 참여 문서에 선택을 남기지 않는다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll1'), pollData());
      await setDoc(doc(db, 'polls/poll1/tally/current'), counts());
      await setDoc(doc(db, 'voters/v1'), { name: '김철수', externalQrId: '', active: true, createdAt: 1 });
      await setDoc(doc(db, 'checkins/v1'), {
        voterId: 'v1',
        voterName: '김철수',
        claimedAt: 1,
        claimToken: UUID,
        authUid: 'voter-1',
      });
      await setDoc(doc(db, 'polls/poll1/participation/v1'), {
        voterId: 'v1',
        voterName: '김철수',
        status: 'pending',
        createdAt: 1,
      });
    });

    await assertFails(rosterVote(voter('voter-2'), 'voter-2', '찬성'));
    await assertSucceeds(rosterVote(voter(), 'voter-1', '찬성'));
    await assertFails(rosterVote(voter(), 'voter-1', '반대'));
    await assertFails(getDocs(collection(voter(), 'polls/poll1/participation')));
    await assertSucceeds(getDoc(doc(voter(), 'polls/poll1/participation/v1')));
  });

  test('집계를 두 칸 올리거나 참여 문서에 선택 필드를 쓰면 거부한다', async () => {
    await seedRoster();
    const db = voter();
    await assertFails(runTransaction(db, async (tx) => {
      tx.update(doc(db, 'polls/poll1/participation/v1'), {
        status: 'completed',
        completedAt: Date.now(),
        choice: '찬성',
      });
      tx.update(doc(db, 'polls/poll1'), { castCount: increment(1) });
      tx.update(doc(db, 'polls/poll1/tally/current'), { 'counts.찬성': increment(1) });
      tx.set(doc(db, 'polls/poll1/voteGuards/voter-1'), { voterId: 'v1' });
    }));

    await assertFails(runTransaction(db, async (tx) => {
      tx.update(doc(db, 'polls/poll1/participation/v1'), {
        status: 'completed',
        completedAt: Date.now(),
      });
      tx.update(doc(db, 'polls/poll1'), { castCount: increment(1) });
      tx.update(doc(db, 'polls/poll1/tally/current'), {
        'counts.찬성': increment(1),
        'counts.반대': increment(1),
      });
      tx.set(doc(db, 'polls/poll1/voteGuards/voter-1'), { voterId: 'v1' });
    }));

    await assertFails(runTransaction(db, async (tx) => {
      tx.update(doc(db, 'polls/poll1/participation/v1'), {
        status: 'completed',
        completedAt: Date.now(),
      });
      tx.update(doc(db, 'polls/poll1'), { castCount: increment(1) });
      tx.update(doc(db, 'polls/poll1/tally/current'), {
        'counts.찬성': increment(2),
      });
      tx.set(doc(db, 'polls/poll1/voteGuards/voter-1'), { voterId: 'v1' });
    }));

    await assertFails(runTransaction(db, async (tx) => {
      tx.update(doc(db, 'polls/poll1/participation/v1'), {
        status: 'completed',
        completedAt: Date.now(),
      });
      tx.update(doc(db, 'polls/poll1'), { castCount: increment(1) });
      tx.update(doc(db, 'polls/poll1/tally/current'), {
        'counts.찬성': increment(1),
        voterId: 'v1',
      });
      tx.set(doc(db, 'polls/poll1/voteGuards/voter-1'), { voterId: 'v1', choice: '찬성' });
    }));
  });

  test('진행 중 집계는 관리자만 읽고 마감 후 공개일 때만 투표자가 읽는다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/open-poll'), pollData({ showResults: true }));
      await setDoc(doc(db, 'polls/open-poll/tally/current'), counts({ 찬성: 3 }));
      await setDoc(doc(db, 'polls/closed-shown'), pollData({ status: 'closed', showResults: true, closedAt: 2 }));
      await setDoc(doc(db, 'polls/closed-shown/tally/current'), counts({ 찬성: 2 }));
      await setDoc(doc(db, 'polls/closed-hidden'), pollData({ status: 'closed', showResults: false, closedAt: 2 }));
      await setDoc(doc(db, 'polls/closed-hidden/tally/current'), counts({ 찬성: 2 }));
    });

    await assertFails(getDoc(doc(voter(), 'polls/open-poll/tally/current')));
    await assertSucceeds(getDoc(doc(admin(), 'polls/open-poll/tally/current')));
    await assertSucceeds(getDoc(doc(voter(), 'polls/closed-shown/tally/current')));
    await assertFails(getDoc(doc(voter(), 'polls/closed-hidden/tally/current')));
    await assertSucceeds(getDoc(doc(voter(), 'polls/open-poll')));
  });

  test('레거시 results 가 남은 투표도 목록에서 읽고 그 필드는 고치지 못한다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/legacy'), {
        ...pollData({ status: 'closed', showResults: false, closedAt: 2 }),
        results: { 찬성: 1 },
      });
      await setDoc(doc(db, 'polls/legacy/tally/current'), counts({ 찬성: 1 }));
      await setDoc(doc(db, 'polls/clean'), pollData({ status: 'waiting', startedAt: null, endsAt: null }));
    });

    const listed = await assertSucceeds(getDocs(collection(voter(), 'polls')));
    assert.equal(listed.size, 2);
    await assertSucceeds(getDoc(doc(admin(), 'polls/legacy')));
    await assertFails(getDoc(doc(voter(), 'polls/legacy/tally/current')));
    await assertSucceeds(updateDoc(doc(admin(), 'polls/legacy'), { title: '지난 안건' }));
    await assertFails(updateDoc(doc(admin(), 'polls/legacy'), { results: { 찬성: 9 } }));
    await assertFails(setDoc(doc(admin(), 'polls/new-results'), {
      ...pollData({ status: 'waiting', startedAt: null, endsAt: null, castCount: 0 }),
      results: { 찬성: 0 },
    }));
  });

  test('authUid 없는 체크인은 목록을 막지 않고 새 입장으로만 덮어쓸 수 있다', async () => {
    const nextToken = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll1'), pollData());
      await setDoc(doc(db, 'polls/poll1/tally/current'), counts());
      await setDoc(doc(db, 'voters/v1'), { name: '김철수', externalQrId: '', active: true, createdAt: 1 });
      await setDoc(doc(db, 'voters/v2'), { name: '이영희', externalQrId: '', active: true, createdAt: 1 });
      await setDoc(doc(db, 'checkins/v1'), {
        voterId: 'v1',
        voterName: '김철수',
        claimedAt: 1,
        claimToken: UUID,
      });
      await setDoc(doc(db, 'checkins/v2'), {
        voterId: 'v2',
        voterName: '이영희',
        claimedAt: Date.now(),
        claimToken: UUID,
        authUid: 'voter-9',
      });
      await setDoc(doc(db, 'polls/poll1/participation/v1'), {
        voterId: 'v1',
        voterName: '김철수',
        status: 'pending',
        createdAt: 1,
      });
    });

    await assertSucceeds(getDoc(doc(voter(), 'checkins/v1')));
    await assertSucceeds(getDoc(doc(voter(), 'checkins/v2')));
    const listed = await assertSucceeds(getDocs(collection(voter(), 'checkins')));
    assert.equal(listed.size, 2);
    await assertFails(rosterVote(voter(), 'voter-1', '찬성'));
    await assertSucceeds(setDoc(doc(voter(), 'checkins/v1'), {
      voterId: 'v1',
      voterName: '김철수',
      claimedAt: Date.now(),
      claimToken: nextToken,
      authUid: 'voter-1',
    }));
    await assertSucceeds(rosterVote(voter(), 'voter-1', '찬성'));
    await assertFails(setDoc(doc(voter('voter-2'), 'checkins/v1'), {
      voterId: 'v1',
      voterName: '김철수',
      claimedAt: Date.now(),
      claimToken: nextToken,
      authUid: 'voter-2',
    }));
    await assertFails(setDoc(doc(voter(), 'checkins/v2'), {
      voterId: 'v2',
      voterName: '이영희',
      claimedAt: Date.now(),
      claimToken: nextToken,
      authUid: 'voter-1',
    }));
  });

  test('누구나 참여 투표는 같은 계정으로 한 번만 집계된다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll-open'), pollData({ eligibilityMode: 'open' }));
      await setDoc(doc(db, 'polls/poll-open/tally/current'), counts());
    });
    await assertSucceeds(openVote(voter(), 'voter-1'));
    await assertFails(openVote(voter(), 'voter-1'));
    await assertSucceeds(openVote(voter('voter-2'), 'voter-2'));
  });

  test('출석 투표는 세션의 유권자만 한 칸 올린다', async () => {
    const now = Date.now();
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll-att'), pollData({ eligibilityMode: 'attendance', eventId: 'elder-vote' }));
      await setDoc(doc(db, 'polls/poll-att/tally/current'), counts());
      await setDoc(doc(db, 'voters/v1'), { name: '김철수', externalQrId: '', active: true, createdAt: 1 });
      await setDoc(doc(db, 'attendanceSessions/session_' + UUID), {
        eventId: 'elder-vote',
        voterId: 'v1',
        voterName: '김철수',
        checkedInAt: now,
        expiresAt: now + SESSION_TTL_MS,
        status: 'active',
      });
      await setDoc(doc(db, 'polls/poll-att/participation/v1'), {
        voterId: 'v1',
        voterName: '김철수',
        status: 'pending',
        createdAt: 1,
      });
    });

    await assertSucceeds(attendanceVote(voter(), 'voter-1'));
    await assertFails(getDocs(collection(voter(), 'attendanceSessions')));
    await assertSucceeds(getDoc(doc(voter(), 'attendanceSessions/session_' + UUID)));
  });

  test('확정 인원 미만이면 투표되고 채우면 거부되며 인원은 관리자만 바꾼다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll-cap'), pollData({ eligibilityMode: 'open', expectedCount: 1, castCount: 0 }));
      await setDoc(doc(db, 'polls/poll-cap/tally/current'), counts());
      await setDoc(doc(db, 'polls/poll-full'), pollData({
        eligibilityMode: 'open',
        expectedCount: 1,
        castCount: 1,
      }));
      await setDoc(doc(db, 'polls/poll-full/tally/current'), counts({ 찬성: 1 }));
    });

    await assertSucceeds(voteOpen(voter(), 'voter-1', 'poll-cap'));
    await assertFails(voteOpen(voter('voter-2'), 'voter-2', 'poll-cap'));
    await assertFails(voteOpen(voter('voter-3'), 'voter-3', 'poll-full'));
    await assertSucceeds(updateDoc(doc(admin(), 'polls/poll-full'), { expectedCount: 2 }));
    await assertSucceeds(voteOpen(voter('voter-3'), 'voter-3', 'poll-full'));
    await assertFails(updateDoc(doc(voter(), 'polls/poll-cap'), { expectedCount: 9 }));
  });

  test('투표자는 식별자가 있는 명단 문서를 읽지 못하고 공개 이름만 읽는다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'voters/v1'), {
        name: '김철수',
        externalQrId: 'qr-1',
        memberNo: '12',
        active: true,
        createdAt: 1,
      });
      await setDoc(doc(db, 'voterDirectory/v1'), {
        name: '김철수',
        active: true,
        createdAt: 1,
      });
    });

    await assertFails(getDoc(doc(voter(), 'voters/v1')));
    await assertFails(getDocs(collection(voter(), 'voters')));
    const hidden = await assertSucceeds(getDoc(doc(admin(), 'voters/v1')));
    assert.equal(hidden.data().externalQrId, 'qr-1');
    assert.equal(hidden.data().memberNo, '12');
    const visible = await assertSucceeds(getDoc(doc(voter(), 'voterDirectory/v1')));
    assert.deepEqual(Object.keys(visible.data()).sort(), ['active', 'createdAt', 'name']);
    await assertSucceeds(getDocs(collection(voter(), 'voterDirectory')));
    await assertFails(setDoc(doc(voter(), 'voterDirectory/v2'), {
      name: '이영희',
      active: true,
      createdAt: 1,
    }));
  });

  test('results 필드가 없는 투표 목록은 인증된 사용자가 읽는다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll1'), pollData({ status: 'waiting' }));
    });
    await assertSucceeds(getDocs(collection(voter(), 'polls')));
    await assertFails(getDocs(collection(unauth(), 'polls')));
  });
});

describe('realtime database rules', () => {
  const sessionId = `session_${UUID}`;
  const clientId = `client_${UUID}`;

  test('인증 없는 읽기 쓰기와 다른 경로는 거부한다', async () => {
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(get(ref(db, 'presence')));
    await assertFails(set(ref(db, 'presence/' + sessionId), presenceBody('nobody')));
    await assertFails(set(ref(db, 'stolen'), { any: true }));
  });

  test('본인 presence 와 오늘 방문 기록만 정해진 필드로 쓴다', async () => {
    const db = testEnv.authenticatedContext('voter-1').database();
    const presenceRef = ref(db, `presence/${sessionId}`);
    await assertSucceeds(set(presenceRef, presenceBody('voter-1')));
    await assertSucceeds(update(presenceRef, { lastSeenAt: Date.now() }));
    await assertFails(update(presenceRef, { choice: '찬성' }));
    const other = testEnv.authenticatedContext('voter-2').database();
    await assertFails(remove(ref(other, `presence/${sessionId}`)));
    await assertSucceeds(remove(presenceRef));

    const visitorRef = ref(db, `visitors/2026-11-02/${clientId}`);
    await assertSucceeds(set(visitorRef, {
      authUid: 'voter-1',
      firstSeenAt: 1,
      lastSeenAt: 1,
      visitCount: 1,
    }));
    await assertSucceeds(update(visitorRef, { lastSeenAt: 2, visitCount: 2 }));
    await assertFails(set(ref(db, `visitors/2026-11-02/${clientId}`), {
      authUid: 'voter-1',
      firstSeenAt: 1,
      lastSeenAt: 2,
      visitCount: 2,
      choice: '찬성',
    }));
    await assertSucceeds(get(ref(db, 'visitors/2026-11-02')));
  });

  test('authUid 없는 presence 와 visitors 는 읽기와 새 쓰기를 막지 않는다', async () => {
    const legacySession = 'session_bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const legacyClient = 'client_bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.database();
      await set(ref(adminDb, `presence/${legacySession}`), {
        clientId: legacyClient,
        connectedAt: 1,
        lastSeenAt: 1,
      });
      await set(ref(adminDb, `visitors/2026-11-02/${legacyClient}`), {
        firstSeenAt: 1,
        lastSeenAt: 1,
        visitCount: 2,
      });
    });

    const db = testEnv.authenticatedContext('voter-1').database();
    const other = testEnv.authenticatedContext('voter-2').database();
    const presence = await assertSucceeds(get(ref(db, 'presence')));
    assert.equal(presence.child(legacySession).child('lastSeenAt').val(), 1);
    assert.equal(presence.child(legacySession).child('authUid').val(), null);
    await assertSucceeds(set(ref(db, `presence/session_${UUID}`), presenceBody('voter-1')));
    await assertFails(remove(ref(other, `presence/${legacySession}`)));
    const still = await assertSucceeds(get(ref(db, `presence/${legacySession}`)));
    assert.equal(still.child('authUid').val(), null);
    await assertSucceeds(set(ref(db, `presence/${legacySession}`), {
      clientId: legacyClient,
      authUid: 'voter-1',
      connectedAt: 1,
      lastSeenAt: 2,
    }));
    await assertFails(remove(ref(other, `presence/${legacySession}`)));
    await assertSucceeds(set(ref(db, `visitors/2026-11-02/${legacyClient}`), {
      authUid: 'voter-1',
      firstSeenAt: 1,
      lastSeenAt: 3,
      visitCount: 3,
    }));
    const visitor = await assertSucceeds(get(ref(db, `visitors/2026-11-02/${legacyClient}`)));
    assert.equal(visitor.child('visitCount').val(), 3);
    assert.equal(visitor.child('authUid').val(), 'voter-1');
  });
});

function presenceBody(uid) {
  return {
    clientId: `client_${UUID}`,
    authUid: uid,
    connectedAt: 10,
    lastSeenAt: 10,
  };
}

async function seedRoster() {
  await seed(async (db) => {
    await setDoc(doc(db, 'polls/poll1'), pollData());
    await setDoc(doc(db, 'polls/poll1/tally/current'), counts());
    await setDoc(doc(db, 'voters/v1'), { name: '김철수', externalQrId: '', active: true, createdAt: 1 });
    await setDoc(doc(db, 'checkins/v1'), {
      voterId: 'v1',
      voterName: '김철수',
      claimedAt: 1,
      claimToken: UUID,
      authUid: 'voter-1',
    });
    await setDoc(doc(db, 'polls/poll1/participation/v1'), {
      voterId: 'v1',
      voterName: '김철수',
      status: 'pending',
      createdAt: 1,
    });
  });
}

function rosterVote(db, uid, choice) {
  return runTransaction(db, async (tx) => {
    tx.update(doc(db, 'polls/poll1/participation/v1'), {
      status: 'completed',
      completedAt: Date.now(),
    });
    tx.update(doc(db, 'polls/poll1'), { castCount: increment(1) });
    tx.update(doc(db, 'polls/poll1/tally/current'), { [`counts.${choice}`]: increment(1) });
    tx.set(doc(db, `polls/poll1/voteGuards/${uid}`), { voterId: 'v1' });
  });
}

function voteOpen(db, uid, pollId) {
  return runTransaction(db, async (tx) => {
    tx.update(doc(db, `polls/${pollId}`), { castCount: increment(1) });
    tx.update(doc(db, `polls/${pollId}/tally/current`), { 'counts.찬성': increment(1) });
    tx.set(doc(db, `polls/${pollId}/voteGuards/${uid}`), { createdAt: Date.now() });
  });
}

function openVote(db, uid) {
  return runTransaction(db, async (tx) => {
    tx.update(doc(db, 'polls/poll-open'), { castCount: increment(1) });
    tx.update(doc(db, 'polls/poll-open/tally/current'), { 'counts.찬성': increment(1) });
    tx.set(doc(db, `polls/poll-open/voteGuards/${uid}`), { createdAt: Date.now() });
  });
}

function attendanceVote(db, uid) {
  return runTransaction(db, async (tx) => {
    tx.update(doc(db, 'polls/poll-att/participation/v1'), {
      status: 'completed',
      completedAt: Date.now(),
    });
    tx.update(doc(db, 'polls/poll-att'), { castCount: increment(1) });
    tx.update(doc(db, 'polls/poll-att/tally/current'), { 'counts.찬성': increment(1) });
    tx.set(doc(db, `polls/poll-att/voteGuards/${uid}`), {
      voterId: 'v1',
      sessionId: 'session_' + UUID,
    });
  });
}
