import { useEffect, useState } from 'react';

/**
 * 탭이 다시 보일 때마다 값이 올라간다.
 * 사파리가 백그라운드 탭의 Firestore Listen 을 늦출 때, 구독을 다시 걸어 최신 상태를 받게 한다.
 */
export function usePageVisibleGeneration(): number {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setGeneration((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return generation;
}
