import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { MEETING_PUBLIC_DOC } from '../lib/meeting';

/** 현재 모임 id. 아직 모임을 연 적이 없으면 빈 문자열이다. */
export function useCurrentMeeting(): { meetingId: string; loading: boolean } {
  const [state, setState] = useState({ meetingId: '', loading: true });

  useEffect(() => {
    return onSnapshot(
      MEETING_PUBLIC_DOC,
      (snap) => {
        const id = snap.exists() ? snap.data().meetingId : '';
        setState({ meetingId: typeof id === 'string' ? id : '', loading: false });
      },
      () => setState({ meetingId: '', loading: false }),
    );
  }, []);

  return state;
}
