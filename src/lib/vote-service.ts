import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { getDefaultDurationSeconds, getOptions } from './poll-utils';
import type { AttendanceSession, Poll, RosterClaim, Voter, VoterSession } from '../types';

const MEETING_DOC = doc(db, 'meeting', 'current');

const DEFAULT_EVENT_ID = 'elder-vote';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

export async function startPollWithParticipation(poll: Poll): Promise<void> {
  const now = Date.now();
  const durationSeconds = getDefaultDurationSeconds(poll);
  const endsAt = now + durationSeconds * 1000;
  const batch = writeBatch(db);
  const options = getOptions(poll);
  const initialResults = Object.fromEntries(options.map((option) => [option, poll.results?.[option] ?? 0]));

  batch.update(doc(db, 'polls', poll.id), {
    status: 'active',
    startedAt: now,
    endsAt,
    durationSeconds,
    results: initialResults,
  });

  if (poll.eligibilityMode === 'roster') {
    const checkinsSnap = await getDocs(collection(db, 'checkins'));
    checkinsSnap.docs.forEach((checkinDoc) => {
      const data = checkinDoc.data();
      batch.set(doc(db, 'polls', poll.id, 'participation', checkinDoc.id), {
        voterId: data.voterId ?? checkinDoc.id,
        voterName: data.voterName ?? '이름 없음',
        status: 'pending',
        createdAt: now,
      });
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
      batch.set(doc(db, 'polls', poll.id, 'participation', session.voterId), {
        voterId: session.voterId,
        voterName: session.voterName,
        status: 'pending',
        createdAt: now,
      });
    });
  }

  await batch.commit();
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
      updates['results.기권'] = increment(stillPending.length);
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
  const sessionRef = doc(db, 'attendanceSessions', session.sessionId);
  const pollRef = doc(db, 'polls', poll.id);
  const participantRef = doc(db, 'polls', poll.id, 'participation', session.voterId);

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
    tx.update(pollRef, {
      [`results.${choice}`]: increment(1),
    });
  });
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
  const checkinRef = doc(db, 'checkins', voter.id);
  const claimToken = crypto.randomUUID();
  const normalizedCode = roomCode.trim();

  await runTransaction(db, async (tx) => {
    const [meetingSnap, checkinSnap] = await Promise.all([tx.get(MEETING_DOC), tx.get(checkinRef)]);
    const expected = meetingSnap.exists() ? String(meetingSnap.data().roomCode ?? '') : '';
    if (!expected || expected !== normalizedCode) throw new Error('입장 코드가 맞지 않습니다.');
    if (checkinSnap.exists()) throw new Error('이미 다른 분이 선택한 이름입니다.');

    tx.set(checkinRef, {
      voterId: voter.id,
      voterName: voter.name,
      claimedAt: Date.now(),
      claimToken,
    });
  });

  return { voterId: voter.id, voterName: voter.name, claimToken };
}

export async function releaseRosterClaim(voterId: string, activePoll: Poll | null): Promise<void> {
  const checkinRef = doc(db, 'checkins', voterId);
  const tracksParticipation =
    activePoll && (activePoll.eligibilityMode === 'roster' || activePoll.eligibilityMode === 'attendance');

  if (!tracksParticipation) {
    await deleteDoc(checkinRef);
    return;
  }

  const participantRef = doc(db, 'polls', activePoll.id, 'participation', voterId);
  await runTransaction(db, async (tx) => {
    const participantSnap = await tx.get(participantRef);
    if (participantSnap.exists() && participantSnap.data().status === 'completed') {
      throw new Error('이미 투표를 완료한 이름은 해제할 수 없습니다.');
    }
    if (participantSnap.exists()) tx.delete(participantRef);
    tx.delete(checkinRef);
  });
}

export async function castRosterVote(poll: Poll, choice: string, claim: RosterClaim): Promise<void> {
  const now = Date.now();
  const pollRef = doc(db, 'polls', poll.id);
  const checkinRef = doc(db, 'checkins', claim.voterId);
  const participantRef = doc(db, 'polls', poll.id, 'participation', claim.voterId);

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

    tx.update(participantRef, { status: 'completed', completedAt: now });
    tx.update(pollRef, { [`results.${choice}`]: increment(1) });
  });
}
