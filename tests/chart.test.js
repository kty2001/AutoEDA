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

test('renderChart — 히스토그램·박스플롯·막대: 데이터가 플롯 경계에 붙지 않는다', () => {
  // PLOT = { x: 48, y: 16, w: 340, h: 172 } — 축선(x=48)과 우측 끝(x=388)에 여백이 있어야 한다
  const [hist, box] = selectForColumn(numericCol());

  const bars = [...renderChart(hist).matchAll(/<rect x="([\d.]+)"[^>]*width="([\d.]+)"[^>]*class="bar"/g)];
  assert.equal(bars.length, 4);
  assert.ok(Number(bars[0][1]) > 48, `첫 막대가 축선에 붙음: ${bars[0][1]}`);
  const right = Number(bars[3][1]) + Number(bars[3][2]);
  assert.ok(right < 388, `마지막 막대가 우측 끝에 붙음: ${right}`);

  // 세로 박스플롯은 최소·최대 수염이 위아래 끝이다 (BOX: top 16 · 캔버스 300 · bottom 32)
  const svg = renderChart(box);
  const ys = [...svg.matchAll(/<line[^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)"[^>]*class="(?:whisker|median)"/g)]
    .flatMap((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(ys.length > 0);
  assert.ok(Math.min(...ys) - 16 > 5, `최댓값 수염이 위 경계에 붙음: ${Math.min(...ys)}`);
  assert.ok(268 - Math.max(...ys) > 5, `최솟값 수염이 아래 경계에 붙음: ${Math.max(...ys)}`);

  // 가로 막대는 0 에서 출발하므로 여백이 세로로 붙는다 (BAR: top 16 · 캔버스 260 · bottom 32)
  const cat = {
    name: 'g',
    type: 'categorical',
    stats: { topValues: Array.from({ length: 10 }, (_, i) => ({ value: `v${i}`, count: 10 - i })) },
  };
  const barSvg = renderChart(selectForColumn(cat)[0]);
  const rows = [...barSvg.matchAll(/<rect x="128" y="([\d.]+)"[^>]*height="([\d.]+)"/g)];
  assert.equal(rows.length, 10);
  assert.ok(Number(rows[0][1]) - 16 > 10, `첫 막대가 위 경계에 붙음: ${rows[0][1]}`);
  const bottom = Number(rows[9][1]) + Number(rows[9][2]);
  assert.ok(228 - bottom > 10, `마지막 막대가 x축선에 붙음: ${bottom}`);
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

// ── 막대 좌우 레이블 (공용 여백 좌 48·우 12 에서 viewBox 밖으로 잘렸음) ──

test('renderChart — 막대: 긴 한글 범주명과 7자리 빈도가 캔버스 안에 들어온다 (잘림 회귀)', () => {
  const col = {
    name: '지역',
    type: 'categorical',
    stats: {
      topValues: [
        { value: '서울특별시 강남구 역삼동', count: 1234567 },
        { value: '부산', count: 1 },
      ],
    },
  };
  const svg = renderChart(selectForColumn(col)[0]);
  assert.ok(svg.startsWith('<svg viewBox="0 0 480 260"'));

  // text-anchor="end" 인 범주 레이블은 앵커에서 왼쪽으로 자라므로 절단 길이만큼 뺀 자리가 시작점이다
  const labels = [...svg.matchAll(/<text x="([-\d.]+)"[^>]*class="tick"[^>]*>([^<]*)</g)];
  assert.ok(labels.length > 0);
  for (const [, x, label] of labels) {
    assert.ok(Number(x) - [...label].length * 10 >= 0, `범주 레이블이 왼쪽으로 넘침: ${label}`);
  }

  // text-anchor="start" 인 수치 레이블은 앵커에서 오른쪽으로 자란다
  const values = [...svg.matchAll(/<text x="([-\d.]+)"[^>]*class="value"[^>]*>([^<]*)</g)];
  assert.equal(values.length, 2);
  for (const [, x, label] of values) {
    assert.ok(Number(x) + label.length * 6 <= 480, `수치 레이블이 오른쪽으로 넘침: ${label}`);
  }
});

test('renderChart — 막대: 절단된 범주명 전체를 <title> 로 남긴다', () => {
  const col = {
    name: '지역',
    type: 'categorical',
    stats: { topValues: [{ value: '서울특별시 강남구 역삼동', count: 3 }] },
  };
  const svg = renderChart(selectForColumn(col)[0]);
  assert.ok(svg.includes('<title>서울특별시 강남구 역삼동: 3</title>'));
  assert.ok(svg.includes('…')); // 축 옆 레이블은 절단돼 있다
  assert.ok(!svg.includes('style='));
});

test('renderChart — 박스플롯: 중앙값 선과 IQR 경계 점선', () => {
  const finding = { type: 'F-OUTLIER-RATE', scope: 'column', targets: ['x'] };
  const [spec] = selectForFinding(finding, [numericCol('x')]);
  const svg = renderChart(spec);
  assert.ok(svg.includes('class="median"'));
  assert.equal((svg.match(/stroke-dasharray/g) ?? []).length, 2);
});

test('renderChart — 박스플롯: 세로로 그린다 (값 축이 y)', () => {
  const [, box] = selectForColumn(numericCol());
  const svg = renderChart(box);
  assert.ok(svg.startsWith('<svg viewBox="0 0 300 300"'));

  // 중앙값 선은 가로 — 세로 박스플롯에서만 y1 === y2 다
  const median = svg.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" class="median"/);
  assert.ok(median, '중앙값 선이 없다');
  assert.equal(median[2], median[4], '중앙값 선이 가로가 아니다');
  assert.ok(Number(median[3]) > Number(median[1]));

  // 큰 값이 위에 온다 — 최댓값 눈금의 y 가 최솟값 눈금보다 작아야 한다
  const ticks = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" class="tick"[^>]*>([-\d.]+)</g)].map(
    (m) => [Number(m[1]), Number(m[2])]
  );
  assert.equal(ticks.length, 3); // min · median · max
  const [minTick, , maxTick] = [...ticks].sort((a, b) => a[1] - b[1]);
  assert.ok(maxTick[0] < minTick[0], '최댓값이 아래에 그려졌다');
});

test('renderChart — 히스토그램: density 가 있으면 KDE 곡선을 얹는다', () => {
  const col = numericCol('x', {
    histogram: { binEdges: [1, 3, 5, 7, 9], counts: [2, 3, 3, 2], density: [[1, 1], [5, 4], [9, 1]] },
  });
  const svg = renderChart(selectForColumn(col)[0]);
  const path = svg.match(/<path d="([^"]+)" class="kde" fill="none"\/>/);
  assert.ok(path, 'KDE path 가 없다');
  assert.equal((path[1].match(/[ML]/g) ?? []).length, 3);
  assert.ok(!svg.includes('style='));

  // 봉우리(4)가 최다 구간(3)보다 높아도 잘리지 않는다 — y 상한이 곡선을 포함해야 한다
  const peakY = Number(path[1].match(/L([\d.]+) ([\d.]+)/)[2]);
  assert.ok(peakY >= 16, `곡선이 캔버스 위로 넘침: ${peakY}`);

  // density 가 없으면 곡선도 없다 (캐시 축소·날짜 히스토그램)
  assert.ok(!renderChart(selectForColumn(numericCol())[0]).includes('class="kde"'));
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

// ── 히트맵 축 레이블 (docs/TODO.md T6 — 행 이름만 그려 툴팁 없이 판독 불가였음) ──

/** 20열 히트맵 스펙 — DISPLAY_LIMIT.heatmapColumns 상한과 같은 최악 조건. */
function heatmapSpec(count) {
  const names = Array.from({ length: count }, (_, i) => `col_${i}`);
  const cells = [];
  for (let r = 0; r < count; r++) {
    for (let c = r + 1; c < count; c++) cells.push({ row: r, col: c, value: 0.5 });
  }
  return { kind: 'heatmap', data: { names, cells, reduced: false }, axis: { method: 'pearson' } };
}

test('renderChart — 히트맵: 행·열 레이블을 모두 그린다 (20열)', () => {
  const svg = renderChart(heatmapSpec(20));
  const ticks = svg.match(/class="tick"/g) ?? [];
  assert.equal(ticks.length, 40); // 행 20 + 열 20
  const rotated = svg.match(/transform="rotate\(-45 /g) ?? [];
  assert.equal(rotated.length, 20); // 열 레이블만 회전한다
  for (const name of ['col_0', 'col_19']) assert.ok(svg.includes(`>${name}<`), name);
});

test('renderChart — 히트맵: 폰트가 셀 크기를 넘지 않는다 (겹침 회귀)', () => {
  for (const count of [5, 20]) {
    const svg = renderChart(heatmapSpec(count));
    const cell = Number(svg.match(/<rect[^>]*width="([\d.]+)"[^>]*class="cell"/)[1]);
    const sizes = [...svg.matchAll(/class="tick"[^>]*font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(sizes.length > 0);
    assert.ok(Math.max(...sizes) <= cell, `${count}열: 폰트 ${Math.max(...sizes)} > 셀 ${cell}`);
  }
});

test('renderChart — 히트맵: 셀마다 수치를 그리고 짙은 셀만 흰 글자로 뒤집는다', () => {
  const spec = {
    kind: 'heatmap',
    data: {
      names: ['a', 'b', 'c'],
      cells: [
        { row: 0, col: 1, value: 0.95 },   // 짙은 녹색 — 흰 글자
        { row: 0, col: 2, value: -0.12 },  // 거의 중립 — 검은 글자
      ],
      reduced: false,
    },
    axis: { method: 'pearson' },
  };
  const svg = renderChart(spec);
  // 대각 3 + 대칭 채운 4 = 7 셀, 셀마다 수치 하나
  assert.equal((svg.match(/class="cell"/g) ?? []).length, 7);
  assert.equal((svg.match(/class="cell-value/g) ?? []).length, 7);
  assert.equal((svg.match(/cell-value-on-dark/g) ?? []).length, 5); // 대각 3(=1) + 0.95 대칭 2
  assert.ok(svg.includes('>0.95<')); // 소수 둘째 자리 고정 — 선행 0 을 떼지 않는다
  assert.ok(svg.includes('>-0.12<'));
  assert.ok(svg.includes('>1.00<')); // 대각선
});

test('renderChart — 히트맵: 글자색은 |r| 이 아니라 채움 휘도로 갈린다 (극별 곡선 차이)', () => {
  // 녹색 극은 |r| ≈ 0.86, 적색 극은 ≈ 0.80 에서 뒤집힌다. 같은 0.83 이 서로 다르게 나와야 한다.
  // 2×2 는 대각선 2칸(=1, 항상 흰 글자) + 값 2칸이다. on-dark 가 2면 값 칸은 검은 글자다.
  const lightCells = (value) => {
    const svg = renderChart({
      kind: 'heatmap',
      data: { names: ['a', 'b'], cells: [{ row: 0, col: 1, value }], reduced: false },
      axis: { method: 'pearson' },
    });
    return (svg.match(/cell-value-on-dark/g) ?? []).length;
  };
  assert.equal(lightCells(0.83), 2, '녹색 0.83 은 검은 글자가 더 읽힌다');
  assert.equal(lightCells(-0.83), 4, '적색 0.83 은 이미 흰 글자 구간이다');
});

test('renderChart — 히트맵: 셀 수치 폰트도 셀 크기를 넘지 않는다 (20열)', () => {
  const svg = renderChart(heatmapSpec(20));
  const cell = Number(svg.match(/<rect[^>]*width="([\d.]+)"[^>]*class="cell"/)[1]);
  const sizes = [...svg.matchAll(/class="cell-value[^"]*"[^>]*font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0, '20열에서도 수치를 그린다');
  assert.ok(Math.max(...sizes) <= cell, `폰트 ${Math.max(...sizes)} > 셀 ${cell}`);
});

test('renderChart — 히트맵: 인라인 style 없이 회전한다 (CSP style-src self)', () => {
  const svg = renderChart(heatmapSpec(20));
  assert.equal((svg.match(/ style="/g) ?? []).length, 0);
});

test('renderChart — 히트맵: 회전 레이블도 이스케이프되고 엔티티가 반토막 나지 않는다', () => {
  const spec = {
    kind: 'heatmap',
    data: { names: ['a<b', '금액&수량이 아주 긴 열 이름'], cells: [{ row: 0, col: 1, value: 0.3 }], reduced: false },
    axis: { method: 'pearson' },
  };
  const svg = renderChart(spec);
  assert.ok(svg.includes('a&lt;b'));
  assert.ok(svg.includes('&amp;'));
  assert.equal((svg.match(/&(?!amp;|lt;|gt;|quot;|apos;)/g) ?? []).length, 0); // 잘린 엔티티 없음
});
