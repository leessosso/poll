import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { checkinId } from '../lib/meeting';
import { clearRosterClaim, loadRosterClaim, storeRosterClaim } from '../lib/session-storage';
import { useCurrentMeeting } from './useCurrentMeeting';
import type { RosterClaim } from '../types';

interface UseRosterClaimResult {
  claim: RosterClaim | null;
  ready: boolean;
  meetingOpen: boolean;
  /** 저장된 입장이 지난 모임 것이라 해제됐는지. 다음 투표 안내를 보여 줄 때 쓴다. */
  clearedStaleClaim: boolean;
  saveClaim: (claim: RosterClaim) => void;
}

type ClaimState = { claim: RosterClaim | null; checkedKey: string | null };

function claimFromCheckin(data: Record<string, unknown>): RosterClaim | null {
  const { meetingId, voterId, voterName, claimToken, badge } = data;
  if (typeof meetingId !== 'string' || typeof voterId !== 'string') return null;
  if (typeof voterName !== 'string' || typeof claimToken !== 'string') return null;
  return {
    meetingId,
    voterId,
    voterName,
    claimToken,
    badge: typeof badge === 'number' && Number.isInteger(badge) ? badge : undefined,
  };
}

/**
 * 이 기기의 현장 입장.
 * - checkins/{meetingId}_{authUid} 단일 문서만 구독해 서버 상태와 맞춘다(1읽기).
 * - localStorage가 비어 있어도 같은 익명 계정이 현재 모임에 입장해 있으면 자동으로 복원한다.
 * - 새 모임이 시작되거나 관리자가 입장 해제(revoked)하면 이 기기의 입장은 풀린다.
 */
export function useRosterClaim(): UseRosterClaimResult {
  const { meetingId, loading: meetingLoading } = useCurrentMeeting();
  const [state, setState] = useState<ClaimState>(() => ({ claim: loadRosterClaim(), checkedKey: null }));
  const [clearedStaleClaim, setClearedStaleClaim] = useState(false);
  const uid = auth.currentUser?.uid ?? '';
  const stored = state.claim;
  const current = stored && stored.meetingId === meetingId ? stored : null;
  const key = `${meetingId}:${uid}`;

  // 저장된 입장이 지난 모임 것이면 버린다.
  useEffect(() => {
    if (meetingLoading || !stored || stored.meetingId === meetingId) return;
    clearRosterClaim();
  }, [meetingLoading, meetingId, stored]);

  // 현재 모임의 본인 입장 문서 1개만 구독한다.
  useEffect(() => {
    if (meetingLoading || !meetingId || !uid) return;
    const expectedKey = `${meetingId}:${uid}`;
    return onSnapshot(
      doc(db, 'checkins', checkinId(meetingId, uid)),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        if (!data || data.revoked !== false) {
          clearRosterClaim();
          setState({ claim: null, checkedKey: expectedKey });
          return;
        }
        const next = claimFromCheckin(data);
        if (!next) {
          clearRosterClaim();
          setState({ claim: null, checkedKey: expectedKey });
          return;
        }
        storeRosterClaim(next);
        setClearedStaleClaim(false);
        setState({ claim: next, checkedKey: expectedKey });
      },
      () => {
        clearRosterClaim();
        setState({ claim: null, checkedKey: expectedKey });
      },
    );
  }, [meetingLoading, meetingId, uid]);

  const saveClaim = (next: RosterClaim) => {
    storeRosterClaim(next);
    setClearedStaleClaim(false);
    setState((prev) => ({ claim: next, checkedKey: prev.checkedKey }));
  };

  // 모임이 아직 없으면 확인할 입장도 없다.
  const ready = !meetingLoading && (!meetingId || !uid || state.checkedKey === key);
  const isStale = !meetingLoading && Boolean(stored && meetingId && stored.meetingId !== meetingId);
  if (isStale && !clearedStaleClaim) {
    setClearedStaleClaim(true);
  }
  return {
    claim: current,
    ready,
    meetingOpen: Boolean(meetingId),
    clearedStaleClaim,
    saveClaim,
  };
}
