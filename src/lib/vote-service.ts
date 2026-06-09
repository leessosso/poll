import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { getDefaultDurationSeconds, getOptions } from './poll-utils';
import type { AttendanceSession, Poll, Voter, VoterSession } from '../types';

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
  const batch = writeBatch(db);

  if (poll.eligibilityMode === 'attendance') {
    const pendingSnap = await getDocs(
      query(collection(db, 'polls', poll.id, 'participation'), where('status', '==', 'pending')),
    );

    pendingSnap.docs.forEach((participantDoc) => {
      const ballotRef = doc(collection(db, 'polls', poll.id, 'ballots'));
      batch.set(ballotRef, {
        choice: '기권',
        createdAt: now,
        source: 'timeout',
      });
      batch.update(participantDoc.ref, {
        status: 'completed',
        completedAt: now,
      });
    });

    if (pendingSnap.size > 0) {
      batch.update(doc(db, 'polls', poll.id), {
        'results.기권': increment(pendingSnap.size),
      });
    }
  }

  batch.update(doc(db, 'polls', poll.id), {
    status: 'closed',
    closedAt: now,
  });

  await batch.commit();
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
  const ballotRef = doc(collection(db, 'polls', poll.id, 'ballots'));

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
    if (participantSnap.exists() && participantSnap.data().status === 'completed') {
      throw new Error('이미 투표를 완료했습니다.');
    }

    tx.set(ballotRef, {
      choice,
      createdAt: now,
      source: 'manual',
    });
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
