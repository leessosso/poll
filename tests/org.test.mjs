import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_EMERGENCY_ADMIN_ID,
  DEFAULT_ORG_NAME,
  adminLoginIntro,
  emergencyAdminIdFromEnv,
  emergencyLoginHint,
  orgNameFromEnv,
  pollAppTitle,
  shellLoginFailureCopy,
  shellSsoEnabledFromEnv,
} from '../src/lib/org.ts';

test('단체 이름 기본값은 2청년회이다', () => {
  assert.equal(DEFAULT_ORG_NAME, '2청년회');
  assert.equal(orgNameFromEnv(undefined), '2청년회');
  assert.equal(orgNameFromEnv(''), '2청년회');
  assert.equal(orgNameFromEnv('   '), '2청년회');
  assert.equal(orgNameFromEnv('1청년회'), '1청년회');
  assert.equal(orgNameFromEnv('  1청년회  '), '1청년회');
});

test('비상 관리자 아이디 기본값은 admin2ch이다', () => {
  assert.equal(DEFAULT_EMERGENCY_ADMIN_ID, 'admin2ch');
  assert.equal(emergencyAdminIdFromEnv(undefined), 'admin2ch');
  assert.equal(emergencyAdminIdFromEnv(''), 'admin2ch');
  assert.equal(emergencyAdminIdFromEnv('admin1ch'), 'admin1ch');
});

test('셸 SSO는 false일 때만 꺼진다', () => {
  assert.equal(shellSsoEnabledFromEnv(undefined), true);
  assert.equal(shellSsoEnabledFromEnv(''), true);
  assert.equal(shellSsoEnabledFromEnv('true'), true);
  assert.equal(shellSsoEnabledFromEnv('false'), false);
});

test('기본 화면 문구는 기존 2청년회 문장과 같다', () => {
  const org = '2청년회';
  assert.equal(pollAppTitle(org), '등촌교회 2청년회 투표 시스템');
  assert.equal(
    adminLoginIntro(org, true),
    '등촌교회 2청년회 투표 관리. 2청년회 웹 계정으로 들어옵니다.',
  );
  assert.equal(
    emergencyLoginHint(org, true),
    '2청년회 웹이 멈춰 있을 때만 사용합니다. 미리 만들어 둔 Firebase 계정과 관리자 클레임이 있어야 합니다.',
  );
  const copy = shellLoginFailureCopy(org);
  assert.equal(copy.malformed.body, '주소의 코드가 없거나 형식이 맞지 않습니다. 2청년회 웹에서 다시 들어와 주세요.');
  assert.equal(copy['bad-request'].body, '코드나 요청 형식이 맞지 않아 교환하지 못했습니다. 2청년회 웹에서 다시 들어와 주세요.');
  assert.equal(copy.forbidden.body, '2청년회 웹 역할이 관리자(ADMIN) 또는 교역자(PASTOR)인 계정만 들어올 수 있습니다.');
  assert.equal(copy['not-linked'].body, '이 계정에 연결된 회원이 없거나 한 명이 아닙니다. 2청년회 웹에서 회원 연결을 마친 뒤 다시 들어와 주세요.');
  assert.equal(copy['session-mismatch'].body, '코드를 받은 계정과 지금 2청년회 웹에 로그인된 계정이 다릅니다. 2청년회 웹에서 다시 들어와 주세요.');
  assert.equal(copy.origin.title, '이 주소에서는 2청년회 웹 로그인을 열 수 없습니다');
  assert.equal(copy.origin.body, '2청년회 웹 로그인은 https://dcc.leessosso.uk/poll/ 또는 https://leessosso.github.io/poll 에서만 동작합니다.');
  assert.equal(copy['shell-down'].title, '2청년회 웹에 연결하지 못했습니다');
  assert.equal(copy['shell-down'].body, '2청년회 웹이 응답하지 않거나 서버 설정에 문제가 있습니다. 복구되기 전에는 아래 비상 로그인을 사용해 주세요.');
  assert.equal(copy.unauthenticated.title, '2청년회 웹에서 사용자를 확인하지 못했습니다');
  assert.equal(copy.unauthenticated.body, '코드를 발급한 계정을 2청년회 웹에서 찾지 못했습니다. 2청년회 웹에서 다시 로그인해 주세요.');
});

test('1청년회와 SSO 숨김 문구가 바뀐다', () => {
  assert.equal(pollAppTitle('1청년회'), '등촌교회 1청년회 투표 시스템');
  assert.equal(adminLoginIntro('1청년회', false), '등촌교회 1청년회 투표 관리.');
  assert.equal(
    emergencyLoginHint('1청년회', false),
    '미리 만들어 둔 Firebase 계정과 관리자 클레임이 있어야 합니다.',
  );
});
