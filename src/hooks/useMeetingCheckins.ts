import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useCurrentMeeting } from './useCurrentMeeting';

export interface RosterCheckin {
  /** checkins 문서 id ({meetingId}_{authUid}). */
  id: string;
  voterId: string;
  voterName: string;
  badge: number | null;
  claimedAt: number;
}

interface UseMeetingCheckinsResult {
  meetingId: string;
  checkins: RosterCheckin[];
  loading: boolean;
}

const NO_CHECKINS: RosterCheckin[] = [];

/** 현재 모임의 활성 입장(revoked == false) 목록만 구독한다. 명단 컬렉션은 읽지 않는다. */
export function useMeetingCheckins(refreshKey = 0): UseMeetingCheckinsResult {
  const { meetingId, loading: meetingLoading } = useCurrentMeeting();
  const [checkins, setCheckins] = useState<RosterCheckin[]>([]);
  const [checkinsKey, setCheckinsKey] = useState<string | null>(null);
  const [seenRefreshKey, setSeenRefreshKey] = useState(refreshKey);

  if (seenRefreshKey !== refreshKey) {
    setSeenRefreshKey(refreshKey);
    setCheckinsKey(null);
  }

  useEffect(() => {
    if (!meetingId) return;
    return onSnapshot(
      query(collection(db, 'checkins'), where('meetingId', '==', meetingId), where('revoked', '==', false)),
      (snap) => {
        const rows = snap.docs.map((checkinDoc) => {
          const data = checkinDoc.data();
          const badge = data.badge;
          return {
            id: checkinDoc.id,
            voterId: String(data.voterId ?? ''),
            voterName: data.voterName ?? '이름 없음',
            badge: typeof badge === 'number' && Number.isInteger(badge) ? badge : null,
            claimedAt: typeof data.claimedAt === 'number' ? data.claimedAt : 0,
          };
        });
        rows.sort((a, b) => (a.badge ?? 9999) - (b.badge ?? 9999));
        setCheckins(rows);
        setCheckinsKey(meetingId);
      },
      () => setCheckinsKey(meetingId),
    );
  }, [meetingId, refreshKey]);

  const liveCheckins = meetingId && checkinsKey === meetingId ? checkins : NO_CHECKINS;
  const checkinsLoading = Boolean(meetingId) && checkinsKey !== meetingId;

  return {
    meetingId,
    checkins: liveCheckins,
    loading: meetingLoading || checkinsLoading,
  };
}
