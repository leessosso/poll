import type { User } from 'firebase/auth';

/**
 * 커스텀 클레임 `admin: true` 가 기본 경로다.
 * 클레임을 못 쓸 때만 이 목록과 firestore.rules 의 isAllowlistedAdmin() 을 같은 이메일로 채운다.
 */
export const ALLOWLISTED_ADMIN_EMAILS: readonly string[] = [];

export function isAdminAccount(user: User, claims: Record<string, unknown>): boolean {
  if (claims.admin === true) return true;
  const email = user.email?.toLowerCase();
  if (!email) return false;
  return ALLOWLISTED_ADMIN_EMAILS.some((allowed) => allowed.toLowerCase() === email);
}
