// tests/outlier.test.js — domain/outlier.js 동작 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iqrOutliers, zScoreOutliers } from '../js/domain/outlier.js';
import { numericStats } from '../js/domain/stats.js';

const F = (arr) => Float64Array.from(arr);

test('iqrOutliers — 박스플롯 경계와 이상치 수', () => {
  const values = F([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]);
  const s = numericStats(values); // q1=3.5, q3=8.5 (R-7)
  const r = iqrOutliers(values, s);
  assert.equal(r.lowerBound, 3.5 - 1.5 * 5);
  assert.equal(r.upperBound, 8.5 + 1.5 * 5);
  assert.equal(r.count, 1); // 100 만 이탈
  assert.equal(r.rate, 1 / 11);
});

test('iqrOutliers — 이상치 없음', () => {
  const values = F([1, 2, 3, 4, 5]);
  const r = iqrOutliers(values, numericStats(values));
  assert.equal(r.count, 0);
  assert.equal(r.rate, 0);
});

test('iqrOutliers — 상수 열은 IQR 0, 이상치 없음', () => {
  const values = F([5, 5, 5, 5]);
  const r = iqrOutliers(values, numericStats(values));
  assert.equal(r.count, 0);
});

test('zScoreOutliers — 기본 z=3', () => {
  const values = F([...Array(30).fill(10), 11, 9, 1000]);
  const s = numericStats(values);
  const r = zScoreOutliers(values, s);
  assert.equal(r.count, 1); // 1000 만 3σ 초과
  assert.equal(r.rate, 1 / 33);
});

test('zScoreOutliers — z 지정', () => {
  const values = F([0, 0, 0, 0, 0, 0, 0, 0, 0, 10]);
  const s = numericStats(values);
  assert.ok(zScoreOutliers(values, s, 1).count >= 1);
});

test('zScoreOutliers — 상수 열(std=0)은 이상치 없음', () => {
  const values = F([3, 3, 3]);
  const r = zScoreOutliers(values, numericStats(values));
  assert.deepEqual(r, { rate: 0, count: 0 });
});
