export type PollType = 'yesno' | 'choice';
export type PollStatus = 'waiting' | 'active' | 'closed';
export type EligibilityMode = 'open' | 'roster' | 'attendance';
export type VoteChoice = '찬성' | '반대' | '기권' | string;
export type ParticipationStatus = 'pending' | 'completed';
export type AttendanceSessionStatus = 'active' | 'revoked';

export interface Poll {
  id: string;
  title: string;
  type: PollType;
  options: string[];
  status: PollStatus;
  createdAt: number;
  results: Record<string, number>;
  showResults: boolean;
  eligibilityMode: EligibilityMode;
  allowAbstain: boolean;
  eventId?: string;
  durationSeconds?: number;
  startedAt?: number;
  endsAt?: number;
  closedAt?: number;
  /** 정족수: 유효 투표로 인정하기 위한 최소 참여 인원 (미설정 시 정족수 검사 안 함) */
  quorumTarget?: number;
  /** 가결 기준: 찬성 / (찬성 + 반대) 비율. 0~1. 미설정 시 과반(0.5) 기준 */
  passRatio?: number;
}

export interface Voter {
  id: string;
  name: string;
  externalQrId?: string;
  memberNo?: string;
  active: boolean;
  createdAt: number;
}

export interface AttendanceSession {
  id: string;
  eventId: string;
  voterId: string;
  voterName: string;
  checkedInAt: number;
  expiresAt: number;
  scannerId?: string;
  status: AttendanceSessionStatus;
}

export interface VoterSession {
  sessionId: string;
  voterId: string;
  voterName: string;
  eventId: string;
  expiresAt: number;
}

/** 현장 명단에서 이름을 잡은 브라우저. 선택값은 포함하지 않는다. */
export interface RosterClaim {
  voterId: string;
  voterName: string;
  claimToken: string;
}

export interface Participation {
  id: string;
  voterId: string;
  voterName: string;
  status: ParticipationStatus;
  completedAt?: number;
}
