import { useState } from 'react';
import { hasVoted, markVoted } from '../lib/poll-utils';
import { castAttendanceVote, castOpenVote, castRosterVote } from '../lib/vote-service';
import type { Poll, RosterClaim, VoterSession } from '../types';

interface UseVoteResult {
  votingFor: string | null;
  error: string | null;
  handleVote: (
    poll: Poll,
    choice: string,
    session?: VoterSession | null,
    claim?: RosterClaim | null,
  ) => Promise<boolean>;
}

export function useVote(): UseVoteResult {
  const [votingFor, setVotingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVote = async (
    poll: Poll,
    choice: string,
    session?: VoterSession | null,
    claim?: RosterClaim | null,
  ) => {
    if (votingFor) return false;
    if (poll.eligibilityMode === 'open' && hasVoted(poll.id)) return false;
    if (poll.eligibilityMode === 'attendance' && !session) {
      setError('출석 인증이 필요한 투표입니다.');
      return false;
    }
    if (poll.eligibilityMode === 'roster' && !claim) {
      setError('이름을 먼저 선택해 주세요.');
      return false;
    }

    setError(null);
    setVotingFor(poll.id);
    try {
      if (poll.eligibilityMode === 'attendance') {
        await castAttendanceVote(poll, choice, session!);
      } else if (poll.eligibilityMode === 'roster') {
        await castRosterVote(poll, choice, claim!);
      } else {
        await castOpenVote(poll, choice);
        markVoted(poll.id);
      }
      return true;
    } catch (err) {
      console.error('[vote] transaction failed', err);
      setError(err instanceof Error ? err.message : '투표 처리 중 오류가 발생했습니다.');
      return false;
    } finally {
      setVotingFor(null);
    }
  };

  return { votingFor, error, handleVote };
}
