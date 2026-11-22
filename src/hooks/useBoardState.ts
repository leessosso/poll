import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { BOARD_STATE_DOC, type BoardMode } from '../lib/board-state';

export function useBoardState(): { mode: BoardMode; updatedAt: number; loading: boolean } {
  const [state, setState] = useState({ mode: 'results' as BoardMode, updatedAt: 0, loading: true });

  useEffect(() => {
    return onSnapshot(
      BOARD_STATE_DOC,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        const mode = data?.mode === 'standby' ? 'standby' : 'results';
        const updatedAt = typeof data?.updatedAt === 'number' ? data.updatedAt : 0;
        setState({ mode, updatedAt, loading: false });
      },
      () => setState({ mode: 'results', updatedAt: 0, loading: false }),
    );
  }, []);

  return state;
}
