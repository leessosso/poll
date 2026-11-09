import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { MEETING_DOC } from '../lib/meeting';

/** 관리자 전용. 입장 코드 원문과 현재 모임 id. */
export function useMeetingCode(): { roomCode: string; meetingId: string; loading: boolean } {
  const [state, setState] = useState({ roomCode: '', meetingId: '', loading: true });

  useEffect(() => {
    return onSnapshot(
      MEETING_DOC,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setState({
          roomCode: typeof data.roomCode === 'string' ? data.roomCode : '',
          meetingId: typeof data.meetingId === 'string' ? data.meetingId : '',
          loading: false,
        });
      },
      () => setState({ roomCode: '', meetingId: '', loading: false }),
    );
  }, []);

  return state;
}
