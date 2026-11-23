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
import { applyBoardMode } from './board-state';
import { MEETING_PUBLIC_DOC, ROOM_CODE_LENGTH, checkinId, entryCodeHash, lampId } from './meeting';
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

/** 투표 중 오르는 참여 총원. 투표자는 이 문서를 구독하지 않는다. */
function progressRef(pollId: string) {
  return doc(db, 'polls', pollId, 'progress', 'current');
}

function lampRef(meetingId: string, badge: number) {
  return doc(db, 'lamps', lampId(meetingId, badge));
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

function badgeOf(data: Record<string, unknown> | undefined): number | null {
  const badge = data?.badge;
  return typeof badge === 'number' && Number.isInteger(badge) && badge >= BADGE_MIN && badge <= BADGE_MAX
    ? badge
    : null;
}

function pickRandomUntriedBadge(tried: Set<number>): number {
  const span = BADGE_MAX - BADGE_MIN + 1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const badge = BADGE_MIN + Math.floor(Math.random() * span);
    if (!tried.has(badge)) return badge;
  }
  for (let badge = BADGE_MIN; badge <= BADGE_MAX; badge += 1) {
    if (!tried.has(badge)) return badge;
  }
  throw new Error('입장 번호를 더 만들 수 없습니다.');
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
    throw new Error('투표 인원은 1명 이상이어야 해요.');
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
    const [checkinsSnap, lampsSnap] = await Promise.all([
      getDocs(query(collection(db, 'checkins'), where('meetingId', '==', mid), where('revoked', '==', false))),
      getDocs(query(collection(db, 'lamps'), where('meetingId', '==', mid))),
    ]);

    const seats = new Map<string, { voterName: string; badge: number }>();
    checkinsSnap.docs.forEach((checkinDoc) => {
      const data = checkinDoc.data();
      const badge = badgeOf(data);
      if (typeof data.voterId !== 'string' || !badge) return;
      seats.set(data.voterId, { voterName: String(data.voterName ?? `${badge}번`), badge });
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
  ops.push((batch) => batch.set(progressRef(poll.id), { castCount: 0 }));
  ops.push((batch) => batch.update(doc(db, 'polls', poll.id), {
    status: 'active',
    startedAt: now,
    endsAt,
    durationSeconds,
    expectedCount,
    ...(meetingId ? { meetingId } : {}),
  }));
  ops.push((batch) => applyBoardMode(batch, 'results', now));
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
    const progressSnap = await tx.get(progressRef(poll.id));

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

    const stored = pollSnap.data().castCount;
    const live = progressSnap.exists() ? progressSnap.data().castCount : stored;
    const base = typeof live === 'number' ? live : 0;
    const abstain = stillPending.length > 0 && poll.allowAbstain ? stillPending.length : 0;
    const updates: Record<string, unknown> = {
      status: 'closed',
      closedAt: now,
      // 마감 한 번만 투표 문서에 총원을 굳힌다. 진행 중에는 progress 만 오른다.
      castCount: base + abstain,
    };
    if (progressSnap.exists()) {
      tx.update(progressRef(poll.id), { castCount: base + abstain });
    }
    if (abstain > 0) {
      tx.update(tallyRef(poll.id), { 'counts.기권': increment(abstain) });
    }
    tx.update(pollRef, updates);
  });
}

export async function castAttendanceVote(
  poll: Poll,
  choice: string,
  session: VoterSession,
): Promise<void> {
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
    tx.update(progressRef(poll.id), { castCount: increment(1) });
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
    throw new Error('투표 인원은 1명 이상이어야 해요.');
  }
  await updateDoc(doc(db, 'polls', pollId), { expectedCount });
}

export async function togglePollResults(poll: Poll): Promise<void> {
  await updateDoc(doc(db, 'polls', poll.id), { showResults: !poll.showResults });
}

const CLAIM_REJECTED =
  '입장하지 못했습니다. 화면의 입장 코드를 다시 확인해 주세요. 이미 입장한 기기라면 새로고침해 주세요.';

function claimFromCheckinDoc(data: Record<string, unknown>): RosterClaim | null {
  const { meetingId, voterId, voterName, claimToken } = data;
  if (typeof meetingId !== 'string' || typeof voterId !== 'string') return null;
  if (typeof voterName !== 'string' || typeof claimToken !== 'string') return null;
  return {
    meetingId,
    voterId,
    voterName,
    claimToken,
    badge: badgeOf(data) ?? undefined,
  };
}

/**
 * 코드만으로 현장 입장. 입장 코드는 규칙이 해시 문서로 확인한다.
 * 명단을 읽지 않고, 무작위 번호를 트랜잭션으로 확인해 읽기 수를 최소화한다.
 */
