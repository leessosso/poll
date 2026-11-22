import type { Poll } from '../types';

export type BoardMode = 'standby' | 'results';

/**
 * 대기 모드를 쓸지 결정한다.
 * 새 투표가 시작되거나, 대기에 들어간 뒤에 투표가 만들어지면 자동으로 해제한다.
 */
export function isBoardStandby(mode: BoardMode, updatedAt: number, polls: Poll[]): boolean {
  if (mode !== 'standby') return false;
  if (polls.some((poll) => poll.status === 'active')) return false;
  return !polls.some((poll) => typeof poll.createdAt === 'number' && poll.createdAt > updatedAt);
}
