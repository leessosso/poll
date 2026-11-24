const BADGE_MIN = 100;
const BADGE_MAX = 999;
const MAX_RANDOM_TRIES = 12;

/** 규칙이 permission-denied 로 번호 충돌을 알릴 때, 새 번호로 다시 시도하는 횟수. */
export const MAX_PERMISSION_DENIED_RETRIES = 3;

export const CLAIM_REJECTED =
  '입장하지 못했습니다. 화면의 입장 코드를 다시 확인해 주세요. 이미 입장한 기기라면 새로고침해 주세요.';

/** 번호가 계속 겹쳐 이번 입장을 끝내지 못했을 때. 틀린 코드 안내와 구분한다. */
export const CLAIM_RETRY_LATER = '잠시 후 다시 입장해 주세요';

export class BadgeTakenError extends Error {
  constructor() {
    super('입장 번호가 겹쳤습니다.');
    this.name = 'BadgeTakenError';
  }
}

export function isPermissionDenied(err: unknown): boolean {
  const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

export function badgeInRange(badge: unknown): badge is number {
  return typeof badge === 'number' && Number.isInteger(badge) && badge >= BADGE_MIN && badge <= BADGE_MAX;
}

function pickRandomUntriedBadge(tried: Set<number>, random: () => number): number {
  const span = BADGE_MAX - BADGE_MIN + 1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const badge = BADGE_MIN + Math.floor(random() * span);
    if (!tried.has(badge)) return badge;
  }
  for (let badge = BADGE_MIN; badge <= BADGE_MAX; badge += 1) {
    if (!tried.has(badge)) return badge;
  }
  throw new Error('입장 번호를 더 만들 수 없습니다.');
}

function pickBadge(used: Set<number>, random: () => number): number {
  const span = BADGE_MAX - BADGE_MIN + 1;
  if (used.size >= span) throw new Error('입장 번호를 더 만들 수 없습니다.');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const badge = BADGE_MIN + Math.floor(random() * span);
    if (!used.has(badge)) return badge;
  }
  for (let badge = BADGE_MIN; badge <= BADGE_MAX; badge += 1) {
    if (!used.has(badge)) return badge;
  }
  throw new Error('입장 번호를 더 만들 수 없습니다.');
}

/**
 * 무작위 입장 번호를 잡아 runAttempt 가 성공할 때까지 고른다.
 * 트랜잭션이 읽은 뒤에는 비어 있었는데 커밋에서 규칙이 permission-denied 를 주면,
 * 그 번호 칸이 이미 찼을 때만 다른 번호로 다시 시도한다. 틀린 입장 코드도 같은 코드라
 * 칸이 비어 있으면 바로 CLAIM_REJECTED 로 끝낸다.
 */
export async function takeFreeBadge<T>(deps: {
  runAttempt: (badge: number) => Promise<T>;
  /** permission-denied 직후, 그 번호의 현황판 칸이 있는지. */
  isBadgeHeld: (badge: number) => Promise<boolean>;
  loadHeldBadges: () => Promise<Iterable<number>>;
  random?: () => number;
}): Promise<T> {
  const random = deps.random ?? Math.random;
  const tried = new Set<number>();
  let used: Set<number> | null = null;
  let lastError: unknown;
  let denialRetries = 0;

  for (let attempt = 0; attempt < MAX_RANDOM_TRIES + 4; attempt += 1) {
    if (attempt === MAX_RANDOM_TRIES && !used) {
      used = new Set<number>(tried);
      for (const badge of await deps.loadHeldBadges()) {
        if (badgeInRange(badge)) used.add(badge);
      }
    }

    const badge = used ? pickBadge(used, random) : pickRandomUntriedBadge(tried, random);
    tried.add(badge);

    try {
      return await deps.runAttempt(badge);
    } catch (err) {
      if (err instanceof BadgeTakenError) {
        if (used) used.add(badge);
        lastError = err;
        continue;
      }
      if (!isPermissionDenied(err)) throw err;

      // 칸이 아직 비어 있으면 번호 충돌이 아니다. 틀린 코드 등 규칙 거절이다.
      if (!(await deps.isBadgeHeld(badge))) throw new Error(CLAIM_REJECTED);

      denialRetries += 1;
      if (denialRetries > MAX_PERMISSION_DENIED_RETRIES) throw new Error(CLAIM_RETRY_LATER);
      if (used) used.add(badge);
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('입장 번호를 정하지 못했습니다.');
}
