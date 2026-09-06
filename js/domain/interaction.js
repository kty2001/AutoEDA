// domain/interaction.js — 다중 컬럼 관계(교호작용) 탐지 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 의존 위치: correlation.js 의 pearson 을 재사용하고 finding.js·chart-select.js 에 공급한다.
//            → docs/data-model.md §6
//
// 두 수치형 열의 관계가 제3의 변수에 따라 달라지는지 두 갈래로 본다.
// - 그룹상관: 범주형 Z 의 각 수준별로 (X,Y) 상관을 다시 재고 전체 상관과 비교한다.
//   부호가 뒤집히거나 델타가 크면 조절효과(Simpson's paradox 유형)로 본다.
// - 편상관: 수치형 Z 를 통제했을 때 (X,Y) 상관이 원래 값과 얼마나 달라지는지 본다.
//
// 비용 상한(thresholds.INTERACTION)은 여기서 적용한다 — 열 3개 조합을 전수 탐색하지 않고
// 이미 상관 절댓값 상위로 걸러진 후보 쌍만 확장한다(correlationPairs() 와 같은 원칙).

import { pearson } from './correlation.js';
import { INTERACTION } from './thresholds.js';

/**
 * 편상관계수. 세 값이 모두 있는 행만 사용한다(listwise) — pairwise 로 셋을 섞으면
 * 공식이 성립하지 않는다.
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {Float64Array} z
 * @returns {{ n: number, rxy: number|null, rxz: number|null, ryz: number|null, partial: number|null }}
 */
export function partialCorrelation(x, y, z) {
  const idx = [];
  for (let i = 0; i < x.length; i++) {
    if (!Number.isNaN(x[i]) && !Number.isNaN(y[i]) && !Number.isNaN(z[i])) idx.push(i);
  }
  const n = idx.length;
  if (n < 3) return { n, rxy: null, rxz: null, ryz: null, partial: null };

  const xs = Float64Array.from(idx, (i) => x[i]);
  const ys = Float64Array.from(idx, (i) => y[i]);
  const zs = Float64Array.from(idx, (i) => z[i]);
  const rxy = pearson(xs, ys);
  const rxz = pearson(xs, zs);
  const ryz = pearson(ys, zs);
  if (rxy === null || rxz === null || ryz === null) {
    return { n, rxy, rxz, ryz, partial: null };
  }
  const denom = Math.sqrt((1 - rxz * rxz) * (1 - ryz * ryz));
  const partial = denom < 1e-12 ? null : (rxy - rxz * ryz) / denom;
  return { n, rxy, rxz, ryz, partial };
}

/**
 * 범주형 Z 의 각 수준별로 (X,Y) 상관을 계산해 전체 상관(overallR)과 비교한다.
 * 표본이 INTERACTION.minGroupSize 미만인 수준은 제외한다 — 적은 표본의 상관은
 * 우연히 클 수 있다. 유효 수준이 2개 미만이면 비교할 것이 없어 null.
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {string[]} z 같은 행 정렬의 범주값(결측은 빈 문자열)
 * @param {number|null} overallR
 * @returns {{ groups: Array<{ value: string, n: number, pearson: number|null }>,
 *             maxDelta: number, signFlip: boolean }|null}
 */
export function groupedCorrelation(x, y, z, overallR) {
  if (overallR === null) return null;

  const rowsByLevel = new Map();
  for (let i = 0; i < z.length; i++) {
    const level = z[i];
    if (!level || Number.isNaN(x[i]) || Number.isNaN(y[i])) continue;
    if (!rowsByLevel.has(level)) rowsByLevel.set(level, []);
    rowsByLevel.get(level).push(i);
  }

  const groups = [];
  for (const [value, rows] of rowsByLevel) {
    if (rows.length < INTERACTION.minGroupSize) continue;
    const xs = Float64Array.from(rows, (i) => x[i]);
    const ys = Float64Array.from(rows, (i) => y[i]);
    groups.push({ value, n: rows.length, pearson: pearson(xs, ys) });
  }
  if (groups.length < 2) return null;

  let maxDelta = 0;
  let signFlip = false;
  for (const g of groups) {
    if (g.pearson === null) continue;
    maxDelta = Math.max(maxDelta, Math.abs(g.pearson - overallR));
    if (Math.sign(g.pearson) !== 0 && Math.sign(overallR) !== 0 && Math.sign(g.pearson) !== Math.sign(overallR)) {
      signFlip = true;
    }
  }
  return { groups, maxDelta, signFlip };
}

/**
 * 상관 절댓값 상위 후보 쌍에 대해 그룹상관·편상관 후보를 계산한다.
 * 판정(흥미도)은 하지 않는다 — 비용 상한만 적용하고 나머지는 finding.js 가 담당한다
 * (correlationPairs() 와 같은 원칙).
 * @param {{
 *   numericColumns: Array<{ name: string, values: Float64Array }>,
 *   categoricalColumns: Array<{ name: string, values: string[] }>,
 *   correlations: Array<{ left: string, right: string, pearson: number|null }>
 * }} input correlations 는 이미 계산된 전체 수치형 쌍 상관(재계산하지 않고 재사용한다)
 * @returns {Array<
 *   { kind: 'grouped', left: string, right: string, by: string, overall: number,
 *     groups: object[], maxDelta: number, signFlip: boolean } |
 *   { kind: 'partial', left: string, right: string, z: string, rxy: number, partial: number }
 * >}
 */
export function detectInteractions({ numericColumns, categoricalColumns, correlations }) {
  const candidates = correlations
    .filter((p) => p.pearson !== null)
    .sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson))
    .slice(0, INTERACTION.candidatePairs);
  if (candidates.length === 0) return [];

  const numericByName = new Map(numericColumns.map((c) => [c.name, c.values]));
  const corrLookup = new Map();
  for (const p of correlations) {
    if (p.pearson === null) continue;
    corrLookup.set(`${p.left}\u0000${p.right}`, p.pearson);
    corrLookup.set(`${p.right}\u0000${p.left}`, p.pearson);
  }

  const results = [];
  for (const pair of candidates) {
    const x = numericByName.get(pair.left);
    const y = numericByName.get(pair.right);
    if (!x || !y) continue;

    for (const cat of categoricalColumns) {
      const grouped = groupedCorrelation(x, y, cat.values, pair.pearson);
      if (grouped) {
        results.push({
          kind: 'grouped', left: pair.left, right: pair.right, by: cat.name,
          overall: pair.pearson, ...grouped,
        });
      }
    }

    // 통제 변수 후보는 이미 계산된 상관(재사용)으로 관련도 순위를 매긴다 — pearson 재계산 안 함
    const otherNumeric = numericColumns
      .filter((c) => c.name !== pair.left && c.name !== pair.right)
      .map((c) => ({
        name: c.name,
        values: c.values,
        relevance: Math.max(
          Math.abs(corrLookup.get(`${pair.left}\u0000${c.name}`) ?? 0),
          Math.abs(corrLookup.get(`${pair.right}\u0000${c.name}`) ?? 0)
        ),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, INTERACTION.candidateControls);

    for (const z of otherNumeric) {
      const result = partialCorrelation(x, y, z.values);
      if (result.partial !== null) {
        results.push({
          kind: 'partial', left: pair.left, right: pair.right, z: z.name,
          rxy: result.rxy, partial: result.partial,
        });
      }
    }
  }
  return results;
}
