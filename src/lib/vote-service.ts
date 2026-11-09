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
  type WriteBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { getDefaultDurationSeconds, getOptions } from './poll-utils';
import type { AttendanceSession, Poll, RosterClaim, Voter, VoterSession } from '../types';

const MEETING_DOC = doc(db, 'meeting', 'current');

const DEFAULT_EVENT_ID = 'elder-vote';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BADGE_MIN = 100;
const BADGE_MAX = 999;

class BadgeTakenError extends Error {
  constructor() {
    super('입장 번호가 겹쳤습니다.');
    this.name = 'BadgeTakenError';
  }
}

function hasCheckinOwner(data: Record<string, unknown> | undefined): boolean {
  return typeof data?.authUid === 'string' && data.authUid.length > 0;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('인증이 필요합니다. 화면을 새로고침한 뒤 다시 시도해 주세요.');
  return uid;
}

function tallyRef(pollId: string) {
  return doc(db, 'polls', pollId, 'tally', 'current');
}

function lampRef(badge: number) {
  return doc(db, 'lamps', String(badge));
}

function badgeOf(data: Record<string, unknown> | undefined): number | null {
  const badge = data?.badge;
  return typeof badge === 'number' && Number.isInteger(badge) && badge >= BADGE_MIN && badge <= BADGE_MAX
    ? badge
    : null;
}

function pickBadge(used: Set<number>): number {
  const span = BADGE_MAX - BADGE_MIN + 1;
  if (used.size >= span) throw new Error('입장 번호를 더 만들 수 없습니다.');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const badge = BADGE_MIN + Math.floor(Math.random() * span);
    if (!used.has(badge)) return badge;
  }
  for (let badge = BADGE_MIN; badge <= BADGE_MAX; badge += 1) {
    if (!used.has(badge)) return badge;
  }
  throw new Error('입장 번호를 더 만들 수 없습니다.');
}

async function commitOps(ops: Array<(batch: WriteBatch) => void>): Promise<void> {
  const size = 400;
  for (let index = 0; index < ops.length; index += size) {
    const batch = writeBatch(db);
    ops.slice(index, index + size).forEach((op) => op(batch));
    await batch.commit();
  }
}

function emptyCounts(poll: Poll): Record<string, number> {
  return Object.fromEntries(getOptions(poll).map((option) => [option, 0]));
}

function assertUnderHeadcount(poll: Poll): void {
  if (typeof poll.expectedCount === 'number' && poll.castCount >= poll.expectedCount) {
    throw new Error('확정 인원만큼 투표가 끝났습니다.');
  }
}

function permissionError(err: unknown, fallback: string): Error {
  const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return new Error(fallback);
  }
  return err instanceof Error ? err : new Error(fallback);
}

export function getEventId(poll: Poll): string {
  return poll.eventId?.trim() || DEFAULT_EVENT_ID;
}

export async function createAttendanceSession(voter: Voter, eventId = DEFAULT_EVENT_ID): Promise<string> {
  const now = Date.now();
  const sessionId = `session_${crypto.randomUUID()}`;
  const session: AttendanceSession = {
    id: sessionId,
    eventId,
    voterId: voter.id,
    voterName: voter.name,
    checkedInAt: now,
    expiresAt: now + SESSION_TTL_MS,
    status: 'active',
  };

  await writeBatch(db)
    .set(doc(db, 'attendanceRawEvents', `event_${crypto.randomUUID()}`), {
      eventId,
      rawQrValue: voter.externalQrId ?? voter.memberNo ?? voter.id,
      receivedAt: now,
      matchedVoterId: voter.id,
      status: 'matched',
    })
    .set(doc(db, 'attendanceSessions', sessionId), session)
    .set(doc(db, 'attendanceOutbox', `outbox_${crypto.randomUUID()}`), {
      eventId,
      voterId: voter.id,
      attendanceSessionId: sessionId,
      payload: { voterId: voter.id, voterName: voter.name, checkedInAt: now },
      status: 'pending',
      retryCount: 0,
    })
    .commit();

  const activePollsSnap = await getDocs(
    query(
      collection(db, 'polls'),
      where('status', '==', 'active'),
      where('eligibilityMode', '==', 'attendance'),
      where('eventId', '==', eventId),
    ),
  );

  if (!activePollsSnap.empty) {
    const participationBatch = writeBatch(db);
    activePollsSnap.docs.forEach((pollDoc) => {
      participationBatch.set(
        doc(db, 'polls', pollDoc.id, 'participation', voter.id),
        {
          voterId: voter.id,
          voterName: voter.name,
          status: 'pending',
          createdAt: now,
        },
        { merge: true },
      );
    });
    await participationBatch.commit();
  }

  return sessionId;
}

