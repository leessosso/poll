import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBoardStandby } from '../src/lib/board-mode.ts';

test('대기 모드가 아니면 준비 화면을 쓰지 않는다', () => {
  assert.equal(isBoardStandby('results', 100, []), false);
});

test('진행 중인 투표가 있으면 대기 화면을 자동으로 해제한다', () => {
  assert.equal(isBoardStandby('standby', 100, [{ status: 'active', createdAt: 50 }]), false);
});

test('대기 이후에 만들어진 투표가 있으면 준비 화면을 해제한다', () => {
  assert.equal(isBoardStandby('standby', 100, [{ status: 'waiting', createdAt: 200 }]), false);
});

test('대기 이전에 마감된 투표만 있으면 준비 화면을 유지한다', () => {
  assert.equal(isBoardStandby('standby', 100, [{ status: 'closed', createdAt: 50 }]), true);
});
