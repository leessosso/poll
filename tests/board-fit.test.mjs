import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  boardResultUsedHeight,
  fitBoardResults,
  fitTiles,
  resultColumnCount,
} from '../src/lib/board-fit.ts';

test('번호 칸은 주어진 영역에 모두 들어간다', () => {
  const { size, cols } = fitTiles(24, 1000, 400);
  const rows = Math.ceil(24 / cols);
  const gap = size * 0.14;
  assert.ok(size > 0);
  assert.ok(cols * size + (cols - 1) * gap <= 1000 + 1e-6);
  assert.ok(rows * size + (rows - 1) * gap <= 400 + 1e-6);
});

test('선택지가 7개 이상이면 두 열로 나눈다', () => {
  assert.equal(resultColumnCount(2), 1);
  assert.equal(resultColumnCount(3), 1);
  assert.equal(resultColumnCount(6), 1);
  assert.equal(resultColumnCount(7), 2);
  assert.equal(resultColumnCount(12), 2);
});

test('짧은 가로 화면에서도 찬반·기권 세 줄이 높이를 넘지 않는다', () => {
  // 1024x500에서 헤더·여백을 뺀 결과 영역 대략 380px
  const fit = fitBoardResults(380, 3, true);
  assert.equal(fit.columns, 1);
  assert.equal(fit.rows, 3);
  assert.ok(boardResultUsedHeight(fit, true) <= 380);
  assert.ok(fit.verdictPx >= 22);
  assert.ok(fit.verdictPx < 128);
  assert.ok(fit.labelPx < 96);
  assert.ok(fit.barPx < 112);
});

test('높은 화면에서는 글자와 막대를 크게 쓴다', () => {
  const fit = fitBoardResults(900, 3, true);
  assert.ok(boardResultUsedHeight(fit, true) <= 900);
  assert.ok(fit.verdictPx >= 80);
  assert.ok(fit.labelPx >= 60);
  assert.ok(fit.barPx >= 70);
});

test('선택지 12개는 두 열로 짧은 화면에도 들어간다', () => {
  const fit = fitBoardResults(380, 12, false);
  assert.equal(fit.columns, 2);
  assert.equal(fit.rows, 6);
  assert.ok(boardResultUsedHeight(fit, false) <= 380);
  assert.ok(fit.labelPx >= 14);
});

test('선택지 8개도 두 열로 맞춘다', () => {
  const fit = fitBoardResults(620, 8, false);
  assert.equal(fit.columns, 2);
  assert.equal(fit.rows, 4);
  assert.ok(boardResultUsedHeight(fit, false) <= 620);
});

test('높이가 0이면 최소 크기를 돌려준다', () => {
  const fit = fitBoardResults(0, 3, true);
  assert.equal(fit.verdictPx, 22);
  assert.equal(fit.labelPx, 14);
});
