import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Voter } from '../types';

interface UseRosterDirectoryResult {
  voters: Voter[];
  loading: boolean;
}

/** 관리자 화면에서 출석 세션용 명단이 필요할 때만 voters 컬렉션을 구독한다. */
export function useRosterDirectory(enabled = true): UseRosterDirectoryResult {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [votersReady, setVotersReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  return {
    voters: enabled ? voters : [],
    loading: enabled && !votersReady,
  };
}
