import { useState } from 'react';
import { usePollParticipation } from '../hooks/usePollParticipation';
import type { Poll } from '../types';

interface PollParticipationPanelProps {
  poll: Poll;
}

export default function PollParticipationPanel({ poll }: PollParticipationPanelProps) {
  const { pending, completed, participants, loading } = usePollParticipation(poll);
  const [showCompleted, setShowCompleted] = useState(false);
  const total = participants.length;
  const completedCount = completed.length;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  if (poll.eligibilityMode !== 'attendance' && poll.eligibilityMode !== 'roster') return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-gray-800">실시간 참여 현황</h3>
          <span className="text-sm text-gray-500">
            {loading ? '불러오는 중...' : `${completedCount} / ${total}명`}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className="bg-indigo-600 h-4 rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {loading ? null : total === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
          {poll.eligibilityMode === 'roster'
            ? '투표 시작 전에 입장한 사람이 없습니다. 입장 코드와 이름을 선택한 뒤 투표를 시작하면 명단이 고정됩니다.'
            : '아직 이 투표에 연결된 출석 세션이 없습니다. 출석 세션을 만든 뒤 투표를 시작하면 미참여 목록이 표시됩니다.'}
        </p>
      ) : pending.length === 0 ? (
        <div className="bg-green-50 text-green-700 rounded-lg p-3 font-medium text-center">
          전원 참여 완료
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">미참여 ({pending.length}명)</p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-100">
            {pending.map((person) => (
              <div key={person.id} className="px-3 py-2 text-sm text-gray-700">
                {person.voterName}
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted((prev) => !prev)}
            className="text-sm font-medium text-indigo-600"
          >
            {showCompleted ? '참여 완료 명단 숨기기' : `참여 완료 명단 보기 (${completed.length}명)`}
          </button>
          {showCompleted && (
            <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-100">
              {completed.map((person) => (
                <div key={person.id} className="px-3 py-2 text-sm text-gray-500">
                  {person.voterName} · 완료
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
