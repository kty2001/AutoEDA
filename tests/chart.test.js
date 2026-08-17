// tests/chart.test.js — chart-select.js · chart-svg.js 동작 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectForColumn, selectPairs, selectHeatmap, selectForFinding } from '../js/domain/chart-select.js';
import { linearScale, renderAxis, renderChart, escapeXml } from '../js/domain/chart-svg.js';

const numericCol = (name = 'x', statsOverride = {}) => ({
  name,
  type: 'numeric',
  stats: {
    mean: 5, median: 5, std: 2, min: 1, max: 9, q1: 3, q3: 7,
    skewness: 0, kurtosis: 0, outlierRate: 0,
    histogram: { binEdges: [1, 3, 5, 7, 9], counts: [2, 3, 3, 2] },
    ...statsOverride,
  },
});

// ─── selectForColumn ────────────────────────────────────────

test('수치형 — 히스토그램 + 박스플롯', () => {
  const specs = selectForColumn(numericCol());
  assert.deepEqual(specs.map((s) => s.kind), ['histogram', 'boxplot']);
  assert.deepEqual(specs[1].data, { min: 1, q1: 3, median: 5, q3: 7, max: 9 });
  assert.equal(specs[0].axis.x, 'x');
});

test('범주형·불리언 — 막대, 날짜 — 시간축 히스토그램', () => {
  const cat = { name: 'g', type: 'categorical', stats: { topValues: [{ value: 'A', count: 3 }] } };
  assert.deepEqual(selectForColumn(cat).map((s) => s.kind), ['bar']);

  const dt = { name: 'd', type: 'datetime', stats: { min: 0, max: 1, histogram: { binEdges: [0, 1], counts: [2] } } };
  const [spec] = selectForColumn(dt);
  assert.equal(spec.kind, 'histogram');
  assert.equal(spec.axis.time, true);
});

test('id·text·빈 stats — 그릴 것 없음', () => {
  assert.deepEqual(selectForColumn({ name: 'uid', type: 'id', stats: {} }), []);
  assert.deepEqual(selectForColumn({ name: 'memo', type: 'text', stats: {} }), []);
  assert.deepEqual(selectForColumn({ name: 'empty', type: 'numeric', stats: {} }), []);
});

// ─── selectPairs ────────────────────────────────────────────

test('산점도 — 상관 절댓값 상위 6쌍, points 없는 쌍은 제외', () => {
  const mk = (l, r, pearson, points = [[1, 2]]) => ({ left: l, right: r, pearson, spearman: pearson, vif: null, points });
  const pairs = [
    mk('a', 'b', 0.2),
    mk('a', 'c', -0.9),
    mk('a', 'd', 0.5),
    mk('a', 'e', 0.6),
    mk('a', 'f', 0.7),
    mk('a', 'g', 0.8),
    mk('a', 'h', 0.3),
    { left: 'a', right: 'i', pearson: 0.99, spearman: null, vif: null }, // points 없음
    mk('a', 'j', null),
  ];
  const specs = selectPairs(pairs);
  assert.equal(specs.length, 6);
  assert.equal(specs[0].axis.y, 'c'); // |−0.9| 가 최상위
  assert.ok(specs.every((s) => s.kind === 'scatter' && s.data.points.length > 0));
  assert.ok(!specs.some((s) => s.axis.y === 'i')); // 점 없는 쌍 제외
});

// ─── selectHeatmap ──────────────────────────────────────────

test('히트맵 — 쌍 배열에서 행렬 재구성, 원본 열 순서 유지', () => {
  const columns = [numericCol('a'), numericCol('b'), numericCol('c')];
  const correlations = [
    { left: 'a', right: 'b', pearson: 0.5, spearman: 0.4, vif: null },
    { left: 'b', right: 'c', pearson: -0.3, spearman: -0.2, vif: null },
  ];
  const spec = selectHeatmap(correlations, columns, 'spearman');
  assert.deepEqual(spec.data.names, ['a', 'b', 'c']);
  assert.equal(spec.data.reduced, false);
  assert.deepEqual(spec.data.cells.find((c) => c.row === 0), { row: 0, col: 1, value: 0.4 }); // method 반영
});

test('히트맵 — 20열 초과 시 분산 상위로 축소 (rules.md §4)', () => {
  const columns = Array.from({ length: 25 }, (_, i) => numericCol(`c${i}`, { std: i + 1 }));
  const correlations = [];
  for (let i = 0; i < 25; i++) {
    for (let j = i + 1; j < 25; j++) {
      correlations.push({ left: `c${i}`, right: `c${j}`, pearson: 0.1, spearman: 0.1, vif: null });
    }
  }
  const spec = selectHeatmap(correlations, columns);
  assert.equal(spec.data.reduced, true);
  assert.equal(spec.data.names.length, 20);
  assert.ok(!spec.data.names.includes('c0')); // 분산 최하위 5개 탈락
  assert.equal(spec.data.names[0], 'c5'); // 축소 후에도 원본 열 순서
});