export async function startPollWithParticipation(poll: Poll, expectedCount: number): Promise<void> {
  if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    throw new Error('확정 인원은 1명 이상이어야 합니다.');
  }
  const now = Date.now();
  const durationSeconds = getDefaultDurationSeconds(poll);
  const endsAt = now + durationSeconds * 1000;
  const ops: Array<(batch: WriteBatch) => void> = [];

  if (poll.eligibilityMode === 'roster') {
    const [checkinsSnap, lampsSnap] = await Promise.all([
      getDocs(collection(db, 'checkins')),
      getDocs(collection(db, 'lamps')),
    ]);
    const used = new Set<number>();
    lampsSnap.docs.forEach((lampDoc) => {
      const badge = Number(lampDoc.id);
      if (Number.isInteger(badge)) used.add(badge);
    });
    checkinsSnap.docs.forEach((checkinDoc) => {
      const badge = badgeOf(checkinDoc.data());
      if (badge) used.add(badge);
    });

    const liveBadges = new Set<string>();
    checkinsSnap.docs.forEach((checkinDoc) => {
      const data = checkinDoc.data();
      // authUid 없는 예전 체크인은 자리 점유가 아니므로 이번 투표 인원에 넣지 않는다.
      if (!hasCheckinOwner(data)) return;
      const voterId = typeof data.voterId === 'string' ? data.voterId : checkinDoc.id;
      let badge = badgeOf(data);
      if (!badge) {
        badge = pickBadge(used);
        used.add(badge);
        ops.push((batch) => batch.update(checkinDoc.ref, { badge }));
      }
      liveBadges.add(String(badge));
      ops.push((batch) => batch.set(doc(db, 'polls', poll.id, 'participation', checkinDoc.id), {
        voterId,
        voterName: data.voterName ?? '이름 없음',
        status: 'pending',
        createdAt: now,
      }));
      ops.push((batch) => batch.set(lampRef(badge), {
        badge,
        state: 'pending',
        pollId: poll.id,
        voterId,
      }));
    });
    lampsSnap.docs.forEach((lampDoc) => {
      if (!liveBadges.has(lampDoc.id)) ops.push((batch) => batch.delete(lampDoc.ref));
    });
  }

  if (poll.eligibilityMode === 'attendance') {
    const sessionsSnap = await getDocs(
      query(
        collection(db, 'attendanceSessions'),
        where('eventId', '==', getEventId(poll)),
        where('status', '==', 'active'),
      ),
    );

    const voterIds = new Set<string>();
    sessionsSnap.docs.forEach((sessionDoc) => {
      const session = { id: sessionDoc.id, ...sessionDoc.data() } as AttendanceSession;
      if (session.expiresAt <= now || voterIds.has(session.voterId)) return;
      voterIds.add(session.voterId);
      ops.push((batch) => batch.set(doc(db, 'polls', poll.id, 'participation', session.voterId), {
        voterId: session.voterId,
        voterName: session.voterName,
        status: 'pending',
        createdAt: now,
      }));
    });
  }

  ops.push((batch) => batch.set(tallyRef(poll.id), { counts: emptyCounts(poll) }));
  ops.push((batch) => batch.update(doc(db, 'polls', poll.id), {
    status: 'active',
    startedAt: now,
    endsAt,
    durationSeconds,
    expectedCount,
  }));
  await commitOps(ops);
}

