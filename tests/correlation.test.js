// tests/correlation.test.js — domain/correlation.js 동작 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlationPairs, pearson, spearman, vif } from '../js/domain/correlation.js';

const F = (arr) => Float64Array.from(arr);
const approx = (actual, expected, eps = 1e-9) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

// ─── pearson ────────────────────────────────────────────────

test('pearson — 완전 선형은 ±1', () => {
  const a = F([1, 2, 3, 4, 5]);
  approx(pearson(a, F([2, 4, 6, 8, 10])), 1);
  approx(pearson(a, F([10, 8, 6, 4, 2])), -1);
});

test('pearson — 무상관에 가까운 값', () => {
  const r = pearson(F([1, 2, 3, 4]), F([1, -1, 1, -1]));
  approx(r, -2 / (Math.sqrt(5) * 2)); // 수기 계산: cov=-2, √(varA·varB)=√5·2
});

test('pearson — 분산 0 이면 null', () => {
  assert.equal(pearson(F([1, 1, 1]), F([1, 2, 3])), null);
});

test('pearson — 결측(NaN)은 쌍별 제거', () => {
  const a = F([1, 2, NaN, 4, 5]);
  const b = F([2, 4, 100, 8, NaN]);
  approx(pearson(a, b), 1); // 유효 쌍 (1,2)(2,4)(4,8) 만 사용
});

test('pearson — 유효 쌍 2개 미만이면 null', () => {
  assert.equal(pearson(F([1, NaN]), F([NaN, 1])), null);
});

// ─── spearman ───────────────────────────────────────────────

test('spearman — 단조 비선형 관계는 1, pearson 은 1 미만', () => {
  const a = F([1, 2, 3, 4, 5]);
  const b = F(a.map((v) => Math.exp(v)));
  approx(spearman(a, b), 1);
  assert.ok(pearson(a, b) < 1);
});

test('spearman — 동순위는 평균 순위', () => {
  // a=[1,2,2,3] 순위 [1, 2.5, 2.5, 4]
  const r = spearman(F([1, 2, 2, 3]), F([1, 2.5, 2.5, 4]));
  approx(r, 1);
});

// ─── vif ────────────────────────────────────────────────────

test('vif — 예측 열 1개면 1/(1-r²)', () => {
  const cols = [
    { name: 'x1', values: F([1, 2, 3, 4]) },
    { name: 'x2', values: F([1, -1, 1, -1]) },
  ];
  approx(vif(0, cols), 1.25, 1e-6); // r²=0.2
});

test('vif — 무상관이면 1에 가깝다', () => {
  const cols = [
    { name: 'x1', values: F([1, 2, 3, 4, 5, 6, 7, 8]) },
    { name: 'x2', values: F([1, -1, 1, -1, 1, -1, 1, -1]) },
    { name: 'x3', values: F([0, 0, 1, 1, 0, 0, 1, 1]) },
  ];
  const v = vif(0, cols);
  assert.ok(v !== null && v < 2, `vif=${v}`);
});

test('vif — 완전 공선(x3 = x1 + x2)은 null (Pearson 이 대신 잡는다)', () => {
  const x1 = F([1, 2, 3, 4, 5]);
  const x2 = F([2, 1, 4, 3, 5]);
  const cols = [
    { name: 'x1', values: x1 },
    { name: 'x2', values: x2 },
    { name: 'x3', values: F(x1.map((v, i) => v + x2[i])) },
  ];
  assert.equal(vif(2, cols), null);
});

test('vif — 표본이 모수보다 적으면 null', () => {
  const cols = [
    { name: 'x1', values: F([1, 2]) },
    { name: 'x2', values: F([2, 1]) },
    { name: 'x3', values: F([1, 1]) },
  ];
  assert.equal(vif(0, cols), null);
});

// ─── correlationPairs ───────────────────────────────────────

test('correlationPairs — 상삼각 쌍과 좌측 열 VIF', () => {
  const cols = [
    { name: 'a', values: F([1, 2, 3, 4]) },
    { name: 'b', values: F([2, 4, 6, 8]) },
    { name: 'c', values: F([1, -1, 1, -1]) },
  ];
  const pairs = correlationPairs(cols);
  assert.equal(pairs.length, 3); // ab, ac, bc
  assert.deepEqual(
    pairs.map((p) => `${p.left}-${p.right}`),
    ['a-b', 'a-c', 'b-c']
  );
  approx(pairs[0].pearson, 1);
  // a-b 가 완전 공선이므로 a 의 VIF 는 null
  assert.equal(pairs[0].vif, null);
});

test('correlationPairs — 수치형 2개 미만이면 빈 배열', () => {
  assert.deepEqual(correlationPairs([{ name: 'a', values: F([1, 2]) }]), []);
});