export async function claimRosterSeat(roomCode: string): Promise<RosterClaim> {
  const meetingId = await requireMeetingId();
  const code = roomCode.trim();
  if (!new RegExp(`^[0-9]{${ROOM_CODE_LENGTH}}$`).test(code)) {
    throw new Error(`입장 코드 ${ROOM_CODE_LENGTH}자리 숫자를 입력해 주세요.`);
  }
  const codeHash = await entryCodeHash(meetingId, code);
  const claimToken = crypto.randomUUID();
  const uid = requireUid();
  const checkinDocRef = doc(db, 'checkins', checkinId(meetingId, uid));

  try {
    const tried = new Set<number>();
    let used: Set<number> | null = null;
    let lastError: unknown;
    const MAX_RANDOM_TRIES = 12;

    for (let attempt = 0; attempt < MAX_RANDOM_TRIES + 4; attempt += 1) {
      if (attempt === MAX_RANDOM_TRIES && !used) {
        used = new Set<number>(tried);
        const existing = await getDocs(query(collection(db, 'lamps'), where('meetingId', '==', meetingId)));
        existing.docs.forEach((lampDoc) => {
          const b = badgeOf(lampDoc.data());
          if (b) used!.add(b);
        });
      }

      const badge = used ? pickBadge(used) : pickRandomUntriedBadge(tried);
      tried.add(badge);

      try {
        const result = await runTransaction(db, async (tx) => {
          const [checkinSnap, seatSnap] = await Promise.all([
            tx.get(checkinDocRef),
            tx.get(lampRef(meetingId, badge)),
          ]);
          if (checkinSnap.exists() && checkinSnap.data().revoked === false) {
            const existingClaim = claimFromCheckinDoc(checkinSnap.data());
            if (existingClaim) return existingClaim;
          }
          if (seatSnap.exists()) throw new BadgeTakenError();
          const voterName = `${badge}번`;
          tx.set(checkinDocRef, {
            meetingId,
            voterId: uid,
            voterName,
            claimedAt: Date.now(),
            claimToken,
            authUid: uid,
            badge,
            codeHash,
            revoked: false,
          });
          tx.set(lampRef(meetingId, badge), {
            meetingId,
            badge,
            state: 'seated',
            pollId: '',
          });
          return { meetingId, voterId: uid, voterName, claimToken, badge };
        });
        return result;
      } catch (err) {
        if (!(err instanceof BadgeTakenError)) throw err;
        if (used) used.add(badge);
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
 * 입장 해제. 기기의 입장을 회수(revoked)하고 현황판 번호를 지운다.
 * 이미 이번 투표를 완료한 기기는 해제하지 않는다.
 */
export async function releaseMeetingCheckin(
  checkinDocId: string,
  voterId: string,
  badge: number | null,
  activePoll: Poll | null,
): Promise<void> {
  const meetingId = await requireMeetingId();
  const participantRef = tracksParticipation(activePoll)
    ? doc(db, 'polls', activePoll.id, 'participation', voterId)
    : null;

  await runTransaction(db, async (tx) => {
    const participantSnap = participantRef ? await tx.get(participantRef) : null;
    const completed = participantSnap?.exists() && participantSnap.data().status === 'completed';
    if (completed) throw new Error('이미 투표를 완료한 기기는 해제할 수 없습니다.');
    if (participantSnap?.exists()) tx.delete(participantSnap.ref);
    tx.update(doc(db, 'checkins', checkinDocId), { revoked: true });
    if (badge) tx.delete(lampRef(meetingId, badge));
  });
}

/**
 * 투표자 본인 퇴장. 이 기기의 입장만 회수하고 현황판 번호를 비운다.
 * 같은 기기는 입장 코드로 다시 들어올 수 있다. 이미 던진 표(voteGuards)는 그대로 남는다.
 */
export async function exitOwnCheckin(claim: RosterClaim): Promise<void> {
  const uid = requireUid();
  if (claim.voterId !== uid) {
    throw new Error('이 기기의 입장만 퇴장할 수 있습니다.');
  }
  const checkinRef = doc(db, 'checkins', checkinId(claim.meetingId, uid));
  try {
    await runTransaction(db, async (tx) => {
      const checkinSnap = await tx.get(checkinRef);
      const checkin = checkinSnap.exists() ? checkinSnap.data() : null;
      if (!checkin || checkin.revoked !== false || checkin.authUid !== uid) {
        throw new Error('입장 정보가 없습니다.');
      }
      const liveBadge = badgeOf(checkin) ?? (claim.badge ?? null);
      const seatSnap = liveBadge ? await tx.get(lampRef(claim.meetingId, liveBadge)) : null;
      tx.update(checkinRef, { revoked: true });
      if (seatSnap?.exists()) tx.delete(seatSnap.ref);
    });
  } catch (err) {
    throw permissionError(err, '퇴장하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.');
  }
}

export async function removeVoterFromRoster(voterId: string, activePoll: Poll | null): Promise<void> {
  const participantRef = tracksParticipation(activePoll)
    ? doc(db, 'polls', activePoll.id, 'participation', voterId)
    : null;
  await runTransaction(db, async (tx) => {
    const participantSnap = participantRef ? await tx.get(participantRef) : null;
    const completed = participantSnap?.exists() && participantSnap.data().status === 'completed';
    tx.delete(doc(db, 'voters', voterId));
    tx.delete(doc(db, 'voterDirectory', voterId));
    if (!completed && participantSnap?.exists()) tx.delete(participantSnap.ref);
  });
  await deleteAttendanceSessions(voterId);
}

export async function castRosterVote(poll: Poll, choice: string, claim: RosterClaim): Promise<void> {
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
      throw new Error('입장 정보가 없습니다. 다시 입장해 주세요.');
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
    tx.update(progressRef(poll.id), { castCount: increment(1) });
    tx.update(tallyRef(poll.id), { [`counts.${choice}`]: increment(1) });
    tx.set(doc(db, 'polls', poll.id, 'voteGuards', uid), { voterId: claim.voterId });
    if (seatRef && lightSeat) tx.update(seatRef, { state: 'voted' });
  });
  } catch (err) {
    throw permissionError(err, '투표를 저장하지 못했습니다. 이미 참여했거나 입장이 해제됐을 수 있습니다.');
  }
}

export async function castOpenVote(poll: Poll, choice: string): Promise<void> {
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

      tx.update(progressRef(poll.id), { castCount: increment(1) });
      tx.update(tallyRef(poll.id), { [`counts.${choice}`]: increment(1) });
      tx.set(doc(db, 'polls', poll.id, 'voteGuards', uid), { createdAt: now });
    });
  } catch (err) {
    throw permissionError(err, '이미 투표했거나 투표를 저장하지 못했습니다.');
  }
}