test('히트맵 — 수치형 2열 미만이면 null', () => {
  assert.equal(selectHeatmap([], [numericCol('a')]), null);
});

// ─── selectForFinding ───────────────────────────────────────

test('편포 발견 — 히스토그램만, 왜도 강조 부착', () => {
  const columns = [numericCol('x', { skewness: 2.5 })];
  const finding = { type: 'F-SKEW', scope: 'column', targets: ['x'] };
  const specs = selectForFinding(finding, columns);
  assert.deepEqual(specs.map((s) => s.kind), ['histogram']);
  assert.equal(specs[0].axis.highlight.skewness, 2.5);
});

test('이상치 발견 — 박스플롯에 IQR 경계 부착', () => {
  const columns = [numericCol('x')];
  const finding = { type: 'F-OUTLIER-RATE', scope: 'column', targets: ['x'] };
  const [spec] = selectForFinding(finding, columns);
  assert.equal(spec.kind, 'boxplot');
  assert.deepEqual(spec.data.bounds, { lower: 3 - 1.5 * 4, upper: 7 + 1.5 * 4 });
});

test('pair·dataset 범위·없는 열은 빈 배열', () => {
  assert.deepEqual(selectForFinding({ type: 'F-MULTICOLLINEAR', scope: 'pair', targets: ['a', 'b'] }, []), []);
  assert.deepEqual(selectForFinding({ type: 'F-SKEW', scope: 'column', targets: ['ghost'] }, []), []);
});

// ─── chart-svg ──────────────────────────────────────────────

test('linearScale — 매핑과 상수 도메인', () => {
  const s = linearScale([0, 10], [100, 200]);
  assert.equal(s(0), 100);
  assert.equal(s(5), 150);
  assert.equal(s(10), 200);
  assert.equal(linearScale([3, 3], [0, 100])(3), 50); // 폭 0 → 중앙 고정
});

test('escapeXml — 5종 특수문자', () => {
  assert.equal(escapeXml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
});

test('renderChart — 히스토그램: svg 루트·막대 수·인라인 style 금지', () => {
  const svg = renderChart(selectForColumn(numericCol())[0]);
  assert.ok(svg.startsWith('<svg viewBox="0 0 400 220"'));
  assert.equal((svg.match(/class="bar"/g) ?? []).length, 4);
  assert.ok(!svg.includes('style=')); // CSP style-src 'self' (tech-stack.md §6)
});

test('renderChart — 열 이름·범주 값이 이스케이프된다 (XSS 경로 차단)', () => {
  const col = {
    name: '<img onerror=x>',
    type: 'categorical',
    stats: { topValues: [{ value: '<script>alert(1)</script>', count: 3 }] },
  };
  const svg = renderChart(selectForColumn(col)[0]);
  assert.ok(!svg.includes('<script'));
  assert.ok(!svg.includes('<img'));
  assert.ok(svg.includes('&lt;'));
});

test('renderChart — 박스플롯: 중앙값 선과 IQR 경계 점선', () => {
  const finding = { type: 'F-OUTLIER-RATE', scope: 'column', targets: ['x'] };
  const [spec] = selectForFinding(finding, [numericCol('x')]);
  const svg = renderChart(spec);
  assert.ok(svg.includes('class="median"'));
  assert.equal((svg.match(/stroke-dasharray/g) ?? []).length, 2);
});

test('renderChart — 산점도: 점 개수만큼 circle', () => {
  const spec = { kind: 'scatter', data: { points: [[1, 2], [3, 4], [5, 6]], pearson: 1, spearman: 1 }, axis: { x: 'a', y: 'b' } };
  const svg = renderChart(spec);
  assert.equal((svg.match(/<circle/g) ?? []).length, 3);
});

test('renderChart — 히트맵: 대칭 채움과 축소 안내', () => {
  const spec = {
    kind: 'heatmap',
    data: {
      names: ['a', 'b'],
      cells: [{ row: 0, col: 1, value: 0.8 }],
      reduced: true,
    },
    axis: { method: 'pearson' },
  };
  const svg = renderChart(spec);
  assert.equal((svg.match(/class="cell"/g) ?? []).length, 4); // 대각 2 + 대칭 2
  assert.ok(svg.includes('축소됨'));
});

test('renderAxis — 제목이 이스케이프된다', () => {
  const g = renderAxis({ orient: 'x', ticks: [], title: 'a<b' });
  assert.ok(g.includes('a&lt;b'));
});