export async function finalizePoll(poll: Poll): Promise<void> {
  const now = Date.now();
  const pollRef = doc(db, 'polls', poll.id);
  const tracksParticipation = poll.eligibilityMode === 'attendance' || poll.eligibilityMode === 'roster';
  const pendingRefs = tracksParticipation
    ? (
        await getDocs(
          query(collection(db, 'polls', poll.id, 'participation'), where('status', '==', 'pending')),
        )
      ).docs.map((participantDoc) => participantDoc.ref)
    : [];

  await runTransaction(db, async (tx) => {
    const pollSnap = await tx.get(pollRef);
    if (!pollSnap.exists() || pollSnap.data().status !== 'active') return;

    const stillPending = [];
    for (const participantRef of pendingRefs) {
      const participantSnap = await tx.get(participantRef);
      if (participantSnap.exists() && participantSnap.data().status === 'pending') {
        stillPending.push(participantSnap.ref);
      }
    }

    for (const participantRef of stillPending) {
      tx.update(participantRef, { status: 'completed', completedAt: now });
    }

    const updates: Record<string, unknown> = { status: 'closed', closedAt: now };
    if (stillPending.length > 0 && poll.allowAbstain) {
      updates.castCount = increment(stillPending.length);
      tx.update(tallyRef(poll.id), { 'counts.기권': increment(stillPending.length) });
    }
    tx.update(pollRef, updates);
  });
}

export async function castAttendanceVote(
  poll: Poll,
  choice: string,
  session: VoterSession,
): Promise<void> {
  assertUnderHeadcount(poll);
  const now = Date.now();
  const uid = requireUid();
  const sessionRef = doc(db, 'attendanceSessions', session.sessionId);
  const pollRef = doc(db, 'polls', poll.id);
  const participantRef = doc(db, 'polls', poll.id, 'participation', session.voterId);

  try {
  await runTransaction(db, async (tx) => {
    const [sessionSnap, pollSnap, participantSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(pollRef),
      tx.get(participantRef),
    ]);

    if (!sessionSnap.exists()) throw new Error('출석 세션을 찾을 수 없습니다.');
    const activeSession = { id: sessionSnap.id, ...sessionSnap.data() } as AttendanceSession;
    if (activeSession.status !== 'active' || activeSession.expiresAt <= now) {
      throw new Error('출석 세션이 만료되었습니다.');
    }
    if (activeSession.voterId !== session.voterId) {
      throw new Error('투표 세션 정보가 일치하지 않습니다.');
    }
    if (!pollSnap.exists()) throw new Error('투표를 찾을 수 없습니다.');

    const currentPoll = { id: pollSnap.id, ...pollSnap.data() } as Poll;
    if (currentPoll.status !== 'active') throw new Error('진행 중인 투표가 아닙니다.');
    if (currentPoll.endsAt && now >= currentPoll.endsAt) throw new Error('투표 시간이 종료되었습니다.');
    if (!getOptions(currentPoll).includes(choice)) throw new Error('선택할 수 없는 항목입니다.');
    if (participantSnap.exists() && participantSnap.data().status === 'completed') {
      throw new Error('이미 투표를 완료했습니다.');
    }

    tx.set(
      participantRef,
      {
        voterId: session.voterId,
        voterName: session.voterName,
        status: 'completed',
        completedAt: now,
      },
      { merge: true },
    );
    tx.update(pollRef, { castCount: increment(1) });
    tx.update(tallyRef(poll.id), { [`counts.${choice}`]: increment(1) });
    tx.set(doc(db, 'polls', poll.id, 'voteGuards', uid), {
      voterId: session.voterId,
      sessionId: session.sessionId,
    });
  });
  } catch (err) {
    throw permissionError(err, '투표를 저장하지 못했습니다. 이미 참여했거나 세션이 끝났을 수 있습니다.');
  }
}

export async function updateExpectedCount(pollId: string, expectedCount: number): Promise<void> {
  if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    throw new Error('확정 인원은 1명 이상이어야 합니다.');
  }
  await updateDoc(doc(db, 'polls', pollId), { expectedCount });
}

export async function togglePollResults(poll: Poll): Promise<void> {
  await updateDoc(doc(db, 'polls', poll.id), { showResults: !poll.showResults });
}

export function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function updateRoomCode(roomCode: string): Promise<void> {
  await setDoc(MEETING_DOC, { roomCode, updatedAt: Date.now() }, { merge: true });
}

