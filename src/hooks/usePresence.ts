import { useEffect } from 'react';
import {
  ref,
  onDisconnect,
  remove,
  runTransaction as runRtdbTransaction,
  update,
  onValue,
  set,
} from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { getClientId, getSessionId } from '../lib/client-id';

/** KST 기준 오늘 날짜를 YYYY-MM-DD 형식으로 반환 */
function getTodayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 투표 화면 접속자 presence 등록 훅.
 *
 * - visitors/{date}/{clientId}: 날짜별 방문 기록 (KST 기준 하루마다 초기화)
 * - presence/{sessionId}: 실시간 접속 여부 (탭/브라우저 종료 시 onDisconnect로 자동 제거)
 *
 * Firebase RTDB의 onDisconnect가 동작하지 못한 경우(갑작스러운 모바일 연결 끊김 등)를
 * 대비해 heartbeat(30초 간격)로 lastSeenAt을 갱신한다.
 * 관리자 대시보드에서는 lastSeenAt이 1분 이상 지난 항목을 stale로 간주한다.
 */
export function usePresence(): void {
  useEffect(() => {
    const clientId = getClientId();
    const sessionId = getSessionId();
    const today = getTodayKST();
    const visitorRef = ref(rtdb, `visitors/${today}/${clientId}`);
    const presenceRef = ref(rtdb, `presence/${sessionId}`);
    const connectedRef = ref(rtdb, '.info/connected');

    // 방문 기록 갱신 (누적)
    void runRtdbTransaction(visitorRef, (current) => {
      const now = Date.now();
      if (current) {
        return { ...current, lastSeenAt: now, visitCount: (current.visitCount ?? 0) + 1 };
      }
      return { firstSeenAt: now, lastSeenAt: now, visitCount: 1 };
    });

    // Firebase 연결 상태 감지 → 연결될 때마다 presence 재등록
    // (재연결 시에도 onDisconnect + set을 다시 설정해야 함)
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;
      void registerPresence();
    });

    async function registerPresence() {
      try {
        // onDisconnect 먼저 등록한 뒤 set해야 원자적으로 동작함
        await onDisconnect(presenceRef).remove();
        await set(presenceRef, {
          clientId,
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        });
      } catch (err) {
        console.error('[presence] registration failed', err);
      }
    }

    function touchPresence() {
      const ts = Date.now();
      void update(visitorRef, { lastSeenAt: ts });
      void update(presenceRef, { lastSeenAt: ts });
    }

    const intervalId = window.setInterval(touchPresence, 30_000);
    document.addEventListener('visibilitychange', touchPresence);

    return () => {
      unsubConnected();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', touchPresence);
      touchPresence();
      void remove(presenceRef);
    };
  }, []);
}
