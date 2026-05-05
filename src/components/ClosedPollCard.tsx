import { useState } from 'react';
import type { Poll } from '../types';
import ResultsBar from './ResultsBar';

interface ClosedPollCardProps {
  poll: Poll;
}

export default function ClosedPollCard({ poll }: ClosedPollCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
          <div className="pt-4">
            <ResultsBar poll={poll} />
          </div>
        </div>
      )}
    </div>
  );
}
