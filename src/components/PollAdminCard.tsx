import { getPollTotal } from '../lib/poll-utils';
import type { Poll } from '../types';
import ResultsBar from './ResultsBar';

const STATUS_COLOR: Record<Poll['status'], string> = {
  waiting: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<Poll['status'], string> = {
  waiting: '대기 중',
  active: '진행 중',
  closed: '완료',
};

interface PollAdminCardProps {
  poll: Poll;
  expanded: boolean;
  onToggle: () => void;
  onActivate?: () => void;
  onEdit?: () => void;
  onClose?: (poll: Poll) => void;
  onDelete: (poll: Poll) => void;
  onToggleResults: (poll: Poll) => void;
}

export default function PollAdminCard({
  poll,
  expanded,
  onToggle,
  onActivate,
  onEdit,
  onClose,
  onDelete,
  onToggleResults,
}: PollAdminCardProps) {
  const total = getPollTotal(poll);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span
              className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${STATUS_COLOR[poll.status]}`}
            >
              {STATUS_LABEL[poll.status]}
            </span>
            <p className="text-gray-800 font-semibold truncate">{poll.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {poll.type === 'yesno' ? '찬반' : `${poll.options.length}개 선택지`} · 총 {total}표
            </p>
          </div>
          <span className="text-gray-400 mt-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-50 space-y-4">
          <div className="pt-4">
            <ResultsBar poll={poll} />
          </div>

          <div className="flex flex-wrap gap-2">
            {poll.status === 'waiting' && onActivate && (
              <button
                onClick={onActivate}
                className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600"
              >
                투표 시작
              </button>
            )}
            {poll.status === 'waiting' && onEdit && (
              <button
                onClick={onEdit}
                className="px-4 py-2 bg-white text-indigo-600 border border-indigo-300 rounded-lg text-sm font-medium hover:bg-indigo-50"
              >
                수정
              </button>
            )}
            {poll.status === 'active' && onClose && (
              <button
                onClick={() => onClose(poll)}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
              >
                투표 마감
              </button>
            )}
            {(poll.status === 'active' || poll.status === 'closed') && (
              <button
                onClick={() => onToggleResults(poll)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  poll.showResults
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-300'
                }`}
              >
                {poll.showResults ? '결과 공개 중' : '결과 공개'}
              </button>
            )}
            <button
              onClick={() => onDelete(poll)}
              className="px-4 py-2 bg-white text-red-400 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
