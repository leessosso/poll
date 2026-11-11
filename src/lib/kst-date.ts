/** KST(UTC+9) 날짜·자정 계산. 방문 집계는 이 날짜를 쓴다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 기준 오늘 날짜를 YYYY-MM-DD 로 반환한다. */
export function getTodayKST(now = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 다음 KST 자정까지 남은 밀리초. 방문 구독 경로를 날짜가 바뀌면 다시 걸 때 쓴다. */
export function msUntilNextKstMidnight(now = Date.now()): number {
  const today = getTodayKST(now);
  const nextMidnight = Date.parse(`${today}T00:00:00.000Z`) - KST_OFFSET_MS + DAY_MS;
  return Math.max(1, nextMidnight - now);
}

/** KST 시각을 HH:MM 으로 보여 준다. */
export function formatKstTime(now = Date.now()): string {
  const shifted = new Date(now + KST_OFFSET_MS);
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
