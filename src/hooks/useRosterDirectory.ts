import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Voter } from '../types';

export interface RosterCheckin {
  voterId: string;
  voterName: string;
}

interface UseRosterDirectoryResult {
  voters: Voter[];
  checkins: RosterCheckin[];
  claimedIds: Set<string>;
  loading: boolean;
}

export function useRosterDirectory(): UseRosterDirectoryResult {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [checkins, setCheckins] = useState<RosterCheckin[]>([]);
  const [votersReady, setVotersReady] = useState(false);
  const [checkinsReady, setCheckinsReady] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'voters'), orderBy('name', 'asc')), (snap) => {
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
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'checkins'), (snap) => {
      setCheckins(
        snap.docs.map((checkinDoc) => ({
          voterId: checkinDoc.id,
          voterName: checkinDoc.data().voterName ?? '이름 없음',
        })),
      );
      setCheckinsReady(true);
    });
    return unsub;
  }, []);

  const claimedIds = useMemo(() => new Set(checkins.map((checkin) => checkin.voterId)), [checkins]);

  return { voters, checkins, claimedIds, loading: !votersReady || !checkinsReady };
}
