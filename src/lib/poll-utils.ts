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

export type QuorumStatus = 'not-configured' | 'met' | 'not-met';

/** 정족수(quorumTarget) 대비 현재 참여 인원 충족 여부 */
export function getQuorumStatus(poll: Poll): QuorumStatus {
  if (!poll.quorumTarget || poll.quorumTarget <= 0) return 'not-configured';
  return getPollTotal(poll) >= poll.quorumTarget ? 'met' : 'not-met';
}

export type PollDecision = 'not-applicable' | 'quorum-not-met' | 'passed' | 'rejected';

export interface PollDecisionResult {
  decision: PollDecision;
  approveCount: number;
  rejectCount: number;
  total: number;
  quorumTarget?: number;
  passRatio: number;
}

/**
 * 찬반 투표(yesno)의 가결/부결 여부를 판정한다.
 * - 정족수(quorumTarget)가 설정되어 있고 총 참여 인원이 미달이면 'quorum-not-met'
 * - 찬성 / (찬성 + 반대) >= passRatio(기본 과반 0.5) 이면 'passed', 아니면 'rejected'
 * - 기권표는 가결 비율 계산에서 분모에 포함하지 않는다 (정족수 판단에는 포함됨: getPollTotal 기준)
 * - yesno가 아니거나 결과가 아직 없으면 'not-applicable'
 */
export function getPollDecision(poll: Poll): PollDecisionResult {
  const passRatio = poll.passRatio ?? 0.5;
  const approveCount = poll.results?.['찬성'] ?? 0;
  const rejectCount = poll.results?.['반대'] ?? 0;
  const total = getPollTotal(poll);

  if (poll.type !== 'yesno') {
    return { decision: 'not-applicable', approveCount, rejectCount, total, quorumTarget: poll.quorumTarget, passRatio };
  }

  if (getQuorumStatus(poll) === 'not-met') {
    return { decision: 'quorum-not-met', approveCount, rejectCount, total, quorumTarget: poll.quorumTarget, passRatio };
  }

  const decisiveTotal = approveCount + rejectCount;
  const decision: PollDecision =
    decisiveTotal > 0 && approveCount / decisiveTotal >= passRatio ? 'passed' : 'rejected';

  return { decision, approveCount, rejectCount, total, quorumTarget: poll.quorumTarget, passRatio };
}
