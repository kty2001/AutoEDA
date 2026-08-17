// domain/chart-select.js — 차트 선택 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-06, UC-07, UC-08 (docs/use-cases.md)
// 의존 위치: finding.js 를 소비하고 chart-svg.js 에 공급한다. → docs/data-model.md §6
//
// 모든 그래프를 그리지 않는 것이 이 모듈의 존재 이유다 —
// 열 50개면 히스토그램 50개가 되어 정보 과부하(G2)를 반복한다.
// 타입과 통계적 특성으로 대표 시각화를 선별한다. 상한은 thresholds.DISPLAY_LIMIT.
//
// chart-svg 가 stats 를 역참조하지 않도록 필요한 값을 ChartSpec 에 모두 담아 넘긴다
// (의존 그래프를 DAG 로 유지하기 위한 계약). → docs/data-model.md §2·§6

import { DISPLAY_LIMIT, OUTLIER } from './thresholds.js';

/** @typedef {'histogram'|'boxplot'|'bar'|'scatter'|'heatmap'} ChartKind */

/**
 * 열 하나에 맞는 차트 스펙을 만든다.
 * 수치형 → 히스토그램 + 박스플롯 / 범주형·불리언 → 막대 / 날짜 → 히스토그램.
 * id·text 나 stats 가 빈 열은 그릴 것이 없다(빈 배열).
 * @param {object} column infer·stats 산출물
 * @returns {Array<{ kind: ChartKind, data: object, axis: object }>}
 */
export function selectForColumn(column) {
  const stats = column.stats ?? {};
  switch (column.type) {
    case 'numeric': {
      const charts = [];
      if (stats.histogram) {
        charts.push({
          kind: 'histogram',
          data: stats.histogram,
          axis: { x: column.name, y: '빈도' },
        });
      }
      if ('median' in stats) {
        charts.push({
          kind: 'boxplot',
          data: { min: stats.min, q1: stats.q1, median: stats.median, q3: stats.q3, max: stats.max },
          axis: { x: column.name },
        });
      }
      return charts;
    }
    case 'categorical':
    case 'boolean':
      if (!stats.topValues || stats.topValues.length === 0) return [];
      return [{ kind: 'bar', data: { items: stats.topValues }, axis: { x: column.name, y: '빈도' } }];
    case 'datetime':
      if (!stats.histogram) return [];
      return [{
        kind: 'histogram',
        data: stats.histogram,
        axis: { x: column.name, y: '빈도', time: true }, // 눈금을 날짜로 표기
      }];
    default:
      return []; // id·text — 통계를 산출하지 않는 타입 (docs/data-model.md §3.7)
  }
}

/**
 * 관계 탭에 그릴 산점도 쌍을 선별한다. 상관 절댓값 상위만 남긴다(rules.md §4 — 6쌍).
 * points 가 없는 쌍(용량 폴백 2단계로 축소된 캐시 등)은 그릴 수 없으므로 제외한다.
 * @param {Array<object>} correlations
 * @returns {Array<{ kind: 'scatter', data: object, axis: object }>}
 */
export function selectPairs(correlations) {
  return correlations
    .filter((p) => p.pearson !== null && Array.isArray(p.points) && p.points.length > 0)
    .sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson))
    .slice(0, DISPLAY_LIMIT.scatterPairs)
    .map((p) => ({
      kind: 'scatter',
      data: { points: p.points, pearson: p.pearson, spearman: p.spearman },
      axis: { x: p.left, y: p.right },
    }));
}

/**
 * 상관 히트맵 스펙. 열이 상한을 넘으면 분산(std²) 상위만 남기고 축소 사실을 표시한다
 * (rules.md §4 — 20열). 행렬은 쌍 배열에서 재구성한다(docs/data-model.md §3.6).
 * @param {Array<object>} correlations
 * @param {Array<object>} columns 결과 JSON 의 columns[] (std 참조)
 * @param {'pearson'|'spearman'} [method]
 * @returns {{ kind: 'heatmap', data: object, axis: object }|null} 수치형 2열 미만이면 null
 */
export function selectHeatmap(correlations, columns, method = 'pearson') {
  const involved = new Set();
  for (const p of correlations) {
    involved.add(p.left);
    involved.add(p.right);
  }
  // 원본 열 순서를 유지한다 — 실행마다 축 순서가 바뀌면 비교가 불가능하다
  let names = columns.filter((c) => involved.has(c.name)).map((c) => c.name);
  if (names.length < 2) return null;

  const reduced = names.length > DISPLAY_LIMIT.heatmapColumns;
  if (reduced) {
    const stdByName = new Map(columns.map((c) => [c.name, c.stats?.std ?? 0]));
    names = names
      .slice()
      .sort((a, b) => stdByName.get(b) ** 2 - stdByName.get(a) ** 2)
      .slice(0, DISPLAY_LIMIT.heatmapColumns);
    const kept = new Set(names);
    names = columns.filter((c) => kept.has(c.name)).map((c) => c.name); // 순서 복원
  }

  const index = new Map(names.map((n, i) => [n, i]));
  const cells = [];
  for (const p of correlations) {
    const row = index.get(p.left);
    const col = index.get(p.right);
    if (row === undefined || col === undefined) continue;
    const value = p[method];
    if (value === null || value === undefined) continue;
    cells.push({ row, col, value });
  }
  return { kind: 'heatmap', data: { names, cells, reduced }, axis: { method } };
}

/**
 * Finding 의 근거 시각화를 고른다. 발견 유형에 따라 강조 지점이 다르다
 * (편포 → 히스토그램에 왜도 방향 표시, 이상치 → 박스플롯에 경계선 등).
 * 열 범위 발견만 대상이다 — pair·dataset 범위는 관계 탭이 담당한다.
 * @param {object} finding
 * @param {Array<object>} columns
 * @returns {Array<{ kind: ChartKind, data: object, axis: object }>}
 */
export function selectForFinding(finding, columns) {
  if (finding.scope !== 'column') return [];
  const column = columns.find((c) => c.name === finding.targets[0]);
  if (!column) return [];
  const base = selectForColumn(column);

  if (SKEW_FINDINGS.has(finding.type)) {
    return base
      .filter((s) => s.kind === 'histogram')
      .map((s) => ({ ...s, axis: { ...s.axis, highlight: { skewness: column.stats?.skewness } } }));
  }
  if (OUTLIER_FINDINGS.has(finding.type)) {
    return base
      .filter((s) => s.kind === 'boxplot')
      .map((s) => ({ ...s, data: { ...s.data, bounds: iqrBounds(column.stats) } }));
  }
  return base;
}

const SKEW_FINDINGS = new Set(['F-SKEW', 'F-MISSING-IMPUTE', 'F-TARGET-SKEW']);
const OUTLIER_FINDINGS = new Set(['F-OUTLIER-RATE', 'F-OUTLIER-ACTION']);

/** 박스플롯에 표시할 IQR 경계 — outlier.js 와 같은 정의(thresholds.OUTLIER)를 쓴다. */
function iqrBounds(stats) {
  const iqr = stats.q3 - stats.q1;
  return {
    lower: stats.q1 - OUTLIER.iqrMultiplier * iqr,
    upper: stats.q3 + OUTLIER.iqrMultiplier * iqr,
  };
}
