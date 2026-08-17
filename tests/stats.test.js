// tests/stats.test.js — domain/stats.js 동작 테스트
// 기준값은 stats.js 헤더에 문서화한 추정량(표본 std, R-7 분위수, 적률 기반 g1·g2) 기준.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericStats, quantile, topValues, classDistribution, histogram } from '../js/domain/stats.js';

const F = (arr) => Float64Array.from(arr);
const approx = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

// ─── numericStats ───────────────────────────────────────────

test('numericStats — [1..5] 기준값', () => {
  const s = numericStats(F([1, 2, 3, 4, 5]));
  assert.equal(s.mean, 3);
  assert.equal(s.median, 3);
  assert.equal(s.min, 1);
  assert.equal(s.max, 5);
  assert.equal(s.q1, 2);
  assert.equal(s.q3, 4);
  approx(s.std, Math.sqrt(2.5)); // 표본 표준편차 (n-1)
  assert.equal(s.skewness, 0); // 대칭
  approx(s.kurtosis, -1.3); // m4/m2² - 3 = 6.8/4 - 3
});

test('numericStats — 우편포 왜도는 양수', () => {
  const s = numericStats(F([1, 1, 1, 10]));
  assert.ok(s.skewness > 1);
});

test('numericStats — 정렬되지 않은 입력도 동일', () => {
  const s = numericStats(F([5, 1, 4, 2, 3]));
  assert.equal(s.median, 3);
  assert.equal(s.q1, 2);
});

test('numericStats — 상수 열은 왜도·첨도 0 (정의 불가를 무신호로)', () => {
  const s = numericStats(F([7, 7, 7]));
  assert.equal(s.std, 0);
  assert.equal(s.skewness, 0);
  assert.equal(s.kurtosis, 0);
});

test('numericStats — 값 1개', () => {
  const s = numericStats(F([42]));
  assert.equal(s.mean, 42);
  assert.equal(s.median, 42);
  assert.equal(s.std, 0);
});

// ─── quantile (R-7 선형 보간) ───────────────────────────────

test('quantile — R-7 보간', () => {
  const sorted = F([1, 2, 3, 4]);
  assert.equal(quantile(sorted, 0.5), 2.5);
  assert.equal(quantile(sorted, 0.25), 1.75);
  assert.equal(quantile(sorted, 0), 1);
  assert.equal(quantile(sorted, 1), 4);
});

// ─── topValues · classDistribution ─────────────────────────

test('topValues — 빈도순, limit 절단, 결측 제외', () => {
  const values = ['a', 'b', 'a', '', 'c', 'a', 'b', '  '];
  assert.deepEqual(topValues(values, 2), [
    { value: 'a', count: 3 },
    { value: 'b', count: 2 },
  ]);
});

test('topValues — 동률은 먼저 등장한 값이 앞선다', () => {
  assert.deepEqual(topValues(['x', 'y'], 2), [
    { value: 'x', count: 1 },
    { value: 'y', count: 1 },
  ]);
});

test('classDistribution — 전체 분포 (최소 클래스가 잘리지 않는다)', () => {
  const values = [...Array(9).fill('major'), 'minor'];
  assert.deepEqual(classDistribution(values), { major: 9, minor: 1 });
});

// ─── histogram ──────────────────────────────────────────────

test('histogram — 등폭 구간, 최댓값은 마지막 구간 포함', () => {
  const h = histogram(F([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 5);
  assert.equal(h.counts.length, 5);
  assert.equal(h.binEdges.length, 6);
  assert.deepEqual(h.counts, [2, 2, 2, 2, 2]);
  assert.equal(h.binEdges[0], 0);
  assert.equal(h.binEdges[5], 9);
});

test('histogram — 상수 열은 단일 구간', () => {
  const h = histogram(F([5, 5, 5]));
  assert.deepEqual(h, { binEdges: [5, 5], counts: [3] });
});

test('histogram — 기본 빈 수는 Sturges 규칙', () => {
  const h = histogram(F(Array.from({ length: 100 }, (_, i) => i)));
  assert.equal(h.counts.length, Math.ceil(Math.log2(100)) + 1); // 8
});
