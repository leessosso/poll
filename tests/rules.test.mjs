import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-dcc-poll';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const MID = 'mtg_11111111-2222-4333-8444-555555555555';
const MID2 = 'mtg_99999999-8888-4777-8666-555555555555';
const CODE = '482913';

function codeHash(meetingId, code) {
  return createHash('sha256').update(`${meetingId}:${code}`).digest('hex');
}

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
    await assertFails(setDoc(doc(voter(), 'meeting/current'), { roomCode: '123456', updatedAt: Date.now() }));
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
    await assertSucceeds(setDoc(doc(db, 'meeting/current'), { roomCode: '567890', meetingId: MID, updatedAt: now }));
    await assertSucceeds(deleteDoc(doc(db, 'voters/shell-voter')));

    const anon = testEnv.authenticatedContext('anon-voter').firestore();
    const member = testEnv.authenticatedContext('member-1', { admin: false, mid: 'm9' }).firestore();
    const waiting = pollData({ status: 'waiting', startedAt: null, endsAt: null, castCount: 0 });
    await assertFails(setDoc(doc(anon, 'polls/by-anon'), waiting));
    await assertFails(setDoc(doc(member, 'polls/by-member'), waiting));
    await assertFails(setDoc(doc(member, 'meeting/current'), { roomCode: '000000', meetingId: MID, updatedAt: now }));
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
    await assertSucceeds(setDoc(doc(db, 'meeting/current'), { roomCode: '123456', meetingId: MID, updatedAt: now }));
    // 입장 코드는 6자리만 저장된다.
    await assertFails(setDoc(doc(db, 'meeting/current'), { roomCode: '1234', meetingId: MID, updatedAt: now }));
    await assertFails(setDoc(doc(db, 'meeting/current'), { roomCode: '1234567', meetingId: MID, updatedAt: now }));
    await assertSucceeds(setDoc(doc(db, 'meetingPublic/current'), { meetingId: MID, updatedAt: now }));
    await assertSucceeds(setDoc(doc(db, 'entryCodes/' + codeHash(MID, '123456')), { meetingId: MID, createdAt: now }));
    await assertFails(deleteDoc(doc(voter(), 'voters/v1')));
  });

  test('현장 입장은 비어 있는 이름에만 가능하고 선택 필드는 거부한다', async () => {
    await seedMeeting();
    await seedVoters();

    await assertSucceeds(claim(voter(), 'voter-1', { voterId: 'v1', badge: 417 }));
    // 같은 이름은 다른 기기가 잡지 못한다.
    await assertFails(claim(voter('voter-2'), 'voter-2', { voterId: 'v1', badge: 418 }));
    // 같은 번호도 다른 사람이 잡지 못한다.
    await assertFails(claim(voter('voter-2'), 'voter-2', { voterId: 'v2', name: '이영희', badge: 417 }));
    // 선택값 필드는 거부한다.
    await assertFails(claim(voter('voter-2'), 'voter-2', { voterId: 'v2', name: '이영희', badge: 418, extra: { choice: '찬성' } }));
    // 한 기기는 한 이름만 잡는다.
    await assertFails(claim(voter(), 'voter-1', { voterId: 'v2', name: '이영희', badge: 419 }));
    await assertSucceeds(claim(voter('voter-2'), 'voter-2', { voterId: 'v2', name: '이영희', badge: 418 }));
  });

  test('입장 코드는 규칙이 확인하고 코드 원문과 입장 문서는 관리자만 읽는다', async () => {
    await seedMeeting();
    await seedVoters();

    // 틀린 코드, 지난 모임 코드, 다른 모임 id 는 거부한다.
    await assertFails(claim(voter(), 'voter-1', { voterId: 'v1', badge: 417, code: '000000' }));
    await seed(async (db) => {
      await setDoc(doc(db, 'entryCodes/' + codeHash(MID2, CODE)), { meetingId: MID2, createdAt: 1 });
    });
    await assertFails(claim(voter(), 'voter-1', { voterId: 'v1', badge: 417, mid: MID2 }));
    await assertSucceeds(claim(voter(), 'voter-1', { voterId: 'v1', badge: 417 }));

    // 코드 원문(meeting)과 해시 문서는 투표자가 읽지 못한다. 모임 id 만 공개된다.
    await assertFails(getDoc(doc(voter(), 'meeting/current')));
    await assertSucceeds(getDoc(doc(admin(), 'meeting/current')));
    await assertFails(getDoc(doc(voter(), 'entryCodes/' + codeHash(MID, CODE))));
    await assertFails(getDocs(collection(voter(), 'entryCodes')));
    await assertSucceeds(getDoc(doc(voter('voter-2'), 'meetingPublic/current')));

    // 입장 문서(이름·번호·uid)는 관리자와 본인만 읽는다.
    await assertFails(getDocs(collection(voter('voter-2'), 'checkins')));
    await assertFails(getDoc(doc(voter('voter-2'), `checkins/${MID}_voter-1`)));
    await assertSucceeds(getDoc(doc(voter(), `checkins/${MID}_voter-1`)));
    const own = await assertSucceeds(getDocs(query(
      collection(voter(), 'checkins'),
      where('meetingId', '==', MID),
      where('authUid', '==', 'voter-1'),
      where('revoked', '==', false),
    )));
    assert.equal(own.size, 1);
    await assertSucceeds(getDocs(collection(admin(), 'checkins')));

    // 이름 선점 문서는 공개지만 uid·번호·이름이 없다.
    const taken = await assertSucceeds(getDoc(doc(voter('voter-2'), `claimedNames/${MID}_v1`)));
    assert.deepEqual(Object.keys(taken.data()).sort(), ['meetingId', 'reissue']);
    // 입장 없이 이름 선점 문서만 만들 수는 없다.
    await assertFails(setDoc(doc(voter('voter-2'), `claimedNames/${MID}_v2`), { meetingId: MID, reissue: false }));
    // 현황판 번호 문서에는 유권자 정보가 없다.
    const lamp = await assertSucceeds(getDoc(doc(voter('voter-2'), `lamps/${MID}_417`)));
    assert.deepEqual(Object.keys(lamp.data()).sort(), ['badge', 'meetingId', 'pollId', 'state']);
  });

  test('새 모임을 열면 지난 모임 입장은 무시되고 같은 이름을 다시 고를 수 있다', async () => {
    await seedMeeting();
    await seedVoters();
    await assertSucceeds(claim(voter(), 'voter-1', { voterId: 'v1', badge: 417 }));

    // 관리자가 새 모임을 연다. 예전 문서는 지우지 않는다.
    const now = Date.now();
    const db = admin();
    const batch = writeBatch(db);
    batch.delete(doc(db, 'entryCodes/' + codeHash(MID, CODE)));
    batch.set(doc(db, 'entryCodes/' + codeHash(MID2, '777777')), { meetingId: MID2, createdAt: now });
    batch.set(doc(db, 'meeting/current'), { roomCode: '777777', meetingId: MID2, updatedAt: now });
    batch.set(doc(db, 'meetingPublic/current'), { meetingId: MID2, updatedAt: now });
    await assertSucceeds(batch.commit());

    // 지난 모임 코드로는 더 입장하지 못한다.
    await assertFails(claim(voter('voter-2'), 'voter-2', { voterId: 'v2', name: '이영희', badge: 500 }));
    // 지난 모임에서 잡은 이름과 번호도 새 모임에서는 비어 있다.
    await assertSucceeds(claim(voter('voter-2'), 'voter-2', { voterId: 'v1', badge: 417, mid: MID2, code: '777777' }));
    const old = await assertSucceeds(getDoc(doc(admin(), `checkins/${MID}_voter-1`)));
    assert.equal(old.data().voterId, 'v1');

    // 새 모임 투표에는 지난 모임 입장으로 투표하지 못한다.
    await seed(async (sdb) => {
      await setDoc(doc(sdb, 'polls/poll1'), pollData({ meetingId: MID2 }));
      await setDoc(doc(sdb, 'polls/poll1/tally/current'), counts());
      await setDoc(doc(sdb, 'polls/poll1/participation/v1'), { voterId: 'v1', voterName: '김철수', status: 'pending', createdAt: 1 });
    });
    await assertFails(rosterVote(voter(), 'voter-1', '찬성'));
    await assertSucceeds(rosterVote(voter('voter-2'), 'voter-2', '찬성'));
  });

  test('다시 연결은 같은 번호로 새 기기에 넘기고 투표한 사람은 다시 투표하지 못한다', async () => {
    await seedMeeting();
    await seedVoters();
    await assertSucceeds(claim(voter(), 'voter-1', { voterId: 'v1', badge: 417 }));
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll1'), pollData({ meetingId: MID }));
      await setDoc(doc(db, 'polls/poll1/tally/current'), counts());
      await setDoc(doc(db, 'polls/poll1/participation/v1'), { voterId: 'v1', voterName: '김철수', status: 'pending', createdAt: 1 });
      await setDoc(doc(db, `lamps/${MID}_417`), { meetingId: MID, badge: 417, state: 'pending', pollId: 'poll1' });
    });

    // 재연결이 열리기 전에는 새 기기가 이름을 가져가지 못한다.
    await assertFails(claim(voter('voter-new'), 'voter-new', { voterId: 'v1', badge: 417, reclaim: true }));
    // 투표자는 재연결을 열지 못한다.
    await assertFails(updateDoc(doc(voter('voter-2'), `claimedNames/${MID}_v1`), { reissue: true }));
    await assertFails(updateDoc(doc(voter(), `claimedNames/${MID}_v1`), { reissue: true }));
    await assertSucceeds(reissue(admin(), 'v1', 417));

    // 회수된 옛 기기는 투표하지 못한다.
    await assertFails(rosterVote(voter(), 'voter-1', '찬성'));
    // 새 기기는 관리자가 정한 번호로만 받는다.
    await assertFails(claim(voter('voter-new'), 'voter-new', { voterId: 'v1', badge: 418, reclaim: true }));
    await assertSucceeds(claim(voter('voter-new'), 'voter-new', { voterId: 'v1', badge: 417, reclaim: true }));
    // 참여 기록은 그대로라 새 기기로 투표하고 번호도 켠다.
    const part = await assertSucceeds(getDoc(doc(admin(), 'polls/poll1/participation/v1')));
    assert.equal(part.data().status, 'pending');
    await assertSucceeds(rosterVote(voter('voter-new'), 'voter-new', '찬성', { lamp: `lamps/${MID}_417` }));

    // 이미 투표한 사람을 또 다른 기기로 넘겨도 다시 투표하지 못한다.
    await assertSucceeds(reissue(admin(), 'v1', 417, 'voter-new'));
    await assertSucceeds(claim(voter('voter-third'), 'voter-third', { voterId: 'v1', badge: 417, reclaim: true }));
    await assertFails(rosterVote(voter('voter-third'), 'voter-third', '반대'));
    let tally;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      tally = (await getDoc(doc(ctx.firestore(), 'polls/poll1/tally/current'))).data();
    });
    assert.deepEqual(tally.counts, { 찬성: 1, 반대: 0, 기권: 0 });
  });

  test('입장 해제 뒤 같은 기기로 다시 입장하고 관리자는 회수만 한다', async () => {
    await seedMeeting();
    await seedVoters();
    await assertSucceeds(claim(voter(), 'voter-1', { voterId: 'v1', badge: 417 }));
    // 관리자는 입장 문서의 회수 표시만 바꾼다. 이름이나 uid 는 바꾸지 못한다.
    await assertFails(updateDoc(doc(admin(), `checkins/${MID}_voter-1`), { voterId: 'v2' }));
    await assertFails(updateDoc(doc(voter(), `checkins/${MID}_voter-1`), { revoked: true, badge: 500 }));
    // 앱의 입장 해제와 같은 쓰기
    const db = admin();
    const batch = writeBatch(db);
    batch.update(doc(db, `checkins/${MID}_voter-1`), { revoked: true });
    batch.delete(doc(db, `claimedNames/${MID}_v1`));
    batch.delete(doc(db, `lamps/${MID}_417`));
    await assertSucceeds(batch.commit());
    // 같은 기기가 다른 이름으로 다시 입장할 수 있다. 다른 기기는 이 입장 문서를 덮어쓰지 못한다.
    await assertSucceeds(claim(voter(), 'voter-1', { voterId: 'v2', name: '이영희', badge: 420 }));
    await assertFails(setDoc(doc(voter('voter-2'), `checkins/${MID}_voter-1`), checkinBody('voter-2', { voterId: 'v1', badge: 421 })));
  });

  test('명단 투표는 한 칸만 올리고 참여 문서에 선택을 남기지 않는다', async () => {
    await seedRoster();

    await assertFails(rosterVote(voter('voter-2'), 'voter-2', '찬성'));
    await assertSucceeds(rosterVote(voter(), 'voter-1', '찬성'));
    await assertFails(rosterVote(voter(), 'voter-1', '반대'));
    await assertFails(getDocs(collection(voter(), 'polls/poll1/participation')));
    await assertSucceeds(getDoc(doc(voter(), 'polls/poll1/participation/v1')));
    // 없는 참여 문서는 '명단에 없음'으로 읽힌다.
    const missing = await assertSucceeds(getDoc(doc(voter(), 'polls/poll1/participation/nobody')));
    assert.equal(missing.exists(), false);
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

  test('진행 중 집계는 관리자도 읽지 못하고 마감 뒤 관리자, 공개 뒤 투표자가 읽는다', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/open-poll'), pollData({ showResults: true }));
      await setDoc(doc(db, 'polls/open-poll/tally/current'), counts({ 찬성: 3 }));
      await setDoc(doc(db, 'polls/closed-shown'), pollData({ status: 'closed', showResults: true, closedAt: 2 }));
      await setDoc(doc(db, 'polls/closed-shown/tally/current'), counts({ 찬성: 2 }));
      await setDoc(doc(db, 'polls/closed-hidden'), pollData({ status: 'closed', showResults: false, closedAt: 2 }));
      await setDoc(doc(db, 'polls/closed-hidden/tally/current'), counts({ 찬성: 2 }));
    });

    await assertFails(getDoc(doc(voter(), 'polls/open-poll/tally/current')));
    // 비밀투표: 진행 중에는 관리자도 선택지별 집계를 읽지 못한다.
    await assertFails(getDoc(doc(admin(), 'polls/open-poll/tally/current')));
    await assertFails(getDoc(doc(shellAdmin(), 'polls/open-poll/tally/current')));
    await assertSucceeds(getDoc(doc(admin(), 'polls/closed-hidden/tally/current')));
    await assertSucceeds(getDoc(doc(admin(), 'polls/closed-shown/tally/current')));
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

  test('현황판 번호는 본인 입장으로만 만들고 투표한 뒤에만 켜진다', async () => {
    await seedMeeting();
    await seedVoters();
    await seed(async (db) => {
      await setDoc(doc(db, 'polls/poll1'), pollData({ meetingId: MID }));
      await setDoc(doc(db, 'polls/poll1/tally/current'), counts());
      await setDoc(doc(db, 'polls/poll1/participation/v1'), { voterId: 'v1', voterName: '김철수', status: 'pending', createdAt: 1 });
    });

    const owner = voter();
    await assertSucceeds(claim(owner, 'voter-1', { voterId: 'v1', badge: 417 }));
    // 본인 입장 번호가 아닌 칸은 만들지 못한다.
    await assertFails(setDoc(doc(voter('voter-2'), `lamps/${MID}_500`), { meetingId: MID, badge: 500, state: 'seated', pollId: '' }));
    await assertFails(updateDoc(doc(owner, `lamps/${MID}_417`), { state: 'voted' }));
    await assertSucceeds(setDoc(doc(admin(), `lamps/${MID}_417`), { meetingId: MID, badge: 417, state: 'pending', pollId: 'poll1' }));
    // 유권자 id 를 번호 문서에 넣을 수 없다.
    await assertFails(setDoc(doc(admin(), `lamps/${MID}_418`), { meetingId: MID, badge: 418, state: 'pending', pollId: 'poll1', voterId: 'v2' }));
    // 다른 사람은 내 번호를 켜지 못한다.
    await assertFails(updateDoc(doc(voter('voter-2'), `lamps/${MID}_417`), { state: 'voted' }));
    await assertSucceeds(rosterVote(owner, 'voter-1', '찬성', { lamp: `lamps/${MID}_417` }));
    const lamp = await assertSucceeds(getDoc(doc(voter('voter-2'), `lamps/${MID}_417`)));
    assert.equal(lamp.data().state, 'voted');
    assert.equal(lamp.data().voterId, undefined);
    await assertFails(deleteDoc(doc(voter(), `lamps/${MID}_417`)));
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

async function seedMeeting(mid = MID, code = CODE) {
  await seed(async (db) => {
    await setDoc(doc(db, 'meeting/current'), { roomCode: code, meetingId: mid, updatedAt: 1 });
    await setDoc(doc(db, 'meetingPublic/current'), { meetingId: mid, updatedAt: 1 });
    await setDoc(doc(db, 'entryCodes/' + codeHash(mid, code)), { meetingId: mid, createdAt: 1 });
  });
}

async function seedVoters() {
  await seed(async (db) => {
    await setDoc(doc(db, 'voters/v1'), { name: '김철수', externalQrId: '', active: true, createdAt: 1 });
    await setDoc(doc(db, 'voters/v2'), { name: '이영희', externalQrId: '', active: true, createdAt: 1 });
  });
}

function checkinBody(uid, { voterId, name = '김철수', badge, code = CODE, mid = MID, extra = {} }) {
  return {
    meetingId: mid,
    voterId,
    voterName: name,
    claimedAt: Date.now(),
    claimToken: UUID,
    authUid: uid,
    badge,
    codeHash: codeHash(mid, code),
    revoked: false,
    ...extra,
  };
}

/** 앱의 claimRosterSeat 와 같은 쓰기. reclaim 이면 다시 연결 경로. */
function claim(db, uid, opts) {
  const mid = opts.mid ?? MID;
  return runTransaction(db, async (tx) => {
    tx.set(doc(db, `checkins/${mid}_${uid}`), checkinBody(uid, opts));
    if (opts.reclaim) {
      tx.update(doc(db, `claimedNames/${mid}_${opts.voterId}`), { reissue: false });
      tx.delete(doc(db, `reissues/${mid}_${opts.voterId}`));
    } else {
      tx.set(doc(db, `claimedNames/${mid}_${opts.voterId}`), { meetingId: mid, reissue: false });
      tx.set(doc(db, `lamps/${mid}_${opts.badge}`), { meetingId: mid, badge: opts.badge, state: 'seated', pollId: '' });
    }
  });
}

/** 앱의 reissueRosterClaim 와 같은 쓰기. */
function reissue(db, voterId, badge, ownerUid = 'voter-1', mid = MID) {
  return runTransaction(db, async (tx) => {
    tx.update(doc(db, `checkins/${mid}_${ownerUid}`), { revoked: true });
    tx.update(doc(db, `claimedNames/${mid}_${voterId}`), { reissue: true });
    tx.set(doc(db, `reissues/${mid}_${voterId}`), { meetingId: mid, voterId, badge, createdAt: Date.now() });
  });
}

async function seedRoster() {
  await seed(async (db) => {
    await setDoc(doc(db, 'polls/poll1'), pollData({ meetingId: MID }));
    await setDoc(doc(db, 'polls/poll1/tally/current'), counts());
    await setDoc(doc(db, 'voters/v1'), { name: '김철수', externalQrId: '', active: true, createdAt: 1 });
    await setDoc(doc(db, `checkins/${MID}_voter-1`), checkinBody('voter-1', { voterId: 'v1', badge: 417 }));
    await setDoc(doc(db, 'polls/poll1/participation/v1'), {
      voterId: 'v1',
      voterName: '김철수',
      status: 'pending',
      createdAt: 1,
    });
  });
}

function rosterVote(db, uid, choice, { lamp } = {}) {
  return runTransaction(db, async (tx) => {
    tx.update(doc(db, 'polls/poll1/participation/v1'), {
      status: 'completed',
      completedAt: Date.now(),
    });
    tx.update(doc(db, 'polls/poll1'), { castCount: increment(1) });
    tx.update(doc(db, 'polls/poll1/tally/current'), { [`counts.${choice}`]: increment(1) });
    tx.set(doc(db, `polls/poll1/voteGuards/${uid}`), { voterId: 'v1' });
    if (lamp) tx.update(doc(db, lamp), { state: 'voted' });
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
