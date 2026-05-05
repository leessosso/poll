import { useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { hasVoted, markVoted } from '../lib/poll-utils';
import type { Poll } from '../types';

interface UseVoteResult {
  votingFor: string | null;
  handleVote: (poll: Poll, choice: string) => Promise<void>;
}

export function useVote(): UseVoteResult {
  const [votingFor, setVotingFor] = useState<string | null>(null);

  const handleVote = async (poll: Poll, choice: string) => {
    if (hasVoted(poll.id) || votingFor) return;
    setVotingFor(poll.id);
    try {
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
    } catch (err) {
      console.error('[vote] transaction failed', err);
    } finally {
      setVotingFor(null);
    }
  };

  return { votingFor, handleVote };
}
