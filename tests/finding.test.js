// tests/finding.test.js — domain/finding.js 동작 테스트
// 조건 기준값은 docs/rules.md §3, 문구 규칙은 §5.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFindings, collapseByType } from '../js/domain/finding.js';

/** 기본 열 — 어떤 Finding 도 내지 않는 수치형. 필요한 것만 덮어쓴다. */
const col = (name, overrides = {}) => ({
  name,
  type: 'numeric',
  missingRate: 0,
  invalidRate: 0,
  uniqueCount: 30, // F-BIN-SENSITIVE(≤20) 회피
  modeRate: 0.1,
  stats: { skewness: 0, kurtosis: 0, outlierRate: 0, std: 1 },
  ...overrides,
});

const build = (columns, extra = {}) =>
  buildFindings({
    dataset: { rowCount: 100, duplicateRowCount: 0, ...extra.dataset },
    columns,
    health: {},
    correlations: extra.correlations ?? [],
    target: extra.target,
  });

const ofType = (findings, type) => findings.filter((f) => f.type === type);

// ─── 조용한 데이터 ──────────────────────────────────────────

test('발견이 없으면 빈 배열 (UC-05 대안 흐름)', () => {
  assert.deepEqual(build([col('a'), col('b')]), []);
});

// ─── 데이터 품질군 ──────────────────────────────────────────

test('F-MISSING-HIGH — 결측률 20% 이상, high', () => {
  const [f] = ofType(build([col('a', { missingRate: 0.321 })]), 'F-MISSING-HIGH');
  assert.equal(f.severity, 'high');
  assert.equal(f.scope, 'column');
  assert.deepEqual(f.targets, ['a']);
  assert.ok(f.what.includes('32.1%')); // §5.3 — what 에는 항상 수치
  assert.equal(f.mlRelevant, false);
});

test('F-MISSING-IMPUTE — 결측 5~20% 이고 |왜도|≥1', () => {
  const hit = build([col('a', { missingRate: 0.1, stats: { skewness: -1.5 } })]);
  assert.equal(ofType(hit, 'F-MISSING-IMPUTE').length, 1);
  // 왜도 조건 미달이면 나지 않는다
  const miss = build([col('a', { missingRate: 0.1, stats: { skewness: 0.2 } })]);
  assert.equal(ofType(miss, 'F-MISSING-IMPUTE').length, 0);
  // 20% 이상은 F-MISSING-HIGH 몫
  const high = build([col('a', { missingRate: 0.25, stats: { skewness: 2 } })]);
  assert.equal(ofType(high, 'F-MISSING-IMPUTE').length, 0);
});

test('F-DUP-ROW — 중복 1건 이상, dataset 범위는 targets 빈 배열', () => {
  const [f] = ofType(build([col('a')], { dataset: { duplicateRowCount: 3 } }), 'F-DUP-ROW');
  assert.equal(f.scope, 'dataset');
  assert.deepEqual(f.targets, []);
  assert.ok(f.what.includes('3'));
});

test('F-CONST-COL — modeRate 0.95 이상은 타입 무관', () => {
  const found = build([col('s', { type: 'categorical', modeRate: 0.96, uniqueCount: 2 })]);
  assert.equal(ofType(found, 'F-CONST-COL').length, 1);
});

test('F-HIGH-CARD — 범주형이고 고유값 50↑ & 비율 50%↑', () => {
  const found = build([col('tag', { type: 'categorical', uniqueCount: 60 })]);
  assert.equal(ofType(found, 'F-HIGH-CARD').length, 1);
  // 수치형에는 적용하지 않는다
  const numeric = build([col('n', { uniqueCount: 60 })]);
  assert.equal(ofType(numeric, 'F-HIGH-CARD').length, 0);
});

test('F-ID-COL — id 타입이고 고유값 비율 99%↑, low', () => {
  const [f] = ofType(build([col('uid', { type: 'id', uniqueCount: 100, stats: undefined })]), 'F-ID-COL');
  assert.equal(f.severity, 'low');
});

// ─── 분포군 ─────────────────────────────────────────────────