export async function claimRosterSeat(voter: Voter, roomCode: string): Promise<RosterClaim> {
  const claimToken = crypto.randomUUID();
  const normalizedCode = roomCode.trim();
  const used = new Set<number>();
  const existing = await getDocs(collection(db, 'lamps'));
  existing.docs.forEach((lampDoc) => {
    const badge = Number(lampDoc.id);
    if (Number.isInteger(badge)) used.add(badge);
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const badge = pickBadge(used);
    try {
      await writeRosterClaim(voter, normalizedCode, claimToken, badge);
      return { voterId: voter.id, voterName: voter.name, claimToken, badge };
    } catch (err) {
      if (!(err instanceof BadgeTakenError)) throw err;
      used.add(badge);
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('입장 번호를 정하지 못했습니다.');
}

async function writeRosterClaim(voter: Voter, roomCode: string, claimToken: string, badge: number): Promise<void> {
  const checkinRef = doc(db, 'checkins', voter.id);
  const seatRef = lampRef(badge);

  await runTransaction(db, async (tx) => {
    const [meetingSnap, checkinSnap, seatSnap] = await Promise.all([
      tx.get(MEETING_DOC),
      tx.get(checkinRef),
      tx.get(seatRef),
    ]);
    const expected = meetingSnap.exists() ? String(meetingSnap.data().roomCode ?? '') : '';
    if (!expected || expected !== roomCode) throw new Error('입장 코드가 맞지 않습니다.');
    if (checkinSnap.exists() && hasCheckinOwner(checkinSnap.data())) {
      throw new Error('이미 다른 분이 선택한 이름입니다.');
    }
    if (seatSnap.exists()) throw new BadgeTakenError();

    const authUid = requireUid();
    tx.set(checkinRef, {
      voterId: voter.id,
      voterName: voter.name,
      claimedAt: Date.now(),
      claimToken,
      authUid,
      badge,
    });
    tx.set(seatRef, {
      badge,
      state: 'seated',
      pollId: '',
      voterId: voter.id,
    });
  });
}

export async function revokeAttendanceSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, 'attendanceSessions', sessionId));
}

async function deleteAttendanceSessions(voterId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'attendanceSessions'), where('voterId', '==', voterId)),
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((sessionDoc) => batch.delete(sessionDoc.ref));
  await batch.commit();
}

export async function removeVoterFromRoster(voterId: string, activePoll: Poll | null): Promise<void> {
  const voterRef = doc(db, 'voters', voterId);
  const checkinRef = doc(db, 'checkins', voterId);
  const tracksParticipation =
    activePoll && (activePoll.eligibilityMode === 'roster' || activePoll.eligibilityMode === 'attendance');

  const directoryRef = doc(db, 'voterDirectory', voterId);
  const checkinSnap = await getDoc(checkinRef);
  const badge = badgeOf(checkinSnap.data());
  const seatRef = badge ? lampRef(badge) : null;

  if (!tracksParticipation) {
    const batch = writeBatch(db);
    batch.delete(voterRef);
    batch.delete(directoryRef);
    batch.delete(checkinRef);
    if (seatRef) batch.delete(seatRef);
    await batch.commit();
    await deleteAttendanceSessions(voterId);
    return;
  }

  const participantRef = doc(db, 'polls', activePoll.id, 'participation', voterId);
  await runTransaction(db, async (tx) => {
    const [participantSnap, seatSnap] = await Promise.all([
      tx.get(participantRef),
      seatRef ? tx.get(seatRef) : Promise.resolve(null),
    ]);
    const completed = participantSnap.exists() && participantSnap.data().status === 'completed';
    tx.delete(voterRef);
    tx.delete(directoryRef);
    if (!completed) {
      if (participantSnap.exists()) tx.delete(participantRef);
      tx.delete(checkinRef);
      if (seatSnap?.exists()) tx.delete(seatSnap.ref);
    }
  });
  await deleteAttendanceSessions(voterId);
}

export async function releaseRosterClaim(voterId: string, activePoll: Poll | null): Promise<void> {
  const checkinRef = doc(db, 'checkins', voterId);
  const tracksParticipation =
    activePoll && (activePoll.eligibilityMode === 'roster' || activePoll.eligibilityMode === 'attendance');

  const checkinSnap = await getDoc(checkinRef);
  const badge = badgeOf(checkinSnap.data());
  const seatRef = badge ? lampRef(badge) : null;

  if (!tracksParticipation) {
    const batch = writeBatch(db);
    batch.delete(checkinRef);
    if (seatRef) batch.delete(seatRef);
    await batch.commit();
    return;
  }

  const participantRef = doc(db, 'polls', activePoll.id, 'participation', voterId);
  await runTransaction(db, async (tx) => {
    const [participantSnap, seatSnap] = await Promise.all([
      tx.get(participantRef),
      seatRef ? tx.get(seatRef) : Promise.resolve(null),
    ]);
    if (participantSnap.exists() && participantSnap.data().status === 'completed') {
      throw new Error('이미 투표를 완료한 이름은 해제할 수 없습니다.');
    }
    if (participantSnap.exists()) tx.delete(participantRef);
    tx.delete(checkinRef);
    if (seatSnap?.exists()) tx.delete(seatSnap.ref);
  });
}

