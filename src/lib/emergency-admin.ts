const EMERGENCY_ADMIN_DOMAIN = '@dcc.leessosso.uk';

/** 아이디만 넣으면 비상 관리자 메일 도메인을 붙인다. 이미 @가 있으면 그대로 쓴다. */
export function emergencyAdminEmail(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes('@')) return trimmed;
  return `${trimmed}${EMERGENCY_ADMIN_DOMAIN}`;
}
