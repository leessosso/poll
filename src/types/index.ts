export type PollType = 'yesno' | 'choice';
export type PollStatus = 'waiting' | 'active' | 'closed';
export type EligibilityMode = 'open' | 'attendance';
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

export interface Participation {
  id: string;
  voterId: string;
  voterName: string;
  status: ParticipationStatus;
  completedAt?: number;
}
