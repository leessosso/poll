import type { BoardLamp, Poll } from '../types';

export interface BoardView {
  title: string;
  caption: string;
  phase: 'before' | 'live' | 'closed';
  lamps: BoardLamp[];
  voted: number;
  total: number;
  poll: Poll | null;
}

export function boardView(polls: Poll[], lamps: BoardLamp[]): BoardView {
  const today = kstDay(Date.now());
  const todays = polls.filter((poll) => isSameKstDay(poll, today));
  const live = todays.find((poll) => poll.status === 'active' && poll.eligibilityMode === 'roster');
  if (live) return summarize(live.title, '진행 중', 'live', lamps.filter((lamp) => lamp.pollId === live.id), live);

  const linkedId = lamps.find((lamp) => lamp.pollId && lamp.state !== 'seated')?.pollId ?? '';
  const linked = todays.find((poll) => poll.id === linkedId && poll.eligibilityMode === 'roster');
  if (linked) {
    return summarize(linked.title, '마감', 'closed', lamps.filter((lamp) => lamp.pollId === linked.id), linked);
  }

  const newest = todays[0];
  if (newest?.status === 'closed') {
    return summarize(newest.title, '마감', 'closed', [], newest);
  }

  const seated = lamps.filter((lamp) => lamp.state === 'seated');
  return summarize('입장 현황', '투표 시작 전', 'before', seated, null);
}

function kstDay(timestamp: number): string {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isSameKstDay(poll: Poll, today: string): boolean {
  return [poll.createdAt, poll.startedAt, poll.closedAt].some(
    (value) => typeof value === 'number' && value > 0 && kstDay(value) === today,
  );
}

function summarize(
  title: string,
  caption: string,
  phase: BoardView['phase'],
  rows: BoardLamp[],
  poll: Poll | null,
): BoardView {
  const voted = rows.filter((lamp) => lamp.state === 'voted').length;
  return { title, caption, phase, lamps: rows, voted, total: rows.length, poll };
}
