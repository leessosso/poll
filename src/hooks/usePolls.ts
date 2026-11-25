import { useEffect, useState } from 'react';
import { usePageVisibleGeneration } from './usePageVisible';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getTodayKST, kstMidnightMs, msUntilNextKstMidnight } from '../lib/kst-date';
import { mapPoll } from '../lib/mappers';
import type { Poll } from '../types';

export type TallyScope = 'all' | 'today' | 'none';

interface UsePollsOptions {
  tallyScope?: TallyScope;
  /**
   * 오늘 마감한 투표도 실시간으로 받을지. 기본은 false.
   * - 투표자 폰(130대): false. 실시간 구독은 대기·진행 중 투표 하나만 두고, 오늘 마감한 투표는 열 때 한 번 읽는다.
   * - 현황판·관리자 화면 안 현황판(1대): true. 마감 뒤 '결과 공개'를 바로 띄워야 한다.
   */
  liveClosed?: boolean;
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
  const liveClosed = options.liveClosed ?? false;
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
    // 투표자 화면과 현황판은 지난 투표를 읽지 않는다.
    // - 대기·진행 중 투표(언제 만들었든)는 실시간 구독한다. 마감은 되돌릴 수 없어 closed 는 여기서 빠진다.
    // - 오늘(KST) 마감한 투표는 liveClosed 면 실시간, 아니면 처음에 한 번만 읽는다. closedAt 은 마감 때만 쓰인다.
    // - 보는 중에 진행 중 투표가 마감되면(대기·진행 목록에서 빠지면) 그 투표만 한 번 다시 읽어 마감 상태로 넣는다.
    // 여러 필드 범위를 or 로 묶으면 그 필드가 없는 문서(진행 중 투표의 closedAt)가 빠지므로 쓰지 않는다.
    const since = kstMidnightMs(kstDay);
    let cancelled = false;
    let openDocs: Poll[] = [];
    const closedById = new Map<string, Poll>();
    let openReady = false;
    let closedReady = false;
    const publish = () => {
      if (cancelled || !openReady || !closedReady) return;
      const openIds = new Set(openDocs.map((poll) => poll.id));
      const closed = [...closedById.values()].filter((poll) => !openIds.has(poll.id));
      const next = [...openDocs, ...closed];
      next.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setPolls(next);
      setLoading(false);
    };
    const closedTodayQuery = query(collection(db, 'polls'), where('closedAt', '>=', since));
    const takeClosed = (docs: Poll[]) => {
      closedById.clear();
      docs.filter((poll) => poll.status === 'closed').forEach((poll) => closedById.set(poll.id, poll));
      closedReady = true;
      publish();
    };

    const unsubOpen = onSnapshot(
      query(collection(db, 'polls'), where('status', 'in', ['waiting', 'active'])),
      (snap) => {
        openDocs = snap.docs.map(mapPoll);
        openReady = true;
        if (!liveClosed) {
          // 목록에서 빠진 투표는 마감됐거나 지워졌다. 한 번 읽어 마감이면 넣고, 없으면 뺀다.
          snap.docChanges()
            .filter((change) => change.type === 'removed')
            .forEach((change) => {
              getDoc(doc(db, 'polls', change.doc.id))
                .then((pollSnap) => {
                  if (!pollSnap.exists()) {
                    closedById.delete(change.doc.id);
                  } else {
                    const poll = mapPoll(pollSnap);
                    if (poll.status === 'closed') closedById.set(poll.id, poll);
                  }
                  publish();
                })
                .catch(() => {
                  closedById.delete(change.doc.id);
                  publish();
                });
            });
        }
        publish();
      },
    );

    let unsubClosed = () => {};
    if (liveClosed) {
      unsubClosed = onSnapshot(closedTodayQuery, (snap) => takeClosed(snap.docs.map(mapPoll)));
    } else {
      getDocs(closedTodayQuery)
        .then((snap) => {
          if (!cancelled) takeClosed(snap.docs.map(mapPoll));
        })
        .catch(() => {
          if (!cancelled) takeClosed([]);
        });
    }
    return () => {
      cancelled = true;
      unsubOpen();
      unsubClosed();
    };
  }, [audience, visibleGeneration, kstDay, liveClosed]);

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