test('F-SKEW / F-KURTOSIS / F-OUTLIER-RATE / F-OUTLIER-ACTION', () => {
  const found = build([
    col('x', { stats: { skewness: 2.5, kurtosis: 8, outlierRate: 0.06, std: 1 } }),
  ]);
  assert.equal(ofType(found, 'F-SKEW').length, 1);
  assert.equal(ofType(found, 'F-KURTOSIS').length, 1);
  assert.equal(ofType(found, 'F-OUTLIER-RATE').length, 1);
  assert.equal(ofType(found, 'F-OUTLIER-ACTION').length, 1); // 0.06≥0.01 & |2.5|≥1
});

test('F-KURTOSIS — 초과첨도는 절댓값이 아니라 상방만', () => {
  const found = build([col('x', { stats: { skewness: 0, kurtosis: -8, outlierRate: 0, std: 1 } })]);
  assert.equal(ofType(found, 'F-KURTOSIS').length, 0);
});

test('F-BIN-SENSITIVE — 수치형이고 고유값 20 이하', () => {
  const found = build([col('rating', { uniqueCount: 5 })]);
  assert.equal(ofType(found, 'F-BIN-SENSITIVE').length, 1);
});

// ─── 관계군 ─────────────────────────────────────────────────

test('F-CORR-METHOD — 왜도 큰 수치형 열이 있으면 dataset 안내', () => {
  const found = build([col('x', { stats: { skewness: 3, kurtosis: 0, outlierRate: 0, std: 1 } }), col('y')]);
  const [f] = ofType(found, 'F-CORR-METHOD');
  assert.equal(f.scope, 'dataset');
  assert.deepEqual(f.metrics.columns, ['x']);
});

test('F-MULTICOLLINEAR — |r|≥0.8 또는 VIF≥10', () => {
  const byR = build([col('a'), col('b')], {
    correlations: [{ left: 'a', right: 'b', pearson: 0.85, spearman: 0.8, vif: 2 }],
  });
  assert.equal(ofType(byR, 'F-MULTICOLLINEAR').length, 1);

  const byVif = build([col('a'), col('b')], {
    correlations: [{ left: 'a', right: 'b', pearson: 0.3, spearman: 0.3, vif: 12 }],
  });
  const [f] = ofType(byVif, 'F-MULTICOLLINEAR');
  assert.ok(f.what.includes('VIF'));

  const neither = build([col('a'), col('b')], {
    correlations: [{ left: 'a', right: 'b', pearson: 0.3, spearman: 0.3, vif: null }],
  });
  assert.equal(ofType(neither, 'F-MULTICOLLINEAR').length, 0);
});

test('F-CORR-CAUSAL — |r|≥0.7 쌍 존재. 범주+수치 공존은 더 이상 발견이 아니다', () => {
  const found = build([col('a'), col('b'), col('c', { type: 'categorical', uniqueCount: 3 })], {
    correlations: [{ left: 'a', right: 'b', pearson: -0.75, spearman: -0.7, vif: 1 }],
  });
  assert.equal(ofType(found, 'F-CORR-CAUSAL').length, 1);
  // 폐지된 유형 — 항상 발화해 정보량이 0 이었다. 안내는 관계 탭 고정 문구로 옮겼다(rules.md §6.3)
  assert.equal(ofType(found, 'F-MIXED-RELATION').length, 0);
});

// ─── 타깃 지정 시 (Phase 2 경로) ────────────────────────────

test('타깃 미지정이면 T군·F-LEAKAGE 는 평가하지 않는다', () => {
  const found = build([col('a', { classDistribution: { yes: 95, no: 5 } }), col('y')], {
    correlations: [{ left: 'a', right: 'y', pearson: 0.99, spearman: 0.9, vif: null }],
  });
  assert.equal(ofType(found, 'F-CLASS-IMBALANCE').length, 0);
  assert.equal(ofType(found, 'F-LEAKAGE').length, 0);
});

test('F-LEAKAGE — 타깃과 |r|≥0.95', () => {
  const found = build([col('a'), col('y')], {
    correlations: [{ left: 'a', right: 'y', pearson: 0.99, spearman: 0.9, vif: null }],
    target: 'y',
  });
  const [f] = ofType(found, 'F-LEAKAGE');
  assert.equal(f.severity, 'high');
  assert.deepEqual(f.targets, ['a', 'y']);
});

