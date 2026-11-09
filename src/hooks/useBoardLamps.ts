import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ensureVoterUser } from '../lib/voter-auth';
import { useCurrentMeeting } from './useCurrentMeeting';
import type { BoardLamp } from '../types';

interface UseBoardLampsResult {
  lamps: BoardLamp[];
  loading: boolean;
  error: string | null;
}

const NO_LAMPS: BoardLamp[] = [];

/** 현재 모임의 번호만 읽는다. 예전 모임 번호는 남아 있어도 보이지 않는다. */
export function useBoardLamps(): UseBoardLampsResult {
  const { meetingId, loading: meetingLoading } = useCurrentMeeting();
  const [state, setState] = useState<{ key: string; lamps: BoardLamp[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    return onSnapshot(
      query(collection(db, 'lamps'), where('meetingId', '==', meetingId)),
      (snap) => {
        const next = snap.docs.flatMap((lampDoc) => {
          const data = lampDoc.data();
          const badge = data.badge;
          const lampState = data.state;
          if (typeof badge !== 'number' || !Number.isInteger(badge)) return [];
          if (lampState !== 'seated' && lampState !== 'pending' && lampState !== 'voted') return [];
          return [{
            badge,
            state: lampState,
            pollId: typeof data.pollId === 'string' ? data.pollId : '',
          } satisfies BoardLamp];
        });
        next.sort((a, b) => a.badge - b.badge);
        setState({ key: meetingId, lamps: next, error: null });
      },
      () => setState({ key: meetingId, lamps: NO_LAMPS, error: '현황을 불러오지 못했습니다.' }),
    );
  }, [meetingId]);

  if (meetingLoading) return { lamps: NO_LAMPS, loading: true, error: null };
  if (!meetingId) return { lamps: NO_LAMPS, loading: false, error: null };
  if (!state || state.key !== meetingId) return { lamps: NO_LAMPS, loading: true, error: null };
  return { lamps: state.lamps, loading: false, error: state.error };
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
