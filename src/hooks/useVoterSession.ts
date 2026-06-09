import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  clearStoredVoterSession,
  loadStoredVoterSession,
  storeVoterSession,
} from '../lib/session-storage';
import type { AttendanceSession, VoterSession } from '../types';

interface UseVoterSessionResult {
  session: VoterSession | null;
  loading: boolean;
  error: string | null;
}

export function useVoterSession(sessionId?: string): UseVoterSessionResult {
  const [session, setSession] = useState<VoterSession | null>(() => loadStoredVoterSession());
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const snap = await getDoc(doc(db, 'attendanceSessions', sessionId));
        if (!snap.exists()) {
          throw new Error('유효하지 않은 투표 세션입니다.');
        }

        const data = { id: snap.id, ...snap.data() } as AttendanceSession;
        if (data.status !== 'active') {
          throw new Error('만료되었거나 사용할 수 없는 투표 세션입니다.');
        }
        if (data.expiresAt <= Date.now()) {
          throw new Error('투표 세션이 만료되었습니다. 안내 데스크에서 다시 확인해 주세요.');
        }

        const nextSession: VoterSession = {
          sessionId: data.id,
          voterId: data.voterId,
          voterName: data.voterName,
          eventId: data.eventId,
          expiresAt: data.expiresAt,
        };

        storeVoterSession(nextSession);
        if (!cancelled) setSession(nextSession);
      } catch (err) {
        clearStoredVoterSession();
        if (!cancelled) {
          setSession(null);
          setError(err instanceof Error ? err.message : '투표 세션을 확인하지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { session, loading, error };
}
