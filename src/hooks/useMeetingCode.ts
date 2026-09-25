import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useMeetingCode(): { roomCode: string; loading: boolean } {
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'meeting', 'current'), (snap) => {
      setRoomCode(snap.exists() ? String(snap.data().roomCode ?? '') : '');
      setLoading(false);
    });
    return unsub;
  }, []);

  return { roomCode, loading };
}
