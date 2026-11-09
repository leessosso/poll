import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { mapPoll } from '../lib/mappers';
import type { Poll } from '../types';

// 비밀투표: 진행 중에는 관리자도 선택지별 집계를 받지 않는다. 규칙도 같은 조건으로 막는다.
function tallyVisible(poll: Poll, audience: 'admin' | 'voter'): boolean {
  if (poll.status !== 'closed') return false;
  return audience === 'admin' || poll.showResults;
}

export function usePolls(audience: 'admin' | 'voter'): { polls: Poll[]; loading: boolean } {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [tallies, setTallies] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const tallyKey = polls
    .filter((poll) => tallyVisible(poll, audience))
    .map((poll) => poll.id)
    .sort()
    .join(',');

  useEffect(() => {
    const pollQuery = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    return onSnapshot(pollQuery, (snap) => {
      setPolls(snap.docs.map(mapPoll));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!tallyKey) return;
    const unsubs = tallyKey.split(',').map((pollId) =>
      onSnapshot(
        doc(db, 'polls', pollId, 'tally', 'current'),
        (snap) => {
          const counts = snap.exists() ? (snap.data().counts ?? {}) : {};
          setTallies((prev) => ({ ...prev, [pollId]: counts }));
        },
        () => {
          setTallies((prev) => ({ ...prev, [pollId]: {} }));
        },
      ),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [tallyKey]);

  return {
    polls: polls.map((poll) => ({
      ...poll,
      results: tallyVisible(poll, audience) ? (tallies[poll.id] ?? {}) : {},
    })),
    loading,
  };
}
