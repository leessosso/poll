import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Poll } from '../types';

export type ParticipationView = 'hidden' | 'loading' | 'pending' | 'completed' | 'absent';

export function useVoterParticipationStatus(poll: Poll | null, voterId: string | null): ParticipationView {
  const [view, setView] = useState<ParticipationView>('loading');
  const [snapshotKey, setSnapshotKey] = useState('');
  const pollId = poll?.id;
  const mode = poll?.eligibilityMode;
  const currentKey = `${pollId ?? ''}:${voterId ?? ''}`;
  const tracked = Boolean(pollId && voterId && (mode === 'attendance' || mode === 'roster'));

  useEffect(() => {
    if (!pollId || !voterId || (mode !== 'attendance' && mode !== 'roster')) return;

    const unsub = onSnapshot(doc(db, 'polls', pollId, 'participation', voterId), (snap) => {
      setSnapshotKey(`${pollId}:${voterId}`);
      if (!snap.exists()) {
        setView('absent');
        return;
      }
      setView(snap.data().status === 'completed' ? 'completed' : 'pending');
    });

    return unsub;
  }, [pollId, voterId, mode]);

  if (!tracked) return 'hidden';
  if (snapshotKey !== currentKey) return 'loading';
  return view;
}
