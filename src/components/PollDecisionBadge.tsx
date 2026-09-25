import { getPollDecision, getPollTotal, getQuorumStatus } from '../lib/poll-utils';
import type { Poll } from '../types';

interface PollDecisionBadgeProps {
  poll: Poll;
}

/** 찬반 투표 마감 후 정족수/가결 여부를 뱃지로 보여준다. quorumTarget/passRatio가 설정되지 않았으면 아무것도 표시하지 않는다. */
export default function PollDecisionBadge({ poll }: PollDecisionBadgeProps) {
  if (poll.type !== 'yesno') return null;
  if (!poll.quorumTarget && !poll.passRatio) return null;

  const result = getPollDecision(poll);

  if (result.decision === 'quorum-not-met') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-center">
        <p className="text-yellow-700 font-bold">정족수 미달</p>
        <p className="text-yellow-600 text-xs mt-1">
          참여 {result.total}명 / 정족수 {result.quorumTarget}명
        </p>
      </div>
    );
  }

  if (result.decision === 'passed' || result.decision === 'rejected') {
    const passed = result.decision === 'passed';
    return (
      <div
        className={`rounded-xl px-4 py-3 text-center border ${
          passed ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'
        }`}
      >
        <p className={`font-bold ${passed ? 'text-blue-700' : 'text-red-600'}`}>
          {passed ? '가결' : '부결'}
        </p>
        <p className={`text-xs mt-1 ${passed ? 'text-blue-500' : 'text-red-400'}`}>
          찬성 {result.approveCount} · 반대 {result.rejectCount} · 기준 {Math.round(result.passRatio * 100)}%
        </p>
      </div>
    );
  }

  return null;
}

/** 진행 중인 투표의 정족수 충족 현황을 실시간으로 보여준다 (선택 내용은 노출하지 않음). */
export function QuorumProgress({ poll }: PollDecisionBadgeProps) {
  if (!poll.quorumTarget) return null;
  const status = getQuorumStatus(poll);
  const total = getPollTotal(poll);
  const percent = Math.min(100, Math.round((total / poll.quorumTarget) * 100));

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">
        <span>정족수 진행률</span>
        <span>
          {total} / {poll.quorumTarget}명
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            status === 'met' ? 'bg-green-500' : 'bg-indigo-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
