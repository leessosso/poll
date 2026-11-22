import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Poll } from '../types';
import PollDecisionBadge from './PollDecisionBadge';
import ResultsBar from './ResultsBar';

interface ClosedPollCardProps {
  poll: Poll;
}

export default function ClosedPollCard({ poll }: ClosedPollCardProps) {
  const [open, setOpen] = useState(false);
  const [fetchedResults, setFetchedResults] = useState<Record<string, number> | null>(null);
  const hasInlineResults = Object.keys(poll.results).length > 0;
  const needsFetch = open && poll.showResults && !hasInlineResults && fetchedResults === null;

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
    ? poll
    : { ...poll, results: fetchedResults ?? {} };

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
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
            {poll.showResults ? (
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
