import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { getTodayKST, msUntilNextKstMidnight } from '../lib/kst-date';

/** onDisconnect가 실패해도 1분 이상 heartbeat 없는 항목은 오프라인으로 간주 */
const STALE_THRESHOLD_MS = 1 * 60 * 1000;

interface PresenceStats {
  /** 현재 실시간 접속 중인 세션 수 */
  presenceCount: number;
  /** 오늘(KST) 앱에 한 번이라도 접속한 고유 기기 수 */
  visitorCount: number;
  /** 이번 구독의 첫 스냅샷을 받았는지 */
  ready: boolean;
}

/**
 * 접속·오늘 방문 수.
 * refreshKey 가 바뀌면 구독을 끊고 다시 걸어 최신 값을 받는다.
 * 방문 경로는 KST 날짜가 바뀌면(새로고침 또는 자정) 다시 구독한다.
 */
export function usePresenceStats(refreshKey = 0): PresenceStats {
  const [presenceCount, setPresenceCount] = useState(0);
  const [visitorCount, setVisitorCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [seenKey, setSeenKey] = useState(refreshKey);
  if (seenKey !== refreshKey) {
    setSeenKey(refreshKey);
    setReady(false);
  }

  useEffect(() => {
    let presenceReady = false;
    let visitorsReady = false;
    const mark = () => {
      if (presenceReady && visitorsReady) setReady(true);
    };

    const unsubPresence = onValue(ref(rtdb, 'presence'), (snap) => {
      if (!snap.exists()) {
        setPresenceCount(0);
      } else {
        const now = Date.now();
        const entries = Object.values(snap.val() as Record<string, { lastSeenAt?: number }>);
        const active = entries.filter(
          (entry) => entry.lastSeenAt !== undefined && now - entry.lastSeenAt < STALE_THRESHOLD_MS,
        );
        setPresenceCount(active.length);
      }
      presenceReady = true;
      mark();
    });

    let unsubVisitors = subscribeVisitors();

    function subscribeVisitors() {
      const date = getTodayKST();
      return onValue(ref(rtdb, `visitors/${date}`), (snap) => {
        setVisitorCount(snap.exists() ? Object.keys(snap.val() as object).length : 0);
        visitorsReady = true;
        mark();
      });
    }

    const rollover = window.setTimeout(() => {
      unsubVisitors();
      visitorsReady = false;
      setReady(false);
      unsubVisitors = subscribeVisitors();
    }, msUntilNextKstMidnight());

    return () => {
      unsubPresence();
      unsubVisitors();
      window.clearTimeout(rollover);
    };
  }, [refreshKey]);

  return { presenceCount, visitorCount, ready };
}
