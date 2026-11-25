import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { mapPoll } from '../lib/mappers';
import type { Poll } from '../types';
import PollDecisionBadge from './PollDecisionBadge';
import ResultsBar from './ResultsBar';

interface ClosedPollCardProps {
  poll: Poll;
}

export default function ClosedPollCard({ poll }: ClosedPollCardProps) {
  const [open, setOpen] = useState(false);
  const [fetchedResults, setFetchedResults] = useState<Record<string, number> | null>(null);
  // 투표자 화면은 마감 투표를 실시간 구독하지 않는다. 펼칠 때 투표 문서를 한 번 읽어 결과 공개 여부를 최신으로 맞춘다.
  const [freshPoll, setFreshPoll] = useState<Poll | null>(null);
  const [freshKey, setFreshKey] = useState<number | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const current: Poll = freshPoll ? { ...poll, ...freshPoll, results: poll.results } : poll;
  const hasInlineResults = Object.keys(poll.results).length > 0;
  const checking = open && freshKey !== openCount;
  const needsFetch = open && !checking && current.showResults && !hasInlineResults && fetchedResults === null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getDoc(doc(db, 'polls', poll.id))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) setFreshPoll(mapPoll(snap));
        setFreshKey(openCount);
      })
      .catch(() => {
        if (!cancelled) setFreshKey(openCount);
      });
    return () => {
      cancelled = true;
    };
  }, [open, openCount, poll.id]);

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    getDoc(doc(db, 'polls', poll.id, 'tally', 'current'))
      .then((snap) => {
        if (cancelled) return;
        const counts = snap.exists() ? (snap.data().counts ?? {}) : {};
        setFetchedResults(counts);
      })
      .catch(() => {
        if (!cancelled) setFetchedResults({});
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, poll.id]);

  const effectivePoll: Poll = hasInlineResults
    ? current
    : { ...current, results: fetchedResults ?? {} };

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
      <button
        onClick={() => {
          if (!open) setOpenCount((count) => count + 1);
          setOpen(!open);
        }}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <span className="text-xs text-gray-400 font-medium">완료</span>
          <p className="text-gray-700 font-medium">{poll.title}</p>
        </div>
        <span className="text-gray-400 text-lg">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-50">
          <div className="pt-4 space-y-3">
            {checking ? (
              <p className="text-center text-sm text-gray-400">결과를 불러오는 중...</p>
            ) : current.showResults ? (
              needsFetch ? (
                <p className="text-center text-sm text-gray-400">결과를 불러오는 중...</p>
              ) : (
                <>
                  <PollDecisionBadge poll={effectivePoll} />
                  <ResultsBar poll={effectivePoll} />
                </>
              )
            ) : (
              <p className="text-center text-sm text-gray-400">결과가 아직 공개되지 않았습니다</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
