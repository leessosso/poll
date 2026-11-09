import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { MEETING_PUBLIC_DOC, ROOM_CODE_LENGTH, checkinId, claimedNameId, entryCodeHash, lampId } from './meeting';
import { getDefaultDurationSeconds, getOptions } from './poll-utils';
import type { AttendanceSession, Poll, RosterClaim, Voter, VoterSession } from '../types';

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

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('인증이 필요합니다. 화면을 새로고침한 뒤 다시 시도해 주세요.');
  return uid;
}

function tallyRef(pollId: string) {
  return doc(db, 'polls', pollId, 'tally', 'current');
}

function lampRef(meetingId: string, badge: number) {
  return doc(db, 'lamps', lampId(meetingId, badge));
}

function claimedRef(meetingId: string, voterId: string) {
  return doc(db, 'claimedNames', claimedNameId(meetingId, voterId));
}

function reissueRef(meetingId: string, voterId: string) {
  return doc(db, 'reissues', claimedNameId(meetingId, voterId));
}

async function currentMeetingId(): Promise<string> {
  const snap = await getDoc(MEETING_PUBLIC_DOC);
  const id = snap.exists() ? snap.data().meetingId : '';
  return typeof id === 'string' ? id : '';
}

async function requireMeetingId(): Promise<string> {
  const id = await currentMeetingId();
  if (!id) throw new Error('먼저 관리자 화면에서 새 모임을 시작해 주세요.');
  return id;
}

