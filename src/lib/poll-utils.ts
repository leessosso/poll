import type { Poll } from '../types';

export function getOptions(poll: Poll): string[] {
  if (poll.type === 'yesno') return ['찬성', '반대'];
  return poll.options;
}

export function getPollTotal(poll: Poll): number {
  return Object.values(poll.results ?? {}).reduce((a, b) => a + b, 0);
}

export function hasVoted(pollId: string): boolean {
  return localStorage.getItem(`voted_${pollId}`) === 'true';
}

export function markVoted(pollId: string): void {
  localStorage.setItem(`voted_${pollId}`, 'true');
}
