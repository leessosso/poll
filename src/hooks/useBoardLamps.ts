import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ensureVoterUser } from '../lib/voter-auth';
import type { BoardLamp } from '../types';

interface UseBoardLampsResult {
  lamps: BoardLamp[];
  loading: boolean;
  error: string | null;
}

export function useBoardLamps(): UseBoardLampsResult {
  const [lamps, setLamps] = useState<BoardLamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'lamps'),
      (snap) => {
        const next = snap.docs.flatMap((lampDoc) => {
          const data = lampDoc.data();
          const badge = data.badge;
          const state = data.state;
          if (typeof badge !== 'number' || !Number.isInteger(badge)) return [];
          if (state !== 'seated' && state !== 'pending' && state !== 'voted') return [];
          return [{
            badge,
            state,
            pollId: typeof data.pollId === 'string' ? data.pollId : '',
          } satisfies BoardLamp];
        });
        next.sort((a, b) => a.badge - b.badge);
        setLamps(next);
        setError(null);
        setLoading(false);
      },
      () => {
        setError('현황을 불러오지 못했습니다.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { lamps, loading, error };
}

/** 현황판은 관리자 세션이 있어도 열고, 없으면 익명으로 들어온다. */
export function useBoardAccess(): { ready: boolean; error: string | null } {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    auth.authStateReady()
      .then(() => (auth.currentUser ? undefined : ensureVoterUser()))
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '현황판을 열지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}
