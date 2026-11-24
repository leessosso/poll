import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BadgeTakenError,
  CLAIM_REJECTED,
  CLAIM_RETRY_LATER,
  MAX_PERMISSION_DENIED_RETRIES,
  takeFreeBadge,
} from '../src/lib/claim-badge.ts';

function permissionDenied(code = 'permission-denied') {
  const err = new Error('Missing or insufficient permissions.');
  err.code = code;
  return err;
}

function sequence(...values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

test('같은 번호를 동시에 집으면 둘 다 다른 번호로 입장한다', async () => {
  const held = new Set();
  /** @type {Map<number, Promise<void>>} */
  const inflight = new Map();
  const attempts = [];

  // 규칙은 커밋 시점에 칸이 있으면 permission-denied 를 주고, 트랜잭션을 다시 돌리지 않는다.
  async function runAttempt(badge) {
    attempts.push(badge);
    if (held.has(badge)) throw new BadgeTakenError();

    const pending = inflight.get(badge);
    if (pending) {
      await pending;
      throw permissionDenied();
    }

    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    inflight.set(badge, gate);
    await Promise.resolve();
    held.add(badge);
    inflight.delete(badge);
    release();
    return { badge };
  }

  const deps = {
    runAttempt,
    isBadgeHeld: async (badge) => held.has(badge),
    loadHeldBadges: async () => held,
  };

  const [first, second] = await Promise.all([
    takeFreeBadge({ ...deps, random: sequence(0, 0.5) }),
    takeFreeBadge({ ...deps, random: sequence(0, 0.25) }),
  ]);

  const badges = [first.badge, second.badge].sort((left, right) => left - right);
  assert.equal(new Set(badges).size, 2);
  assert.deepEqual([...held].sort((left, right) => left - right), badges);
  assert.equal(attempts.filter((badge) => badge === 100).length, 2);
});

test('번호 칸이 비어 있는 permission-denied 는 입장 코드 오류로 바로 끝낸다', async () => {
  let attempts = 0;
  await assert.rejects(
    () => takeFreeBadge({
      runAttempt: async () => {
        attempts += 1;
        throw permissionDenied();
      },
      isBadgeHeld: async () => false,
      loadHeldBadges: async () => [],
    }),
    (err) => err instanceof Error && err.message === CLAIM_REJECTED,
  );
  assert.equal(attempts, 1);
});

test('번호 충돌 permission-denied 는 세 번만 다시 고르고 잠시 후 안내한다', async () => {
  let attempts = 0;
  let n = 0;
  await assert.rejects(
    () => takeFreeBadge({
      random: () => n++ / 900,
      runAttempt: async () => {
        attempts += 1;
        throw permissionDenied('firestore/permission-denied');
      },
      isBadgeHeld: async () => true,
      loadHeldBadges: async () => [],
    }),
    (err) => err instanceof Error && err.message === CLAIM_RETRY_LATER,
  );
  assert.equal(attempts, MAX_PERMISSION_DENIED_RETRIES + 1);
});

test('이미 차 있는 번호는 재시도 상한 없이 빈 번호를 찾는다', async () => {
  let attempts = 0;
  let n = 0;
  const claim = await takeFreeBadge({
    random: () => n++ / 900,
    runAttempt: async (badge) => {
      attempts += 1;
      if (attempts <= 5) throw new BadgeTakenError();
      return { badge };
    },
    isBadgeHeld: async () => {
      throw new Error('번호가 이미 보인 충돌에서는 칸을 다시 읽지 않는다');
    },
    loadHeldBadges: async () => [],
  });

  assert.equal(attempts, 6);
  assert.equal(claim.badge, 105);
});
