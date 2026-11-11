import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatKstTime, getTodayKST, msUntilNextKstMidnight } from '../src/lib/kst-date.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

test('KST 오늘 날짜는 UTC+9 달력이다', () => {
  // 2026-11-11 15:00 UTC = 2026-11-12 00:00 KST
  assert.equal(getTodayKST(Date.parse('2026-11-11T14:59:59.000Z')), '2026-11-11');
  assert.equal(getTodayKST(Date.parse('2026-11-11T15:00:00.000Z')), '2026-11-12');
});

test('다음 KST 자정까지 남은 시간을 계산한다', () => {
  const justBefore = Date.parse('2026-11-11T14:59:00.000Z');
  assert.equal(msUntilNextKstMidnight(justBefore), 60_000);
  const justAfter = Date.parse('2026-11-11T15:00:00.000Z');
  assert.equal(msUntilNextKstMidnight(justAfter), DAY_MS);
});

test('KST 시각은 HH:MM 이다', () => {
  assert.equal(formatKstTime(Date.parse('2026-11-11T13:37:00.000Z')), '22:37');
  assert.equal(formatKstTime(Date.parse('2026-11-11T15:00:00.000Z')), '00:00');
});
