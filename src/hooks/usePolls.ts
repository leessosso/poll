import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getTodayKST } from '../lib/kst-date';
import { mapPoll } from '../lib/mappers';
import type { Poll } from '../types';

export type TallyScope = 'all' | 'today' | 'none';

interface UsePollsOptions {
  tallyScope?: TallyScope;
}

function isSameKstDay(poll: Poll, today: string): boolean {
  return [poll.createdAt, poll.startedAt, poll.closedAt].some(
    (value) => typeof value === 'number' && value > 0 && getTodayKST(value) === today,
  );
}

// 비밀투표: 진행 중에는 관리자도 선택지별 집계를 받지 않는다. 규칙도 같은 조건으로 막는다.
function tallyVisible(poll: Poll, audience: 'admin' | 'voter', tallyScope: TallyScope): boolean {
  if (tallyScope === 'none') return false;
  if (poll.status !== 'closed') return false;
  if (audience !== 'admin' && !poll.showResults) return false;
  if (tallyScope === 'today') return isSameKstDay(poll, getTodayKST());
  return true;
}

export function usePolls(
  audience: 'admin' | 'voter',
  options: UsePollsOptions = {},
): { polls: Poll[]; loading: boolean } {
  const tallyScope = options.tallyScope ?? 'all';
  const [polls, setPolls] = useState<Poll[]>([]);
  const [tallies, setTallies] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const tallyKey = polls
    .filter((poll) => tallyVisible(poll, audience, tallyScope))
    .map((poll) => poll.id)
    .sort()
    .join(',');

  useEffect(() => {
    const base = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const pollQuery = audience === 'voter' ? query(base, limit(25)) : base;
    return onSnapshot(pollQuery, (snap) => {
      setPolls(snap.docs.map(mapPoll));
      setLoading(false);
    });
  }, [audience]);

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
      results: tallyVisible(poll, audience, tallyScope) ? (tallies[poll.id] ?? {}) : {},
    })),
    loading,
  };
}
