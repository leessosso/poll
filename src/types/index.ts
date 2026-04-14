export type PollType = 'yesno' | 'choice';
export type PollStatus = 'waiting' | 'active' | 'closed';

export interface Poll {
  id: string;
  title: string;
  type: PollType;
  options: string[];
  status: PollStatus;
  createdAt: number;
  results: Record<string, number>;
  showResults: boolean;
}
