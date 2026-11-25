import assert from 'node:assert/strict';
import { test } from 'node:test';
import { participationFromLamps } from '../src/lib/participation.ts';

test('현장 입장 참여 현황은 이번 투표 번호만 participation 과 같은 이름·순서·상태로 만든다', () => {
  const lamps = [
    { badge: 512, state: 'voted', pollId: 'p1' },
    { badge: 107, state: 'pending', pollId: 'p1' },
    { badge: 300, state: 'seated', pollId: '' },
    { badge: 205, state: 'pending', pollId: 'old' },
    { badge: 999, state: 'pending', pollId: 'p1' },
  ];
  const rows = participationFromLamps('p1', lamps);
  assert.deepEqual(rows.map((row) => row.voterName), ['107번', '512번', '999번']);
  assert.deepEqual(rows.map((row) => row.status), ['pending', 'completed', 'pending']);
  assert.equal(new Set(rows.map((row) => row.id)).size, 3);
});

test('번호가 없으면 빈 목록이다', () => {
  assert.deepEqual(participationFromLamps('p1', []), []);
});