export async function castRosterVote(poll: Poll, choice: string, claim: RosterClaim): Promise<void> {
  assertUnderHeadcount(poll);
  const now = Date.now();
  const uid = requireUid();
  const pollRef = doc(db, 'polls', poll.id);
  const checkinRef = doc(db, 'checkins', claim.voterId);
  const participantRef = doc(db, 'polls', poll.id, 'participation', claim.voterId);

  try {
  await runTransaction(db, async (tx) => {
    const [checkinSnap, pollSnap, participantSnap] = await Promise.all([
      tx.get(checkinRef),
      tx.get(pollRef),
      tx.get(participantRef),
    ]);

    if (!checkinSnap.exists() || checkinSnap.data().claimToken !== claim.claimToken) {
      throw new Error('입장 정보가 없습니다. 다시 이름을 선택해 주세요.');
    }
    if (!pollSnap.exists()) throw new Error('투표를 찾을 수 없습니다.');

    const currentPoll = { id: pollSnap.id, ...pollSnap.data() } as Poll;
    if (currentPoll.status !== 'active') throw new Error('진행 중인 투표가 아닙니다.');
    if (currentPoll.endsAt && now >= currentPoll.endsAt) throw new Error('투표 시간이 종료되었습니다.');
    if (!getOptions(currentPoll).includes(choice)) throw new Error('선택할 수 없는 항목입니다.');
    if (!participantSnap.exists()) throw new Error('이번 투표 명단에 없습니다.');
    if (participantSnap.data().status === 'completed') throw new Error('이미 투표를 완료했습니다.');

    const badge = badgeOf(checkinSnap.data());
    const seatSnap = badge ? await tx.get(lampRef(badge)) : null;
    if (badge && seatSnap?.exists()) {
      const seat = seatSnap.data();
      const ownsSeat = seat.voterId === claim.voterId && seat.pollId === poll.id;
      if (!ownsSeat || seat.state !== 'pending') {
        throw new Error('현황판 번호를 확인하지 못했습니다. 다시 입장해 주세요.');
      }
    }

    tx.update(participantRef, { status: 'completed', completedAt: now });
    tx.update(pollRef, { castCount: increment(1) });
    tx.update(tallyRef(poll.id), { [`counts.${choice}`]: increment(1) });
    tx.set(doc(db, 'polls', poll.id, 'voteGuards', uid), { voterId: claim.voterId });
    if (badge && seatSnap?.exists()) tx.update(lampRef(badge), { state: 'voted' });
  });
  } catch (err) {
    throw permissionError(err, '투표를 저장하지 못했습니다. 이미 참여했거나 입장이 해제됐을 수 있습니다.');
  }
}

export async function castOpenVote(poll: Poll, choice: string): Promise<void> {
  assertUnderHeadcount(poll);
  const now = Date.now();
  const pollRef = doc(db, 'polls', poll.id);
  const uid = requireUid();

  try {
    await runTransaction(db, async (tx) => {
      const pollSnap = await tx.get(pollRef);
      if (!pollSnap.exists()) throw new Error('투표를 찾을 수 없습니다.');
      const currentPoll = { id: pollSnap.id, ...pollSnap.data() } as Poll;
      if (currentPoll.status !== 'active') throw new Error('진행 중인 투표가 아닙니다.');
      if (currentPoll.endsAt && now >= currentPoll.endsAt) throw new Error('투표 시간이 종료되었습니다.');
      if (!getOptions(currentPoll).includes(choice)) throw new Error('선택할 수 없는 항목입니다.');

      tx.update(pollRef, { castCount: increment(1) });
      tx.update(tallyRef(poll.id), { [`counts.${choice}`]: increment(1) });
      tx.set(doc(db, 'polls', poll.id, 'voteGuards', uid), { createdAt: now });
    });
  } catch (err) {
    throw permissionError(err, '이미 투표했거나 투표를 저장하지 못했습니다.');
  }
}
