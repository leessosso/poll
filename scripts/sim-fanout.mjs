/**
 * 로컬 Firestore 에뮬레이터에서 120명 × 8투표의 문서 읽기·쓰기를 잰다.
 * dcc-poll, dcc-poll-1ch 에는 접속하지 않는다.
 *
 * before: main 의 규칙과 같이 표마다 polls 문서의 castCount 를 올리고, 투표자·관리자·현황판이 그 문서를 구독한다.
 * after: 이 브랜치와 같이 progress/current 만 올리고, 투표자는 progress 를 구독하지 않는다.
 *
 * 읽기 = 스냅샷 docChanges (캐시·미커밋 제외) + 트랜잭션 안 get 횟수.
 * 쓰기 = 커밋된 문서 쓰기. 트랜잭션이 재시도돼도 쓰기는 한 번만 센다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  limit,
  where,
  getDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-cost-sim';
const FORBIDDEN = ['dcc-poll', 'dcc-poll-1ch'];
const VOTERS = Number(process.env.SIM_VOTERS ?? 120);
const POLLS = Number(process.env.SIM_POLLS ?? 8);
const POOL = Number(process.env.SIM_POOL ?? 24);
const MID = 'mtg_11111111-2222-4333-8444-555555555555';
const CODE = '482913';
const mode = process.argv[2];

if (mode !== 'before' && mode !== 'after') {
  console.error('사용법: node scripts/sim-fanout.mjs before|after');
  process.exit(1);
}
if (FORBIDDEN.includes(PROJECT_ID)) {
  console.error('운영 프로젝트에는 접속하지 않습니다.');
  process.exit(1);
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST 가 없습니다. 에뮬레이터 밖에서 실행하지 않습니다.');
  process.exit(1);
}

function codeHash(meetingId, code) {
  return createHash('sha256').update(`${meetingId}:${code}`).digest('hex');
}

function emulatorHost() {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  return { host, port: Number(port) };
}

function rulesFor(which) {
  if (which === 'after') return readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  return execSync('git show main:firestore.rules', { encoding: 'utf8' });
}

function emptyStats() {
  return {
    voterListen: 0,
    adminListen: 0,
    boardListen: 0,
    txReads: 0,
    txAttempts: 0,
    writes: 0,
  };
}

function addStats(total, delta) {
  for (const key of Object.keys(total)) total[key] += delta[key];
}

function snapshot(stats) {
  return { ...stats };
}

function diff(after, before) {
  const out = {};
  for (const key of Object.keys(after)) out[key] = after[key] - before[key];
  return out;
}

function readsOf(stats) {
  return stats.voterListen + stats.adminListen + stats.boardListen + stats.txReads;
}

let stats = emptyStats();

function isDocRef(target) {
  return typeof target.id === 'string' && typeof target.path === 'string';
}

function watch(target, bucket) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) reject(new Error(`스냅샷 대기 시간 초과: ${bucket}`));
    }, 15000);
    const done = (unsub) => {
      settled = true;
      clearTimeout(timer);
      resolve(unsub);
    };
    const unsub = onSnapshot(
      target,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
        if (isDocRef(target)) {
          // 없는 문서의 첫 스냅샷은 읽기로 치지 않는다. 이후 생성·변경은 1건이다.
          if (!settled) {
            if (snap.exists()) stats[bucket] += 1;
            done(unsub);
            return;
          }
          stats[bucket] += 1;
          return;
        }
        stats[bucket] += snap.docChanges().length;
        if (!settled) done(unsub);
      },
      (err) => {
        if (!settled) {
          clearTimeout(timer);
          reject(err);
        } else console.error(`[${bucket}]`, err.message);
      },
    );
  });
}

async function settle() {
  let last = -1;
  for (let i = 0; i < 40; i += 1) {
    const now = stats.voterListen + stats.adminListen + stats.boardListen;
    if (now === last) return;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function pool(items, size, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
}

async function main() {
  const started = Date.now();
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: rulesFor(mode), ...emulatorHost() },
  });

  const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
  const boardDb = testEnv.authenticatedContext('board-1').firestore();
  const voters = Array.from({ length: VOTERS }, (_, index) => {
    const uid = `voter-${index}`;
    return {
      index,
      uid,
      badge: 100 + index,
      db: testEnv.authenticatedContext(uid).firestore(),
    };
  });

  const unsubs = [];
  const track = async (target, bucket) => {
    unsubs.push(await watch(target, bucket));
  };

  await track(doc(adminDb, 'meetingPublic/current'), 'adminListen');
  await track(query(collection(adminDb, 'polls'), orderBy('createdAt', 'desc')), 'adminListen');
  await track(
    query(collection(adminDb, 'checkins'), where('meetingId', '==', MID), where('revoked', '==', false)),
    'adminListen',
  );
  await track(query(collection(adminDb, 'lamps'), where('meetingId', '==', MID)), 'adminListen');
  await track(doc(boardDb, 'meetingPublic/current'), 'boardListen');
  await track(doc(boardDb, 'boardState/current'), 'boardListen');
  await track(query(collection(boardDb, 'polls'), orderBy('createdAt', 'desc'), limit(25)), 'boardListen');
  await track(query(collection(boardDb, 'lamps'), where('meetingId', '==', MID)), 'boardListen');

  await pool(voters, POOL, async (voter) => {
    await track(doc(voter.db, 'meetingPublic/current'), 'voterListen');
    await track(query(collection(voter.db, 'polls'), orderBy('createdAt', 'desc'), limit(25)), 'voterListen');
    await track(doc(voter.db, 'checkins', `${MID}_${voter.uid}`), 'voterListen');
  });

  const entryMark = snapshot(stats);
  const now = Date.now();
  const meetingBatch = writeBatch(adminDb);
  meetingBatch.set(doc(adminDb, 'meeting/current'), { roomCode: CODE, meetingId: MID, updatedAt: now });
  meetingBatch.set(doc(adminDb, 'meetingPublic/current'), { meetingId: MID, updatedAt: now });
  meetingBatch.set(doc(adminDb, 'entryCodes/' + codeHash(MID, CODE)), { meetingId: MID, createdAt: now });
  meetingBatch.set(doc(adminDb, 'boardState/current'), { mode: 'results', updatedAt: now });
  await meetingBatch.commit();
  stats.writes += 4;

  await pool(voters, POOL, async (voter) => {
    let attempts = 0;
    await runTransaction(voter.db, async (tx) => {
      attempts += 1;
      await tx.get(doc(voter.db, 'checkins', `${MID}_${voter.uid}`));
      await tx.get(doc(voter.db, 'lamps', `${MID}_${voter.badge}`));
      stats.txReads += 2;
      const claimedAt = Date.now();
      tx.set(doc(voter.db, 'checkins', `${MID}_${voter.uid}`), {
        meetingId: MID,
        voterId: voter.uid,
        voterName: `${voter.badge}번`,
        claimedAt,
        claimToken: randomUUID(),
        authUid: voter.uid,
        badge: voter.badge,
        codeHash: codeHash(MID, CODE),
        revoked: false,
      });
      tx.set(doc(voter.db, 'lamps', `${MID}_${voter.badge}`), {
        meetingId: MID,
        badge: voter.badge,
        state: 'seated',
        pollId: '',
      });
    });
    stats.txAttempts += attempts;
    stats.writes += 2;
  });
  await settle();
  const entry = diff(stats, entryMark);

  const perPoll = [];
  for (let pollIndex = 0; pollIndex < POLLS; pollIndex += 1) {
    const pollMark = snapshot(stats);
    const pollId = `poll-${pollIndex}`;
    const createdAt = Date.now() + pollIndex;
    const startedAt = Date.now();
    const endsAt = startedAt + 60 * 60 * 1000;
    const poll = {
      title: `안건 ${pollIndex + 1}`,
      type: 'yesno',
      options: ['찬성', '반대', '기권'],
      status: 'waiting',
      createdAt,
      showResults: false,
      eligibilityMode: 'roster',
      allowAbstain: true,
      eventId: '',
      durationSeconds: 180,
      castCount: 0,
      passRatio: 0.5,
      meetingId: MID,
    };
    const create = writeBatch(adminDb);
    create.set(doc(adminDb, 'polls', pollId), poll);
    create.set(doc(adminDb, 'polls', pollId, 'tally', 'current'), {
      counts: { 찬성: 0, 반대: 0, 기권: 0 },
    });
    let createWrites = 2;
    if (mode === 'after') {
      create.set(doc(adminDb, 'polls', pollId, 'progress', 'current'), { castCount: 0 });
      createWrites += 1;
    }
    await create.commit();
    stats.writes += createWrites;

    const start = writeBatch(adminDb);
    voters.forEach((voter) => {
      start.set(doc(adminDb, 'polls', pollId, 'participation', voter.uid), {
        voterId: voter.uid,
        voterName: `${voter.badge}번`,
        status: 'pending',
        createdAt: startedAt,
      });
      start.set(doc(adminDb, 'lamps', `${MID}_${voter.badge}`), {
        meetingId: MID,
        badge: voter.badge,
        state: 'pending',
        pollId,
      });
    });
    start.update(doc(adminDb, 'polls', pollId), {
      status: 'active',
      startedAt,
      endsAt,
      durationSeconds: 180,
      expectedCount: VOTERS,
      meetingId: MID,
    });
    if (mode === 'after') start.set(doc(adminDb, 'polls', pollId, 'progress', 'current'), { castCount: 0 });
    await start.commit();
    stats.writes += VOTERS * 2 + 1 + (mode === 'after' ? 1 : 0);
    await settle();

    const participationUnsubs = [];
    participationUnsubs.push(
      await watch(
        query(collection(adminDb, 'polls', pollId, 'participation'), orderBy('voterName', 'asc')),
        'adminListen',
      ),
    );
    if (mode === 'after') {
      participationUnsubs.push(await watch(doc(adminDb, 'polls', pollId, 'progress', 'current'), 'adminListen'));
    }
    await pool(voters, POOL, async (voter) => {
      participationUnsubs.push(
        await watch(doc(voter.db, 'polls', pollId, 'participation', voter.uid), 'voterListen'),
      );
    });

    let voteFailures = 0;
    await pool(voters, POOL, async (voter) => {
      let committed = false;
      let lastMessage = '';
      for (let outer = 0; outer < 6 && !committed; outer += 1) {
        let attempts = 0;
        try {
          await runTransaction(voter.db, async (tx) => {
            attempts += 1;
            const checkinRef = doc(voter.db, 'checkins', `${MID}_${voter.uid}`);
            const pollRef = doc(voter.db, 'polls', pollId);
            const partRef = doc(voter.db, 'polls', pollId, 'participation', voter.uid);
            const lampRef = doc(voter.db, 'lamps', `${MID}_${voter.badge}`);
            await tx.get(checkinRef);
            await tx.get(pollRef);
            await tx.get(partRef);
            await tx.get(lampRef);
            stats.txReads += 4;
            tx.update(partRef, { status: 'completed', completedAt: Date.now() });
            tx.update(doc(voter.db, 'polls', pollId, 'tally', 'current'), { 'counts.찬성': increment(1) });
            tx.set(doc(voter.db, 'polls', pollId, 'voteGuards', voter.uid), { voterId: voter.uid });
            tx.update(lampRef, { state: 'voted' });
            if (mode === 'before') tx.update(pollRef, { castCount: increment(1) });
            else tx.update(doc(voter.db, 'polls', pollId, 'progress', 'current'), { castCount: increment(1) });
          });
          stats.txAttempts += attempts;
          stats.writes += 5;
          committed = true;
        } catch (err) {
          stats.txAttempts += attempts;
          lastMessage = err instanceof Error ? err.message : String(err);
          if (outer > 0 && lastMessage.includes('PERMISSION_DENIED')) {
            stats.writes += 5;
            committed = true;
            break;
          }
          const contended = lastMessage.includes('FAILED_PRECONDITION') || lastMessage.includes('ABORTED');
          if (!contended || outer === 5) break;
          await new Promise((resolve) => setTimeout(resolve, 30 * (outer + 1)));
        }
      }
      if (!committed) {
        voteFailures += 1;
        console.error(`vote ${pollId} ${voter.uid}`, lastMessage);
      }
    });
    await settle();

    const closedAt = Date.now();
    if (mode === 'before') {
      await runTransaction(adminDb, async (tx) => {
        await tx.get(doc(adminDb, 'polls', pollId));
        stats.txReads += 1;
        tx.update(doc(adminDb, 'polls', pollId), { status: 'closed', closedAt });
      });
      stats.txAttempts += 1;
      stats.writes += 1;
    } else {
      await runTransaction(adminDb, async (tx) => {
        await tx.get(doc(adminDb, 'polls', pollId));
        const progressSnap = await tx.get(doc(adminDb, 'polls', pollId, 'progress', 'current'));
        stats.txReads += 2;
        const castCount = progressSnap.data().castCount;
        tx.update(doc(adminDb, 'polls', pollId), { status: 'closed', closedAt, castCount });
        tx.update(doc(adminDb, 'polls', pollId, 'progress', 'current'), { castCount });
      });
      stats.txAttempts += 1;
      stats.writes += 2;
    }
    await settle();
    participationUnsubs.forEach((unsub) => unsub());

    const pollStats = diff(stats, pollMark);
    perPoll.push({
      pollId,
      voteFailures,
      reads: readsOf(pollStats),
      writes: pollStats.writes,
      ...pollStats,
      retries: pollStats.txAttempts - VOTERS - 1,
    });
    if (voteFailures > 0) break;
  }

  let verify = {};
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const lastId = `poll-${perPoll.length - 1}`;
    const pollSnap = await getDoc(doc(db, 'polls', lastId));
    const tallySnap = await getDoc(doc(db, 'polls', lastId, 'tally', 'current'));
    const progressSnap = await getDoc(doc(db, 'polls', lastId, 'progress', 'current'));
    const counts = tallySnap.data()?.counts ?? {};
    verify = {
      pollCastCount: pollSnap.data()?.castCount ?? null,
      pollStatus: pollSnap.data()?.status ?? null,
      tallyYes: counts['찬성'] ?? null,
      progressCastCount: progressSnap.exists() ? progressSnap.data().castCount : null,
    };
  });

  unsubs.forEach((unsub) => unsub());
  await testEnv.cleanup();

  const pollReads = perPoll.reduce((sum, poll) => sum + poll.reads, 0);
  const pollWrites = perPoll.reduce((sum, poll) => sum + poll.writes, 0);
  const result = {
    mode,
    projectId: PROJECT_ID,
    voters: VOTERS,
    polls: perPoll.length,
    entry: { reads: readsOf(entry), writes: entry.writes, ...entry },
    perPoll,
    perPollAverage: {
      reads: perPoll.length ? pollReads / perPoll.length : 0,
      writes: perPoll.length ? pollWrites / perPoll.length : 0,
    },
    pollsTotal: { reads: pollReads, writes: pollWrites },
    grandTotal: { reads: readsOf(stats), writes: stats.writes },
    verify,
    elapsedMs: Date.now() - started,
  };
  const text = JSON.stringify(result);
  writeFileSync(`/tmp/fanout-${mode}.json`, text);
  console.log(text);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
