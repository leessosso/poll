import { useEffect, useState } from 'react';
import { ensureVoterUser } from '../lib/voter-auth';

export function useVoterAuth(): { ready: boolean; error: string | null } {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureVoterUser()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
        if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
          setError('익명 로그인이 꺼져 있습니다. Firebase 콘솔에서 Anonymous 제공자를 켜 주세요.');
          return;
        }
        setError(err instanceof Error ? err.message : '투표 인증을 시작하지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}
