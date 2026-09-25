import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Participation, Poll } from '../types';

interface UsePollParticipationResult {
  participants: Participation[];
  pending: Participation[];
  completed: Participation[];
  loading: boolean;
}

export function usePollParticipation(poll: Poll | null): UsePollParticipationResult {
  const [participants, setParticipants] = useState<Participation[]>([]);
  const [loadedPollId, setLoadedPollId] = useState<string | null>(null);
  const pollId = poll?.id;
  const mode = poll?.eligibilityMode;
  const enabled = mode === 'attendance' || mode === 'roster';

  useEffect(() => {
    if (!pollId || (mode !== 'attendance' && mode !== 'roster')) return;

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
  }, [pollId, mode]);

  const visibleParticipants = enabled ? participants : [];
  const pending = visibleParticipants.filter((participant) => participant.status !== 'completed');
  const completed = visibleParticipants.filter((participant) => participant.status === 'completed');

  return {
    participants: visibleParticipants,
    pending,
    completed,
    loading: enabled && loadedPollId !== pollId,
  };
}
