import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voterEntryUrl } from '../src/lib/voter-entry-url.ts';

test('현재 출처와 기본 경로로 투표 입장 주소를 만든다', () => {
  assert.equal(voterEntryUrl('https://dcc.leessosso.uk', '/poll/'), 'https://dcc.leessosso.uk/poll/');
  assert.equal(voterEntryUrl('https://leessosso.github.io', '/poll/'), 'https://leessosso.github.io/poll/');
  assert.equal(voterEntryUrl('http://localhost:5173', '/poll/'), 'http://localhost:5173/poll/');
});

test('슬래시가 빠지거나 겹쳐도 입장 주소만 남긴다', () => {
  assert.equal(voterEntryUrl('https://dcc.leessosso.uk/', 'poll'), 'https://dcc.leessosso.uk/poll/');
  assert.equal(voterEntryUrl('https://dcc.leessosso.uk', '/poll'), 'https://dcc.leessosso.uk/poll/');
});
