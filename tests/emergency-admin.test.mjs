import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emergencyAdminEmail } from '../src/lib/emergency-admin.ts';

test('아이디만 넣으면 비상 관리자 도메인을 붙인다', () => {
  assert.equal(emergencyAdminEmail('admin2ch'), 'admin2ch@dcc.leessosso.uk');
  assert.equal(emergencyAdminEmail('  admin2ch  '), 'admin2ch@dcc.leessosso.uk');
});

test('이미 이메일이면 그대로 둔다', () => {
  assert.equal(emergencyAdminEmail('someone@example.com'), 'someone@example.com');
});

test('빈 값은 빈 문자열이다', () => {
  assert.equal(emergencyAdminEmail(''), '');
  assert.equal(emergencyAdminEmail('   '), '');
});
