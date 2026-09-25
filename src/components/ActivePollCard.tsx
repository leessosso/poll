import { useState } from 'react';
import { getOptions, hasVoted } from '../lib/poll-utils';
import type { Poll } from '../types';
import PollCountdown from './PollCountdown';
import { QuorumProgress } from './PollDecisionBadge';
import ResultsBar from './ResultsBar';
import VoteConfirmModal from './VoteConfirmModal';

interface ActivePollCardProps {
  poll: Poll;
  onVote: (poll: Poll, choice: string) => Promise<boolean>;
  voting: boolean;
  voted?: boolean;
  error?: string | null;
}

export default function ActivePollCard({
  poll,
  onVote,
  voting,
  voted: votedOverride,
  error,
}: ActivePollCardProps) {
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const voted = votedOverride !== undefined ? votedOverride : hasVoted(poll.id);
  const options = getOptions(poll);

  const handleConfirm = async () => {
    if (!pendingChoice) return;
    const ok = await onVote(poll, pendingChoice);
    if (ok) setPendingChoice(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
      <div className="bg-indigo-600 px-5 py-3 flex items-center gap-2">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <span className="text-white text-sm font-medium">진행 중</span>
      </div>
      <div className="p-5">
        <h2 className="text-xl font-bold text-gray-800 mb-4">{poll.title}</h2>
        <div className="mb-4 space-y-3">
          <PollCountdown poll={poll} />
          <QuorumProgress poll={poll} />
        </div>

        {voted ? (
          <div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-medium mb-4">
              ✓ 투표 완료
            </div>
            {poll.showResults ? (
              <ResultsBar poll={poll} />
            ) : (
              <p className="text-center text-sm text-gray-400">결과는 투표 종료 후 공개됩니다</p>
            )}
          </div>
        ) : (
          <div className={`grid gap-3 ${poll.type === 'yesno' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
            {options.map((option) => {
              const isYes = option === '찬성';
              const isAbstain = option === '기권';
              const btnColor =
                poll.type === 'yesno'
                  ? isAbstain
                    ? 'bg-gray-500 hover:bg-gray-600 active:bg-gray-700'
                    : isYes
                    ? 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700'
                    : 'bg-red-400 hover:bg-red-500 active:bg-red-600'
                  : 'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700';

              return (
                <button
                  key={option}
                  onClick={() => setPendingChoice(option)}
                  disabled={voting}
                  className={`${btnColor} text-white font-semibold py-5 rounded-xl text-lg transition-all active:scale-95 disabled:opacity-50 shadow-sm`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="text-center text-sm text-red-500 mt-4">{error}</p>}
      </div>
      {pendingChoice && (
        <VoteConfirmModal
          choice={pendingChoice}
          loading={voting}
          onConfirm={handleConfirm}
          onCancel={() => setPendingChoice(null)}
        />
      )}
    </div>
  );
}
