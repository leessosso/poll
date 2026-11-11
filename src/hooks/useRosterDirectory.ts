import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useCurrentMeeting } from './useCurrentMeeting';
import type { Voter } from '../types';

export interface RosterCheckin {
  /** checkins 문서 id ({meetingId}_{authUid}). 관리자 화면에서만 채워진다. */
  id: string;
  voterId: string;
  voterName: string;
  badge: number | null;
}

interface UseRosterDirectoryResult {
  meetingId: string;
  voters: Voter[];
  /** 현재 모임에서 쓰이는 입장(관리자만). 회수된 입장은 뺀다. */
  checkins: RosterCheckin[];
  /** 지금 다른 기기가 잡고 있는 이름 */
  claimedIds: Set<string>;
  /** 관리자가 다시 연결을 열어 둔 이름. 새 기기로 다시 고를 수 있다. */
  reissueIds: Set<string>;
  badgeByVoterId: Map<string, number>;
  loading: boolean;
}

const NO_CLAIMS: { voterId: string; reissue: boolean }[] = [];
const NO_CHECKINS: RosterCheckin[] = [];

export function useRosterDirectory(source: 'public' | 'admin' = 'public', refreshKey = 0): UseRosterDirectoryResult {
  const { meetingId, loading: meetingLoading } = useCurrentMeeting();
  const [voters, setVoters] = useState<Voter[]>([]);
  const [checkins, setCheckins] = useState<RosterCheckin[]>([]);
  const [claims, setClaims] = useState<{ voterId: string; reissue: boolean }[]>([]);
  const [votersReady, setVotersReady] = useState(false);
  const [claimsKey, setClaimsKey] = useState<string | null>(null);
  const [checkinsKey, setCheckinsKey] = useState<string | null>(null);
  const [seenRefreshKey, setSeenRefreshKey] = useState(refreshKey);
  if (seenRefreshKey !== refreshKey) {
    setSeenRefreshKey(refreshKey);
    setClaimsKey(null);
    setCheckinsKey(null);
  }

  useEffect(() => {
    const collectionName = source === 'admin' ? 'voters' : 'voterDirectory';
    const unsub = onSnapshot(query(collection(db, collectionName), orderBy('name', 'asc')), (snap) => {
      setVoters(
        snap.docs.map((voterDoc) => {
          const data = voterDoc.data();
          return {
            id: voterDoc.id,
            name: data.name ?? '이름 없음',
            externalQrId: data.externalQrId,
            memberNo: data.memberNo,
            active: data.active ?? true,
            createdAt: data.createdAt ?? 0,
          };
        }),
      );
      setVotersReady(true);
    });
    return unsub;
  }, [source]);

  useEffect(() => {
    if (!meetingId) return;
    const prefix = `${meetingId}_`;
    return onSnapshot(
      query(collection(db, 'claimedNames'), where('meetingId', '==', meetingId)),
      (snap) => {
        setClaims(
          snap.docs
            .filter((claimDoc) => claimDoc.id.startsWith(prefix))
            .map((claimDoc) => ({
              voterId: claimDoc.id.slice(prefix.length),
              reissue: claimDoc.data().reissue === true,
            })),
        );
        setClaimsKey(meetingId);
      },
      () => setClaimsKey(meetingId),
    );
  }, [meetingId, refreshKey]);

  useEffect(() => {
    if (source !== 'admin' || !meetingId) return;
    return onSnapshot(
      query(collection(db, 'checkins'), where('meetingId', '==', meetingId), where('revoked', '==', false)),
      (snap) => {
        setCheckins(
          snap.docs.map((checkinDoc) => {
            const data = checkinDoc.data();
            const badge = data.badge;
            return {
              id: checkinDoc.id,
              voterId: String(data.voterId ?? ''),
              voterName: data.voterName ?? '이름 없음',
              badge: typeof badge === 'number' && Number.isInteger(badge) ? badge : null,
            };
          }),
        );
        setCheckinsKey(meetingId);
      },
      () => setCheckinsKey(meetingId),
    );
  }, [source, meetingId, refreshKey]);

  const liveClaims = meetingId && claimsKey === meetingId ? claims : NO_CLAIMS;
  const liveCheckins = source === 'admin' && meetingId && checkinsKey === meetingId ? checkins : NO_CHECKINS;
  const claimedIds = useMemo(
    () => new Set(liveClaims.filter((claim) => !claim.reissue).map((claim) => claim.voterId)),
    [liveClaims],
  );
  const reissueIds = useMemo(
    () => new Set(liveClaims.filter((claim) => claim.reissue).map((claim) => claim.voterId)),
    [liveClaims],
  );
  const badgeByVoterId = useMemo(() => {
    const badges = new Map<string, number>();
    liveCheckins.forEach((checkin) => {
      if (checkin.badge != null) badges.set(checkin.voterId, checkin.badge);
    });
    return badges;
  }, [liveCheckins]);

  const claimsLoading = Boolean(meetingId) && claimsKey !== meetingId;
  const checkinsLoading = source === 'admin' && Boolean(meetingId) && checkinsKey !== meetingId;

  return {
    meetingId,
    voters,
    checkins: liveCheckins,
    claimedIds,
    reissueIds,
    badgeByVoterId,
    loading: meetingLoading || !votersReady || claimsLoading || checkinsLoading,
  };
}