test('F-CLASS-IMBALANCE — 최소 클래스 비율 10% 이하', () => {
  const target = col('label', {
    type: 'categorical',
    uniqueCount: 2,
    classDistribution: { ok: 95, fail: 5 },
  });
  const found = build([target, col('x')], { target: 'label' });
  const [f] = ofType(found, 'F-CLASS-IMBALANCE');
  assert.ok(f.what.includes('fail'));
  assert.ok(f.what.includes('5.0%'));
});

test('F-TARGET-SKEW · F-SCALE-DIFF — 타깃 지정 시에만', () => {
  const cols = [
    col('y', { stats: { skewness: 1.5, kurtosis: 0, outlierRate: 0, std: 1000 } }),
    col('x', { stats: { skewness: 0, kurtosis: 0, outlierRate: 0, std: 1 } }),
  ];
  const withTarget = build(cols, { target: 'y' });
  assert.equal(ofType(withTarget, 'F-TARGET-SKEW').length, 1);
  assert.equal(ofType(withTarget, 'F-SCALE-DIFF').length, 1); // 1000/1 ≥ 100
  const without = build(cols);
  assert.equal(ofType(without, 'F-TARGET-SKEW').length, 0);
  assert.equal(ofType(without, 'F-SCALE-DIFF').length, 0);
});

// ─── 정렬·묶기·형식 ─────────────────────────────────────────

test('정렬 — 심각도 순 (high 먼저)', () => {
  const found = build([
    col('bins', { uniqueCount: 5 }), // F-BIN-SENSITIVE low
    col('gone', { missingRate: 0.5 }), // F-MISSING-HIGH high
  ]);
  assert.equal(found[0].type, 'F-MISSING-HIGH');
});

test('collapseByType — 유형당 5건 초과분은 "그 외 N개" 로 묶는다 (rules.md §4)', () => {
  const cols = Array.from({ length: 8 }, (_, i) => col(`m${i}`, { missingRate: 0.5 }));
  const found = build(cols);
  const missings = ofType(found, 'F-MISSING-HIGH');
  assert.equal(missings.length, 6); // 대표 5 + 묶음 1
  const more = missings[5];
  assert.equal(more.collapsed, true);
  assert.equal(more.id, 'F-MISSING-HIGH#more');
  assert.equal(more.metrics.collapsedCount, 3);
  assert.deepEqual(more.targets, ['m5', 'm6', 'm7']);
  assert.ok(more.what.includes('3개'));
});

test('collapseByType — 상한 이하면 그대로', () => {
  const findings = [
    { id: 'F-X#1', type: 'F-X', severity: 'low', scope: 'column', targets: ['a'], metrics: {}, what: 'w', why: 'y', how: 'h', mlRelevant: false },
  ];
  assert.deepEqual(collapseByType(findings), findings);
});

test('문구 규칙 — 금지 표현이 없다 (rules.md §5.3)', () => {
  const found = build([
    col('gone', { missingRate: 0.5 }),
    col('sk', { stats: { skewness: 3, kurtosis: 8, outlierRate: 0.06, std: 1 } }),
    col('cat', { type: 'categorical', uniqueCount: 60, modeRate: 0.96 }),
  ], { dataset: { duplicateRowCount: 2 } });
  assert.ok(found.length > 0);
  for (const f of found) {
    for (const text of [f.what, f.why, f.how]) {
      assert.ok(!text.includes('반드시'), `단정 표현: ${text}`);
      assert.ok(!text.includes('해야 합니다'), `단정 표현: ${text}`);
      assert.ok(!text.includes('심각합니다'), `정도 부사: ${text}`);
    }
  }
});

test('id 는 유형 내 순번 — {type}#{n} (data-model.md §3.5)', () => {
  const found = build([col('m1', { missingRate: 0.5 }), col('m2', { missingRate: 0.5 })]);
  assert.deepEqual(
    ofType(found, 'F-MISSING-HIGH').map((f) => f.id),
    ['F-MISSING-HIGH#1', 'F-MISSING-HIGH#2']
  );
});
