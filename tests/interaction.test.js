// tests/interaction.test.js — domain/interaction.js 동작 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partialCorrelation, groupedCorrelation, detectInteractions } from '../js/domain/interaction.js';
import { pearson } from '../js/domain/correlation.js';

const F = (arr) => Float64Array.from(arr);
const approx = (actual, expected, eps = 1e-6) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

/** Simpson's paradox 데이터: 전체 상관은 강한 양(+), 그룹 안 상관은 강한 음(-). */
function simpsonData(n = 200) {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = [];
  for (let i = 0; i < n; i++) {
    const g = i < n / 2 ? 0 : 1;
    // 그룹 안에서는 x·y 가 반비례하고, 그룹 사이 평균 차이가 전체 상관의 부호를 뒤집는다
    x[i] = g * 10 + (i % 50) * 0.01;
    y[i] = -x[i] + g * 30;
    z.push(g === 0 ? 'g0' : 'g1');
  }
  return { x, y, z };
}

// ─── partialCorrelation ───────────────────────────────────────

test('partialCorrelation — z 가 x·y 완전 매개면 편상관이 0에 가깝다', () => {
  const n = 100;
  const z = F(Array.from({ length: n }, (_, i) => i));
  const x = F(Array.from(z, (v) => v * 2));
  const y = F(Array.from(z, (v) => v * 3));
  const { rxy, partial } = partialCorrelation(x, y, z);
  approx(rxy, 1);
  assert.ok(Math.abs(partial) < 1e-6, `partial=${partial} 가 0에 가깝지 않음`);
});

test('partialCorrelation — z 가 무관하면 편상관이 원 상관과 비슷하다', () => {
  const n = 100;
  const x = F(Array.from({ length: n }, (_, i) => i));
  const y = F(Array.from(x, (v) => v * 2));
  const z = F(Array.from({ length: n }, (_, i) => (i % 7) - 3)); // x·y 와 무관한 패턴
  const { rxy, partial } = partialCorrelation(x, y, z);
  approx(partial, rxy, 0.2);
});

test('partialCorrelation — 결측(NaN)은 세 값 모두 있는 행만 사용(listwise)', () => {
  const x = F([1, 2, NaN, 4, 5]);
  const y = F([2, 4, 100, 8, 10]);
  const z = F([1, 1, 1, NaN, 1]);
  const { n } = partialCorrelation(x, y, z);
  assert.equal(n, 3); // 인덱스 0,1,4 만 세 값 모두 유효
});

test('partialCorrelation — 유효 행 3개 미만이면 null', () => {
  const r = partialCorrelation(F([1, 2]), F([1, 2]), F([1, 2]));
  assert.equal(r.partial, null);
});

// ─── groupedCorrelation ───────────────────────────────────────

test('groupedCorrelation — Simpson 역설: 그룹 안 상관이 전체와 부호가 반대', () => {
  const { x, y, z } = simpsonData();
  const overall = pearson(x, y);
  const result = groupedCorrelation(x, y, z, overall);
  assert.ok(result !== null);
  assert.equal(result.signFlip, true);
  for (const g of result.groups) {
    assert.ok(g.pearson < 0, `그룹 ${g.value} 의 상관이 음수가 아님: ${g.pearson}`);
  }
});

test('groupedCorrelation — 표본이 minGroupSize 미만인 수준은 제외', () => {
  const x = F([1, 2, 3, 4, 5, 6, 7, 8]);
  const y = F([1, 2, 3, 4, 5, 6, 7, 8]);
  const z = ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'b']; // b 는 표본 1개
  const result = groupedCorrelation(x, y, z, pearson(x, y));
  assert.equal(result, null); // 유효 수준이 'a' 하나뿐이라 비교 불가
});

test('groupedCorrelation — overallR 이 null 이면 null', () => {
  assert.equal(groupedCorrelation(F([1, 2]), F([1, 2]), ['a', 'b'], null), null);
});

// ─── detectInteractions ───────────────────────────────────────

test('detectInteractions — 그룹상관·편상관 후보를 모두 낸다', () => {
  const { x, y, z } = simpsonData();
  // x 와 거의 같지만 완전한 아핀 변환은 아닌 통제 후보 — 완전 아핀이면 rxz=1 이 되어
  // 편상관 분모가 0(계산 불가)이 된다
  const zNum = Float64Array.from(x, (v, i) => v + (i % 7) * 0.05);
  const correlations = [{ left: 'x', right: 'y', pearson: pearson(x, y) }];
  const result = detectInteractions({
    numericColumns: [
      { name: 'x', values: x },
      { name: 'y', values: y },
      { name: 'zNum', values: zNum },
    ],
    categoricalColumns: [{ name: 'zCat', values: z }],
    correlations,
  });

  const grouped = result.find((r) => r.kind === 'grouped');
  assert.ok(grouped, '그룹상관 후보가 없음');
  assert.equal(grouped.signFlip, true);

  const partial = result.find((r) => r.kind === 'partial');
  assert.ok(partial, '편상관 후보가 없음');
  assert.ok(Math.abs(partial.rxy - partial.partial) > 0.3, '통제 후 상관이 크게 달라지지 않음');
});

test('detectInteractions — 후보 쌍이 없으면 빈 배열', () => {
  const result = detectInteractions({ numericColumns: [], categoricalColumns: [], correlations: [] });
  assert.deepEqual(result, []);
});
