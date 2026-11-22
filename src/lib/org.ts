export const DEFAULT_ORG_NAME = '2청년회';
export const DEFAULT_EMERGENCY_ADMIN_ID = 'admin2ch';

export function orgNameFromEnv(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? DEFAULT_ORG_NAME : trimmed;
}

export function emergencyAdminIdFromEnv(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? DEFAULT_EMERGENCY_ADMIN_ID : trimmed;
}

/** 기본은 켜짐. 값이 정확히 `false`일 때만 끈다. */
export function shellSsoEnabledFromEnv(value: string | undefined): boolean {
  return value?.trim() !== 'false';
}

export function pollAppTitle(orgName: string): string {
  return `등촌교회 ${orgName} 투표 시스템`;
}

export function adminLoginIntro(orgName: string, shellSsoEnabled: boolean): string {
  if (!shellSsoEnabled) return `등촌교회 ${orgName} 투표 관리.`;
  return `등촌교회 ${orgName} 투표 관리. ${orgName} 웹 계정으로 들어옵니다.`;
}

export function emergencyLoginHint(orgName: string, shellSsoEnabled: boolean): string {
  if (!shellSsoEnabled) {
    return '미리 만들어 둔 Firebase 계정과 관리자 클레임이 있어야 합니다.';
  }
  return `${orgName} 웹이 멈춰 있을 때만 사용합니다. 미리 만들어 둔 Firebase 계정과 관리자 클레임이 있어야 합니다.`;
}

export type ShellLoginFailureCopy = { title: string; body: string };

export function shellLoginFailureCopy(orgName: string): {
  malformed: ShellLoginFailureCopy;
  'bad-request': ShellLoginFailureCopy;
  forbidden: ShellLoginFailureCopy;
  'not-linked': ShellLoginFailureCopy;
  'session-mismatch': ShellLoginFailureCopy;
  origin: ShellLoginFailureCopy;
  expired: ShellLoginFailureCopy;
  'shell-down': ShellLoginFailureCopy;
  unauthenticated: ShellLoginFailureCopy;
} {
  return {
    malformed: {
      title: '로그인 코드를 확인하지 못했습니다',
      body: `주소의 코드가 없거나 형식이 맞지 않습니다. ${orgName} 웹에서 다시 들어와 주세요.`,
    },
    'bad-request': {
      title: '로그인 요청이 올바르지 않습니다',
      body: `코드나 요청 형식이 맞지 않아 교환하지 못했습니다. ${orgName} 웹에서 다시 들어와 주세요.`,
    },
    forbidden: {
      title: '투표 관리 권한이 없습니다',
      body: `${orgName} 웹 역할이 관리자(ADMIN) 또는 교역자(PASTOR)인 계정만 들어올 수 있습니다.`,
    },
    'not-linked': {
      title: '아직 회원과 연결되지 않은 계정입니다',
      body: `이 계정에 연결된 회원이 없거나 한 명이 아닙니다. ${orgName} 웹에서 회원 연결을 마친 뒤 다시 들어와 주세요.`,
    },
    'session-mismatch': {
      title: '로그인한 계정이 코드와 다릅니다',
      body: `코드를 받은 계정과 지금 ${orgName} 웹에 로그인된 계정이 다릅니다. ${orgName} 웹에서 다시 들어와 주세요.`,
    },
    origin: {
      title: `이 주소에서는 ${orgName} 웹 로그인을 열 수 없습니다`,
      body: `${orgName} 웹 로그인은 https://dcc.leessosso.uk/poll/ 또는 https://leessosso.github.io/poll 에서만 동작합니다.`,
    },
    expired: {
      title: '로그인 코드가 만료되었습니다',
      body: '코드는 60초 동안 한 번만 쓸 수 있습니다. 이미 사용했거나 시간이 지났습니다. 다시 시도해 주세요.',
    },
    'shell-down': {
      title: `${orgName} 웹에 연결하지 못했습니다`,
      body: `${orgName} 웹이 응답하지 않거나 서버 설정에 문제가 있습니다. 복구되기 전에는 아래 비상 로그인을 사용해 주세요.`,
    },
    unauthenticated: {
      title: `${orgName} 웹에서 사용자를 확인하지 못했습니다`,
      body: `코드를 발급한 계정을 ${orgName} 웹에서 찾지 못했습니다. ${orgName} 웹에서 다시 로그인해 주세요.`,
    },
  };
}
