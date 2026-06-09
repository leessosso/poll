import { useEffect, useState } from 'react';
import type { Poll } from '../types';

interface PollCountdownProps {
  poll: Poll;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function PollCountdown({ poll }: PollCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!poll.endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [poll.endsAt]);

  if (!poll.endsAt || poll.status !== 'active') return null;

  const remainingMs = poll.endsAt - now;
  const expired = remainingMs <= 0;

  return (
    <div
      className={`rounded-xl px-4 py-3 text-center font-bold ${
        expired ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'
      }`}
    >
      {expired ? '투표 시간이 종료되었습니다' : `남은 시간 ${formatTime(remainingMs)}`}
    </div>
  );
}
