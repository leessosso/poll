import { useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { checkinId } from '../lib/meeting';
import { clearRosterClaim, loadRosterClaim, storeRosterClaim } from '../lib/session-storage';
import { useCurrentMeeting } from './useCurrentMeeting';
import type { RosterClaim } from '../types';

interface UseRosterClaimResult {
  claim: RosterClaim | null;
  ready: boolean;
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
 * - 브라우저에 저장된 입장이 있으면 서버 문서와 맞는지 계속 확인한다.
 * - 저장된 입장이 없어도 같은 익명 계정이 현재 모임에 입장해 있으면 자동으로 다시 연결한다.
 * - 관리자가 다시 연결(재발급)로 회수하면 이 기기의 입장은 풀린다.
 */
export function useRosterClaim(): UseRosterClaimResult {
  const { meetingId, loading: meetingLoading } = useCurrentMeeting();
  const [state, setState] = useState<ClaimState>(() => ({ claim: loadRosterClaim(), checkedKey: null }));
  const uid = auth.currentUser?.uid ?? '';
  const stored = state.claim;
  const current = stored && stored.meetingId === meetingId ? stored : null;
  const key = `${meetingId}:${uid}:${current?.claimToken ?? ''}`;

  // 저장된 입장이 지난 모임 것이면 버린다.
  useEffect(() => {
    if (meetingLoading || !stored || stored.meetingId === meetingId) return;
    clearRosterClaim();
  }, [meetingLoading, meetingId, stored]);

  // 저장된 입장을 서버의 본인 입장 문서와 맞춰 본다.
  useEffect(() => {
    if (meetingLoading || !current || !uid) return;
    return onSnapshot(
      doc(db, 'checkins', checkinId(current.meetingId, uid)),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        if (!data || data.revoked !== false || data.claimToken !== current.claimToken) {
          clearRosterClaim();
          setState({ claim: null, checkedKey: null });
          return;
        }
        const next = claimFromCheckin(data);
        if (next && next.badge !== current.badge) storeRosterClaim(next);
        setState({ claim: next ?? current, checkedKey: `${meetingId}:${uid}:${current.claimToken}` });
      },
      () => {
        clearRosterClaim();
        setState({ claim: null, checkedKey: null });
      },
    );
    // current 는 claimToken 으로 대표된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingLoading, meetingId, uid, current?.claimToken]);

  // 저장된 입장이 없으면 같은 계정의 현재 모임 입장을 찾아 자동으로 다시 연결한다.
  useEffect(() => {
    if (meetingLoading || current || !uid || !meetingId) return;
    let cancelled = false;
    getDocs(
      query(
        collection(db, 'checkins'),
        where('meetingId', '==', meetingId),
        where('authUid', '==', uid),
        where('revoked', '==', false),
        limit(1),
      ),
    )
      .then((snap) => {
        if (cancelled) return;
        const found = snap.empty ? null : claimFromCheckin(snap.docs[0].data());
        if (found) {
          storeRosterClaim(found);
          setState({ claim: found, checkedKey: null });
        } else {
          setState({ claim: null, checkedKey: `${meetingId}:${uid}:` });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ claim: null, checkedKey: `${meetingId}:${uid}:` });
      });
    return () => {
      cancelled = true;
    };
  }, [meetingLoading, meetingId, uid, current]);

  const saveClaim = (next: RosterClaim) => {
    storeRosterClaim(next);
    setState({ claim: next, checkedKey: null });
  };

  // 모임이 아직 없으면 확인할 입장도 없다.
  const ready = !meetingLoading && (!meetingId || !uid || state.checkedKey === key);
  return { claim: current, ready, saveClaim };
}
