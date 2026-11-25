import { useEffect, useState } from 'react';
import { usePageVisibleGeneration } from './usePageVisible';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getTodayKST, kstMidnightMs, msUntilNextKstMidnight } from '../lib/kst-date';
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
  const [kstDay, setKstDay] = useState(() => getTodayKST());
  const tallyKey = polls
    .filter((poll) => tallyVisible(poll, audience, tallyScope))
    .map((poll) => poll.id)
    .sort()
    .join(',');
  const progressKey = audience === 'admin' ? polls.map((poll) => poll.id).sort().join(',') : '';

  // 투표자 화면과 현황판은 KST 자정이 지나면 오늘 기준으로 다시 구독한다.
  useEffect(() => {
    if (audience !== 'voter') return;
    const id = window.setTimeout(() => setKstDay(getTodayKST()), msUntilNextKstMidnight());
    return () => window.clearTimeout(id);
  }, [audience, kstDay]);

  useEffect(() => {
    if (audience === 'admin') {
      return onSnapshot(query(collection(db, 'polls'), orderBy('createdAt', 'desc')), (snap) => {
        setPolls(snap.docs.map(mapPoll));
        setLoading(false);
      });
    }
    // 투표자 화면과 현황판은 지난 투표를 읽지 않는다. 두 구독은 겹치지 않아 같은 문서를 두 번 읽지 않는다.
    // - 대기·진행 중인 투표(언제 만들었든). 마감은 되돌릴 수 없어 closed 는 여기서 빠진다.
    // - 오늘(KST) 마감한 투표. closedAt 은 마감 때만 쓰인다.
    // 화면의 오늘 판정(isSameKstDay)에 걸리는 투표는 모두 이 둘 중 하나에 들어간다.
    // 여러 필드 범위를 or 로 묶으면 그 필드가 없는 문서(진행 중 투표의 closedAt)가 빠지므로 쓰지 않는다.
    const since = kstMidnightMs(kstDay);
    let openDocs: Poll[] = [];
    let closedDocs: Poll[] = [];
    let openReady = false;
    let closedReady = false;
    const publish = () => {
      if (!openReady || !closedReady) return;
      const next = [...openDocs, ...closedDocs];
      next.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setPolls(next);
      setLoading(false);
    };
    const unsubOpen = onSnapshot(
      query(collection(db, 'polls'), where('status', 'in', ['waiting', 'active'])),
      (snap) => {
        openDocs = snap.docs.map(mapPoll);
        openReady = true;
        publish();
      },
    );
    const unsubClosed = onSnapshot(
      query(collection(db, 'polls'), where('closedAt', '>=', since)),
      (snap) => {
        closedDocs = snap.docs.map(mapPoll).filter((poll) => poll.status === 'closed');
        closedReady = true;
        publish();
      },
    );
    return () => {
      unsubOpen();
      unsubClosed();
    };
  }, [audience, visibleGeneration, kstDay]);

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
