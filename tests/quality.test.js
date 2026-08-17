// tests/quality.test.js — domain/quality.js 동작 테스트
// 기준값은 docs/rules.md §2 의 계산식을 수기로 적용한 값.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthScore } from '../js/domain/quality.js';

/** 최소 필드를 채운 열 객체. 필요한 것만 덮어쓴다. */
const col = (name, overrides = {}) => ({
  name,
  type: 'numeric',
  missingRate: 0,
  invalidRate: 0,
  uniqueCount: 10,
  modeRate: 0.1,
  stats: { outlierRate: 0 },
  ...overrides,
});

const dataset = (rowCount = 100, duplicateRowCount = 0) => ({ rowCount, duplicateRowCount });

const item = (result, key) => result.items.find((i) => i.key === key);

test('깨끗한 데이터 — 총점 100, 전 항목 ok', () => {
  const r = healthScore({ columns: [col('a'), col('b')], dataset: dataset() });
  assert.equal(r.total, 100);
  assert.equal(r.grade, 'good');
  assert.equal(r.items.length, 6);
  for (const i of r.items) {
    assert.equal(i.verdict, 'ok');
    assert.equal(i.penalty, 0);
  }
});

test('missing — 가중 평균 결측률로 감점 (rules.md §2.1)', () => {
  const r = healthScore({
    columns: [col('a', { missingRate: 0.4 }), col('b')],
    dataset: dataset(),
  });
  const m = item(r, 'missing');
  assert.equal(m.verdict, 'bad'); // 평균 20% ≥ 20%
  assert.equal(m.penalty, 20); // min(25, 0.2×100)
  assert.equal(m.evidence.avgMissingRate, 0.2);
  assert.deepEqual(m.evidence.worst[0], { name: 'a', rate: 0.4 });
});

test('missing — 감점 상한 25', () => {
  const r = healthScore({ columns: [col('a', { missingRate: 0.9 })], dataset: dataset() });
  assert.equal(item(r, 'missing').penalty, 25);
});

test('duplicate — 0 이면 ok, 5% 미만 warn, 이상 bad', () => {
  const ok = healthScore({ columns: [col('a')], dataset: dataset(100, 0) });
  assert.equal(item(ok, 'duplicate').verdict, 'ok');

  const warn = healthScore({ columns: [col('a')], dataset: dataset(100, 2) });
  assert.equal(item(warn, 'duplicate').verdict, 'warn');
  assert.equal(item(warn, 'duplicate').penalty, 6); // min(15, 0.02×300)

  const bad = healthScore({ columns: [col('a')], dataset: dataset(100, 10) });
  assert.equal(item(bad, 'duplicate').verdict, 'bad');
  assert.equal(item(bad, 'duplicate').penalty, 15);
});

test('constant — 열 수 기준 감점, 전체의 20% 이상이면 bad', () => {
  const cols = [col('c1', { modeRate: 0.97 }), ...Array.from({ length: 9 }, (_, i) => col(`n${i}`))];
  const warn = healthScore({ columns: cols, dataset: dataset() });
  assert.equal(item(warn, 'constant').verdict, 'warn'); // 1/10 < 20%
  assert.equal(item(warn, 'constant').penalty, 5); // 1×5
  assert.deepEqual(item(warn, 'constant').evidence.columns, ['c1']);

  const cols2 = [col('c1', { modeRate: 0.97 }), col('c2', { modeRate: 1 }), ...Array.from({ length: 3 }, (_, i) => col(`n${i}`))];
  const bad = healthScore({ columns: cols2, dataset: dataset() });
  assert.equal(item(bad, 'constant').verdict, 'bad'); // 2/5 ≥ 20%
});

test('cardinality — 범주형만 대상, 범주형의 50% 이상이면 bad', () => {
  const highCard = col('hc', { type: 'categorical', uniqueCount: 60 }); // 60/100 ≥ 50%
  const normal = col('cat', { type: 'categorical', uniqueCount: 5 });
  const warn = healthScore({ columns: [highCard, normal, normal, col('n')], dataset: dataset() });
  assert.equal(item(warn, 'cardinality').verdict, 'warn'); // 1/3 < 50%
  assert.equal(item(warn, 'cardinality').penalty, 5);

  const bad = healthScore({ columns: [highCard, normal], dataset: dataset() });
  assert.equal(item(bad, 'cardinality').verdict, 'bad'); // 1/2 ≥ 50%
});

test('outlier — 수치형 이상치율 평균', () => {
  const r = healthScore({
    columns: [col('a', { stats: { outlierRate: 0.06 } }), col('b', { stats: { outlierRate: 0 } })],
    dataset: dataset(),
  });
  const o = item(r, 'outlier');
  assert.equal(o.verdict, 'warn'); // 평균 3% — 1%~5%
  assert.equal(o.penalty, 9); // min(15, 0.03×300)
});

test('invalid — 불일치 비율, 1% 이상이면 bad', () => {
  const r = healthScore({
    columns: [col('a', { invalidRate: 0.04 }), col('b')],
    dataset: dataset(),
  });
  const iv = item(r, 'invalid');
  assert.equal(iv.verdict, 'bad'); // 평균 2% ≥ 1%
  assert.equal(iv.penalty, 10); // min(15, 0.02×500)
});

test('id·text 열은 missing 외 항목에서 제외 (rules.md §2.3)', () => {
  const idCol = col('uid', { type: 'id', uniqueCount: 100, modeRate: 0.01 });
  const textCol = col('memo', { type: 'text', modeRate: 0.97, invalidRate: 0.5 });
  const r = healthScore({ columns: [idCol, textCol, col('n')], dataset: dataset() });
  assert.equal(item(r, 'constant').penalty, 0); // memo 의 준상수는 제외
  assert.equal(item(r, 'invalid').penalty, 0); // memo 의 invalid 도 제외
  assert.equal(item(r, 'cardinality').penalty, 0); // id 는 범주형이 아님
});

test('총점 하한 0, 등급 경계 (rules.md §2.2)', () => {
  const awful = healthScore({
    columns: [
      col('a', { missingRate: 0.9, invalidRate: 0.1, modeRate: 0.99, stats: { outlierRate: 0.2 } }),
      col('b', { missingRate: 0.9, invalidRate: 0.1, modeRate: 0.99, stats: { outlierRate: 0.2 } }),
      col('hc', { type: 'categorical', uniqueCount: 90, missingRate: 0.9 }),
    ],
    dataset: dataset(100, 30),
  });
  assert.ok(awful.total >= 0);
  assert.equal(awful.grade, 'poor');
});
