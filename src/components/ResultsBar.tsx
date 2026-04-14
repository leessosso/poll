import type { Poll } from '../types';

interface ResultsBarProps {
  poll: Poll;
}

function getOptions(poll: Poll): string[] {
  if (poll.type === 'yesno') return ['찬성', '반대'];
  return poll.options;
}

export default function ResultsBar({ poll }: ResultsBarProps) {
  const options = getOptions(poll);
  const total = options.reduce((sum, opt) => sum + (poll.results[opt] ?? 0), 0);

  return (
    <div className="space-y-3">
      {options.map((option) => {
        const count = poll.results[option] ?? 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        const isYes = option === '찬성';
        const barColor =
          poll.type === 'yesno'
            ? isYes
              ? 'bg-blue-500'
              : 'bg-red-400'
            : 'bg-indigo-500';

        return (
          <div key={option}>
            <div className="flex justify-between text-sm font-medium mb-1">
              <span className="text-gray-700">{option}</span>
              <span className="text-gray-500">
                {count}표 ({percent}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden">
              <div
                className={`${barColor} h-5 rounded-full transition-all duration-500`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-gray-400 text-right pt-1">총 {total}명 참여</p>
    </div>
  );
}
