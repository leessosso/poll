import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { mapPoll } from '../lib/mappers';
import type { Poll } from '../types';

export function usePolls(): { polls: Poll[]; loading: boolean } {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPolls(snap.docs.map(mapPoll));
      setLoading(false);
    });
    return unsub;
  }, []);

  return { polls, loading };
}
