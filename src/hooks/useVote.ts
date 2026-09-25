import { useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { hasVoted, markVoted } from '../lib/poll-utils';
import { castAttendanceVote, castRosterVote } from '../lib/vote-service';
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
        const pollRef = doc(db, 'polls', poll.id);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(pollRef);
          if (!snap.exists()) return;
          const current = snap.data().results ?? {};
          tx.update(pollRef, {
            [`results.${choice}`]: (current[choice] ?? 0) + 1,
          });
        });
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
