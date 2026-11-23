import { useEffect, useState } from 'react';
import { usePageVisibleGeneration } from './usePageVisible';
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
  const visibleGeneration = usePageVisibleGeneration();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [tallies, setTallies] = useState<Record<string, Record<string, number>>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const tallyKey = polls
    .filter((poll) => tallyVisible(poll, audience, tallyScope))
    .map((poll) => poll.id)
    .sort()
    .join(',');
  const progressKey = audience === 'admin' ? polls.map((poll) => poll.id).sort().join(',') : '';

  useEffect(() => {
    const base = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const pollQuery = audience === 'voter' ? query(base, limit(25)) : base;
    return onSnapshot(pollQuery, (snap) => {
      setPolls(snap.docs.map(mapPoll));
      setLoading(false);
    });
  }, [audience, visibleGeneration]);

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

  // 진행 중 총원은 투표 문서가 아니라 관리자 전용 progress 문서에 있다.
  // 투표자 화면은 이 구독을 만들지 않는다.
  useEffect(() => {
    if (audience !== 'admin' || !progressKey) return;
    const unsubs = progressKey.split(',').map((pollId) =>
      onSnapshot(
        doc(db, 'polls', pollId, 'progress', 'current'),
        (snap) => {
          const castCount = snap.exists() ? snap.data().castCount : undefined;
          setProgress((prev) => {
            if (typeof castCount !== 'number') {
              if (!(pollId in prev)) return prev;
              const next = { ...prev };
              delete next[pollId];
              return next;
            }
            if (prev[pollId] === castCount) return prev;
            return { ...prev, [pollId]: castCount };
          });
        },
        () => {
          setProgress((prev) => {
            if (!(pollId in prev)) return prev;
            const next = { ...prev };
            delete next[pollId];
            return next;
          });
        },
      ),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [audience, progressKey]);

  return {
    polls: polls.map((poll) => ({
      ...poll,
      castCount: poll.id in progress ? progress[poll.id] : poll.castCount,
      results: tallyVisible(poll, audience, tallyScope) ? (tallies[poll.id] ?? {}) : {},
    })),
    loading,
  };
}
