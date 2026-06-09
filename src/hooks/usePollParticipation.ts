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
  const enabled = Boolean(poll && poll.eligibilityMode === 'attendance');

  useEffect(() => {
    if (!poll || poll.eligibilityMode !== 'attendance') return;

    const q = query(collection(db, 'polls', poll.id, 'participation'), orderBy('voterName', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setParticipants(
        snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            voterId: data.voterId ?? doc.id,
            voterName: data.voterName ?? '이름 없음',
            status: data.status ?? 'pending',
            completedAt: data.completedAt,
          } as Participation;
        }),
      );
    });

    return unsub;
  }, [poll]);

  const visibleParticipants = enabled ? participants : [];
  const pending = visibleParticipants.filter((participant) => participant.status !== 'completed');
  const completed = visibleParticipants.filter((participant) => participant.status === 'completed');

  return { participants: visibleParticipants, pending, completed, loading: false };
}
