import type { Poll } from '../types';

export function getOptions(poll: Poll): string[] {
  if (poll.type === 'yesno') return poll.allowAbstain ? ['찬성', '반대', '기권'] : ['찬성', '반대'];
  return poll.options;
}

export function getPollTotal(poll: Poll): number {
  return Object.values(poll.results ?? {}).reduce((a, b) => a + b, 0);
}

export function isPollExpired(poll: Poll, now = Date.now()): boolean {
  return typeof poll.endsAt === 'number' && now >= poll.endsAt;
}

export function getDefaultDurationSeconds(poll: Partial<Poll>): number {
  return poll.durationSeconds ?? 180;
}

export function hasVoted(pollId: string): boolean {
  return localStorage.getItem(`voted_${pollId}`) === 'true';
}

export function markVoted(pollId: string): void {
  localStorage.setItem(`voted_${pollId}`, 'true');
}
