import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { participationFromLamps } from '../lib/participation';
import type { BoardLamp, Participation, Poll } from '../types';

interface UsePollParticipationResult {
  participants: Participation[];
  pending: Participation[];
  completed: Participation[];
  loading: boolean;
}

/** 관리자 화면이 이미 구독 중인 현황판 번호. 현장 입장 투표는 이 데이터로 참여 현황을 만든다. */
export interface SharedBoardLamps {
  lamps: BoardLamp[];
  loading: boolean;
}

export function usePollParticipation(poll: Poll | null, boardLamps?: SharedBoardLamps): UsePollParticipationResult {
  const [participants, setParticipants] = useState<Participation[]>([]);
  const [loadedPollId, setLoadedPollId] = useState<string | null>(null);
  const pollId = poll?.id;
  const mode = poll?.eligibilityMode;
  const enabled = mode === 'attendance' || mode === 'roster';
  const fromLamps = mode === 'roster' && Boolean(boardLamps);

  useEffect(() => {
    if (!pollId || (mode !== 'attendance' && mode !== 'roster') || fromLamps) return;

    const q = query(collection(db, 'polls', pollId, 'participation'), orderBy('voterName', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setLoadedPollId(pollId);
      setParticipants(
        snap.docs.map((participantDoc) => {
          const data = participantDoc.data();
          return {
            id: participantDoc.id,
            voterId: data.voterId ?? participantDoc.id,
            voterName: data.voterName ?? '이름 없음',
            status: data.status ?? 'pending',
            completedAt: data.completedAt,
          } as Participation;
        }),
      );
    });

    return unsub;
  }, [pollId, mode, fromLamps]);

  const sourceParticipants = fromLamps && pollId && boardLamps ? participationFromLamps(pollId, boardLamps.lamps) : participants;
  const visibleParticipants = enabled ? sourceParticipants : [];
  const pending = visibleParticipants.filter((participant) => participant.status !== 'completed');
  const completed = visibleParticipants.filter((participant) => participant.status === 'completed');
  const loading = !enabled ? false : fromLamps ? Boolean(boardLamps?.loading) : loadedPollId !== pollId;

  return {
    participants: visibleParticipants,
    pending,
    completed,
    loading,
  };
}
