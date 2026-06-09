import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Poll, VoterSession } from '../types';

export function useVoterParticipationStatus(
  poll: Poll | null,
  session: VoterSession | null,
): boolean {
  const [completed, setCompleted] = useState(false);
  const enabled = Boolean(poll && poll.eligibilityMode === 'attendance' && session);

  useEffect(() => {
    if (!poll || poll.eligibilityMode !== 'attendance' || !session) return;

    const unsub = onSnapshot(doc(db, 'polls', poll.id, 'participation', session.voterId), (snap) => {
      setCompleted(snap.exists() && snap.data().status === 'completed');
    });

    return unsub;
  }, [poll, session]);

  return enabled && completed;
}
