/** youth2-space 투표 관리자 SSO. 계약은 docs/security-shell-admin.md. */

export const SHELL_ORIGIN = 'https://youth2-space.vercel.app';
export const POLL_ADMIN_AUDIENCE = 'dcc-poll-admin';

const SSO_PATH = '/api/platform/poll-admin-sso';
const TOKEN_PATH = '/api/poll/firebase-token';

/** 셸 parsePollReturnTo 와 같은 오리진·경로 접두사. 이 둘 외에는 return_to 를 만들지 않는다. */
const RETURN_PREFIX: Record<string, string> = {
  'https://dcc.leessosso.uk': '/poll/',
  'https://leessosso.github.io': '/poll',
};

const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type FragmentCode =
  | { status: 'absent' }
  | { status: 'malformed' }
  | { status: 'ok'; code: string };

export type ShellLoginFailure =
  | 'malformed'
  | 'bad-request'
  | 'forbidden'
  | 'not-linked'
  | 'session-mismatch'
  | 'origin'
  | 'expired'
  | 'shell-down'
  | 'unauthenticated';

export class ShellExchangeError extends Error {
  readonly status: number;
  readonly error: string;

  constructor(status: number, error: string) {
    super(error);
    this.name = 'ShellExchangeError';
    this.status = status;
    this.error = error;
  }
}

/**
 * 현재 오리진과 Vite base 로만 관리자 URL 을 만든다.
 * 허용된 두 오리진이 아니면 null. 다른 오리진은 쿼리에 넣지 않는다.
 */
export function buildAdminReturnTo(origin: string, baseUrl: string): string | null {
  const prefix = RETURN_PREFIX[origin];
  if (!prefix || !baseUrl.startsWith('/')) return null;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const path = `${base}admin`;
  if (!path.startsWith(prefix)) return null;

  let url: URL;
  try {
    url = new URL(path, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.protocol !== 'https:' || url.username || url.password) return null;
  if (!url.pathname.startsWith(prefix)) return null;
  url.hash = '';
  url.search = '';
  return url.toString();
}

export function buildShellSsoUrl(returnTo: string): string {
  const url = new URL(SSO_PATH, SHELL_ORIGIN);
  url.searchParams.set('return_to', returnTo);
  return url.toString();
}

export function parseFragmentCode(hash: string): FragmentCode {
  if (!hash || hash === '#') return { status: 'absent' };
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  if (!params.has('code')) return { status: 'malformed' };
  const code = params.get('code') ?? '';
  if (!CODE_PATTERN.test(code)) return { status: 'malformed' };
  return { status: 'ok', code };
}

let takenFragment: FragmentCode | null = null;

/** 프래그먼트의 code 를 한 번만 읽고 주소창에서 즉시 지운다. */
export function takeAdminFragment(): FragmentCode {
  if (takenFragment) return takenFragment;
  if (typeof window === 'undefined') {
    takenFragment = { status: 'absent' };
    return takenFragment;
  }
  const parsed = parseFragmentCode(window.location.hash);
  if (parsed.status !== 'absent') {
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }
  takenFragment = parsed;
  return parsed;
}

const inflight = new Map<string, Promise<string>>();

export function exchangeShellCode(code: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const existing = inflight.get(code);
  if (existing) return existing;
  const promise = postCode(code, fetchImpl);
  inflight.set(code, promise);
  return promise;
}

async function postCode(code: string, fetchImpl: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${SHELL_ORIGIN}${TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, audience: POLL_ADMIN_AUDIENCE }),
      credentials: 'omit',
    });
  } catch {
    throw new ShellExchangeError(0, 'network');
  }

  let body: { firebaseToken?: unknown; error?: unknown } = {};
  try {
    body = (await response.json()) as { firebaseToken?: unknown; error?: unknown };
  } catch {
    body = {};
  }

  if (!response.ok) {
    const error = typeof body.error === 'string' ? body.error : 'unknown';
    throw new ShellExchangeError(response.status, error);
  }
  if (typeof body.firebaseToken !== 'string' || body.firebaseToken.length === 0) {
    throw new ShellExchangeError(500, 'token_mint_failed');
  }
  return body.firebaseToken;
}

export function classifyExchangeFailure(status: number, error: string): ShellLoginFailure {
  if (status === 410 || error === 'code_expired_or_used') return 'expired';
  if (error === 'member_not_linked') return 'not-linked';
  if (error === 'session_mismatch') return 'session-mismatch';
  if (error === 'origin_not_allowed') return 'origin';
  if (status === 403 || error === 'forbidden') return 'forbidden';
  if (status === 401 || error === 'unauthenticated') return 'unauthenticated';
  if (status === 400) return 'bad-request';
  return 'shell-down';
}