/** 현재 모임에서 이 유권자가 쓰고 있는(회수되지 않은) 입장 문서 */
async function findLiveCheckin(meetingId: string, voterId: string) {
  const snap = await getDocs(
    query(
      collection(db, 'checkins'),
      where('meetingId', '==', meetingId),
      where('voterId', '==', voterId),
      where('revoked', '==', false),
    ),
  );
  return snap.docs[0] ?? null;
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

  let meetingId: string | undefined;
  if (poll.eligibilityMode === 'roster') {
    // 현재 모임의 입장만 이번 투표 인원이 된다. 지난 모임 입장은 무시한다.
    meetingId = await requireMeetingId();
    const mid = meetingId;
    const [checkinsSnap, lampsSnap, reissuesSnap] = await Promise.all([
      getDocs(query(collection(db, 'checkins'), where('meetingId', '==', mid))),
      getDocs(query(collection(db, 'lamps'), where('meetingId', '==', mid))),
      getDocs(query(collection(db, 'reissues'), where('meetingId', '==', mid))),
    ]);

    const seats = new Map<string, { voterName: string; badge: number }>();
    const names = new Map<string, string>();
    checkinsSnap.docs.forEach((checkinDoc) => {
      const data = checkinDoc.data();
      const badge = badgeOf(data);
      if (typeof data.voterId !== 'string' || !badge) return;
      names.set(data.voterId, String(data.voterName ?? '이름 없음'));
      if (data.revoked === false) seats.set(data.voterId, { voterName: String(data.voterName ?? '이름 없음'), badge });
    });
    // 다시 연결을 기다리는 사람도 이번 투표 인원에 넣는다. 새 기기로 들어오면 그대로 투표한다.
    reissuesSnap.docs.forEach((reissueDoc) => {
      const data = reissueDoc.data();
      const badge = badgeOf(data);
      if (typeof data.voterId !== 'string' || !badge || seats.has(data.voterId)) return;
      seats.set(data.voterId, { voterName: names.get(data.voterId) ?? '이름 없음', badge });
    });

    const liveLamps = new Set<string>();
    seats.forEach((seat, voterId) => {
      liveLamps.add(lampId(mid, seat.badge));
      ops.push((batch) => batch.set(doc(db, 'polls', poll.id, 'participation', voterId), {
        voterId,
        voterName: seat.voterName,
        status: 'pending',
        createdAt: now,
      }));
      ops.push((batch) => batch.set(lampRef(mid, seat.badge), {
        meetingId: mid,
        badge: seat.badge,
        state: 'pending',
        pollId: poll.id,
      }));
    });
    lampsSnap.docs.forEach((lampDoc) => {
      if (!liveLamps.has(lampDoc.id)) ops.push((batch) => batch.delete(lampDoc.ref));
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
    ...(meetingId ? { meetingId } : {}),
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

const CLAIM_REJECTED =
  '입장하지 못했습니다. 화면의 입장 코드를 다시 확인해 주세요. 이 기기로 이미 다른 이름에 입장했다면 안내자에게 알려 주세요.';

/**
 * 현장 입장. 입장 코드는 규칙이 해시 문서로 확인한다.
 * 관리자가 다시 연결(재발급)을 열어 둔 이름이면 같은 번호로 다시 들어온다.
 */
export async function claimRosterSeat(voter: Voter, roomCode: string): Promise<RosterClaim> {
  const meetingId = await requireMeetingId();
  const code = roomCode.trim();
  if (!new RegExp(`^[0-9]{${ROOM_CODE_LENGTH}}$`).test(code)) {
    throw new Error(`입장 코드 ${ROOM_CODE_LENGTH}자리 숫자를 입력해 주세요.`);
  }
  const codeHash = await entryCodeHash(meetingId, code);
  const claimToken = crypto.randomUUID();
  const uid = requireUid();

  const claimedSnap = await getDoc(claimedRef(meetingId, voter.id));
  try {
    if (claimedSnap.exists()) {
      if (claimedSnap.data().reissue !== true) throw new Error('이미 다른 분이 선택한 이름입니다.');
      const reissueSnap = await getDoc(reissueRef(meetingId, voter.id));
      const badge = badgeOf(reissueSnap.data());
      if (!badge) throw new Error('다시 연결 정보를 찾지 못했습니다. 안내자에게 알려 주세요.');
      await runTransaction(db, async (tx) => {
        tx.set(doc(db, 'checkins', checkinId(meetingId, uid)), {
          meetingId, voterId: voter.id, voterName: voter.name, claimedAt: Date.now(),
          claimToken, authUid: uid, badge, codeHash, revoked: false,
        });
        tx.update(claimedRef(meetingId, voter.id), { reissue: false });
        tx.delete(reissueRef(meetingId, voter.id));
      });
      return { meetingId, voterId: voter.id, voterName: voter.name, claimToken, badge };
    }

    const used = new Set<number>();
    const existing = await getDocs(query(collection(db, 'lamps'), where('meetingId', '==', meetingId)));
    existing.docs.forEach((lampDoc) => {
      const badge = badgeOf(lampDoc.data());
      if (badge) used.add(badge);
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const badge = pickBadge(used);
      try {
        await runTransaction(db, async (tx) => {
          const [claimSnap, seatSnap] = await Promise.all([
            tx.get(claimedRef(meetingId, voter.id)),
            tx.get(lampRef(meetingId, badge)),
          ]);
          if (claimSnap.exists()) throw new Error('이미 다른 분이 선택한 이름입니다.');
          if (seatSnap.exists()) throw new BadgeTakenError();
          tx.set(doc(db, 'checkins', checkinId(meetingId, uid)), {
            meetingId, voterId: voter.id, voterName: voter.name, claimedAt: Date.now(),
            claimToken, authUid: uid, badge, codeHash, revoked: false,
          });
          tx.set(claimedRef(meetingId, voter.id), { meetingId, reissue: false });
          tx.set(lampRef(meetingId, badge), { meetingId, badge, state: 'seated', pollId: '' });
        });
        return { meetingId, voterId: voter.id, voterName: voter.name, claimToken, badge };
      } catch (err) {
        if (!(err instanceof BadgeTakenError)) throw err;
        used.add(badge);
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('입장 번호를 정하지 못했습니다.');
  } catch (err) {
    throw permissionError(err, CLAIM_REJECTED);
  }
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

function tracksParticipation(poll: Poll | null): poll is Poll {
  return Boolean(poll && (poll.eligibilityMode === 'roster' || poll.eligibilityMode === 'attendance'));
}

/**
 * 입장 해제. 이름을 비워 다시 고를 수 있게 한다.
 * 입장 문서는 지우지 않고 회수(revoked)만 한다. 이미 투표한 사람은 해제하지 않는다.
 */
async function releaseSeat(voterId: string, activePoll: Poll | null, alsoRemoveVoter: boolean): Promise<void> {
  const meetingId = await currentMeetingId();
  const live = meetingId ? await findLiveCheckin(meetingId, voterId) : null;
  const badge = badgeOf(live?.data());
  const pendingReissue = meetingId ? await getDoc(reissueRef(meetingId, voterId)).catch(() => null) : null;
  const reissueBadge = badgeOf(pendingReissue?.data());
  const participantRef = tracksParticipation(activePoll)
    ? doc(db, 'polls', activePoll.id, 'participation', voterId)
    : null;

  await runTransaction(db, async (tx) => {
    const participantSnap = participantRef ? await tx.get(participantRef) : null;
    const completed = participantSnap?.exists() && participantSnap.data().status === 'completed';
    if (completed && !alsoRemoveVoter) throw new Error('이미 투표를 완료한 이름은 해제할 수 없습니다.');
    if (alsoRemoveVoter) {
      tx.delete(doc(db, 'voters', voterId));
      tx.delete(doc(db, 'voterDirectory', voterId));
    }
    if (completed) return;
    if (participantSnap?.exists()) tx.delete(participantSnap.ref);
    if (!meetingId) return;
    if (live) tx.update(live.ref, { revoked: true });
    tx.delete(claimedRef(meetingId, voterId));
    if (pendingReissue?.exists()) tx.delete(pendingReissue.ref);
    const seat = badge ?? reissueBadge;
    if (seat) tx.delete(lampRef(meetingId, seat));
  });
}

export async function removeVoterFromRoster(voterId: string, activePoll: Poll | null): Promise<void> {
  await releaseSeat(voterId, activePoll, true);
  await deleteAttendanceSessions(voterId);
}

export async function releaseRosterClaim(voterId: string, activePoll: Poll | null): Promise<void> {
  await releaseSeat(voterId, activePoll, false);
}

/**
 * 다시 연결(재발급). 휴대폰이 꺼졌거나 바뀐 사람이 새 기기로 같은 이름·번호를 다시 받게 한다.
 * 이번 투표 참여 기록(아직 투표 전)은 그대로 둔다. 이미 투표한 사람은 하지 않는다.
 */
export async function reissueRosterClaim(voterId: string, activePoll: Poll | null): Promise<void> {
  const meetingId = await requireMeetingId();
  const live = await findLiveCheckin(meetingId, voterId);
  if (!live) throw new Error('이 이름은 지금 입장해 있지 않습니다.');
  const badge = badgeOf(live.data());
  if (!badge) throw new Error('입장 번호가 없어 다시 연결할 수 없습니다. 입장 해제 후 다시 입장해 주세요.');
  const participantRef = tracksParticipation(activePoll)
    ? doc(db, 'polls', activePoll.id, 'participation', voterId)
    : null;

  await runTransaction(db, async (tx) => {
    const participantSnap = participantRef ? await tx.get(participantRef) : null;
    if (participantSnap?.exists() && participantSnap.data().status === 'completed') {
      throw new Error('이미 이번 투표를 마친 분은 다시 연결할 수 없습니다. 투표가 끝난 뒤 다시 해 주세요.');
    }
    tx.update(live.ref, { revoked: true });
    tx.update(claimedRef(meetingId, voterId), { reissue: true });
    tx.set(reissueRef(meetingId, voterId), { meetingId, voterId, badge, createdAt: Date.now() });
  });
}

export async function castRosterVote(poll: Poll, choice: string, claim: RosterClaim): Promise<void> {
  assertUnderHeadcount(poll);
  const now = Date.now();
  const uid = requireUid();
  const pollRef = doc(db, 'polls', poll.id);
  const checkinRef = doc(db, 'checkins', checkinId(claim.meetingId, uid));
  const participantRef = doc(db, 'polls', poll.id, 'participation', claim.voterId);

  try {
  await runTransaction(db, async (tx) => {
    const [checkinSnap, pollSnap, participantSnap] = await Promise.all([
      tx.get(checkinRef),
      tx.get(pollRef),
      tx.get(participantRef),
    ]);

    const checkin = checkinSnap.exists() ? checkinSnap.data() : null;
    if (!checkin || checkin.claimToken !== claim.claimToken || checkin.revoked !== false) {
      throw new Error('입장 정보가 없습니다. 다시 이름을 선택해 주세요.');
    }
    if (!pollSnap.exists()) throw new Error('투표를 찾을 수 없습니다.');

    const currentPoll = { id: pollSnap.id, ...pollSnap.data() } as Poll;
    if (currentPoll.status !== 'active') throw new Error('진행 중인 투표가 아닙니다.');
    if (currentPoll.meetingId !== claim.meetingId) throw new Error('이번 모임에 입장한 이름이 아닙니다.');
    if (currentPoll.endsAt && now >= currentPoll.endsAt) throw new Error('투표 시간이 종료되었습니다.');
    if (!getOptions(currentPoll).includes(choice)) throw new Error('선택할 수 없는 항목입니다.');
    if (!participantSnap.exists()) throw new Error('이번 투표 명단에 없습니다.');
    if (participantSnap.data().status === 'completed') throw new Error('이미 투표를 완료했습니다.');

    const badge = badgeOf(checkin);
    const seatRef = badge ? lampRef(claim.meetingId, badge) : null;
    const seatSnap = seatRef ? await tx.get(seatRef) : null;
    const lightSeat = Boolean(seatSnap?.exists() && seatSnap.data().pollId === poll.id && seatSnap.data().state === 'pending');

    tx.update(participantRef, { status: 'completed', completedAt: now });
    tx.update(pollRef, { castCount: increment(1) });
    tx.update(tallyRef(poll.id), { [`counts.${choice}`]: increment(1) });
    tx.set(doc(db, 'polls', poll.id, 'voteGuards', uid), { voterId: claim.voterId });
    if (seatRef && lightSeat) tx.update(seatRef, { state: 'voted' });
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
