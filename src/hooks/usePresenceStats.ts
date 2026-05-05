import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';

/** onDisconnect가 실패해도 1분 이상 heartbeat 없는 항목은 오프라인으로 간주 */
const STALE_THRESHOLD_MS = 1 * 60 * 1000;

interface PresenceStats {
  /** 현재 실시간 접속 중인 세션 수 */
  presenceCount: number;
  /** 앱에 한 번이라도 접속한 고유 기기 수 */
  visitorCount: number;
}

export function usePresenceStats(): PresenceStats {
  const [presenceCount, setPresenceCount] = useState(0);
  const [visitorCount, setVisitorCount] = useState(0);

  useEffect(() => {
    const presenceRef = ref(rtdb, 'presence');
    const unsub = onValue(presenceRef, (snap) => {
      if (!snap.exists()) {
        setPresenceCount(0);
        return;
      }
      const now = Date.now();
      const entries = Object.values(snap.val() as Record<string, { lastSeenAt?: number }>);
      // lastSeenAt이 2분 이내인 항목만 활성 접속으로 집계
      const active = entries.filter(
        (e) => e.lastSeenAt !== undefined && now - e.lastSeenAt < STALE_THRESHOLD_MS,
      );
      setPresenceCount(active.length);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const visitorsRef = ref(rtdb, 'visitors');
    const unsub = onValue(visitorsRef, (snap) => {
      setVisitorCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });
    return unsub;
  }, []);

  return { presenceCount, visitorCount };
}
