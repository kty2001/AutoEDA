// domain/pca.js — 주성분 분석 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-08 (docs/use-cases.md) — 수치형 열 사이의 관계
// 의존 위치: infer.js 를 소비하고 chart-select.js 에 공급한다. → docs/data-model.md §6
//
// 상관 쌍(correlation.js)이 두 열씩만 다루는 데 반해, 이 모듈은 수치형 열 전체가
// 실제로 몇 개의 축에 담겨 있는지를 본다. 해설 multicollinearity 가 다중공선성 조치로
// 주성분 축약을 제시하는데 도구가 그것을 계산해 주지 않던 공백을 메운다.
//
// 계산 규약 (테스트 기준값과 결부되므로 바꾸면 tests/pca.test.js 도 바꿔야 한다):
//   결측    — listwise(전행 완전 케이스). correlation.vif() 와 같은 정의다.
//             쌍별 제거로 만든 상관행렬은 준정부호가 아닐 수 있어 음수 고윳값이 나온다
//   스케일  — 항상 표준화한다(= 상관행렬 기준). 스케일이 섞이면 큰 단위 열이 PC1 을
//             독식하는데, 그것은 도구가 F-SCALE-DIFF 로 경고하는 상황 그 자체다.
//             중심·척도는 transform.js 의 scale:standard 와 같은 stats.numericStats 값을 쓴다
//   상수 열 — 완전 케이스에서 std 가 0 이면 표준화가 정의되지 않으므로 제외한다
//             (transform.js 의 degenerate 가드와 같은 판정)
//   고유분해 — 순환 Jacobi 회전. 대칭 행렬 전용이고 p 가 PCA.maxColumns 이하라 O(p³)은
//             무시 가능하다. 기존 선형대수 선례인 correlation.solveNormalEquations(가우스 소거)는
//             연립방정식 풀이라 고유분해에 쓸 수 없다
//   부호    — 성분마다 절댓값이 가장 큰 로딩이 양수가 되도록 고정한다. 고유벡터의 부호는
//             수학적으로 임의이고, 실행마다 표가 뒤집히면 비교도 테스트도 불가능해진다
//   로딩    — loading[k][i] = v[i][k] × √λ[k]. 표준화 PCA 에서 이 값은 원본 열과 주성분의
//             상관계수와 같다. [-1,1] 범위라 표에서 읽히고 사이트가 쓰는 상관 어휘와 이어진다

import { numericStats } from './stats.js';
import { PCA, DISPLAY_LIMIT } from './thresholds.js';

/** 수치 특이성 판정 하한. correlation.js 와 같은 값을 쓴다. */
const EPSILON = 1e-12;

/** Jacobi 회전 최대 스윕 수. 대칭 행렬은 보통 6~10 스윕에서 수렴한다. */
const MAX_SWEEPS = 50;

/**
 * 수치형 열들의 주성분을 산출한다. 산출 조건에 미달하면 null 을 반환한다 —
 * 부분 결과를 내지 않는다(부분 통계는 틀린 통계다).
 * @param {Array<{name: string, values: Float64Array}>} numericColumns
 *   행 정렬을 유지한 전체 길이 배열(결측=NaN). correlation.js 와 같은 입력 계약이다
 * @returns {null | {
 *   columns: string[],
 *   usedRowCount: number,
 *   droppedRowCount: number,
 *   droppedColumns: string[],
 *   reduced: boolean,
 *   components: Array<{ eigenvalue: number, ratio: number, cumulative: number }>,
 *   loadings: number[][]
 * }} loadings 는 [성분][열] 이며 DISPLAY_LIMIT.pcaComponents 개 성분까지만 담는다.
 *   행 단위 값(주성분 점수)은 담지 않는다 → docs/data-model.md §3.9
 */
export function principalComponents(numericColumns) {
  if (!Array.isArray(numericColumns) || numericColumns.length < PCA.minColumns) return null;

  const { selected, reduced } = limitColumns(numericColumns);
  const rows = completeRows(selected);
  const droppedRowCount = (selected[0]?.values.length ?? 0) - rows.length;
  if (rows.length < PCA.minCompleteRows) return null;

  const droppedColumns = [];
  const kept = [];
  for (const col of selected) {
    const z = Float64Array.from(rows, (r) => col.values[r]);
    const s = numericStats(z);
    if (!(s.std > 0)) {
      droppedColumns.push(col.name);
      continue;
    }
    for (let i = 0; i < z.length; i++) z[i] = (z[i] - s.mean) / s.std;
    kept.push({ name: col.name, z });
  }
  if (kept.length < PCA.minColumns) return null;

  const { values: eigenvalues, vectors } = jacobiEigen(correlationMatrix(kept, rows.length));
  const order = eigenvalues
    .map((value, index) => ({ value: Math.max(value, 0), index }))
    .sort((a, b) => b.value - a.value);

  let total = 0;
  for (const e of order) total += e.value;
  if (total < EPSILON) return null; // 전 성분이 0 — 정상 상관행렬에서는 나오지 않는다

  let running = 0;
  const components = order.map((e) => {
    const ratio = e.value / total;
    running += ratio;
    return { eigenvalue: e.value, ratio, cumulative: running };
  });

  const shown = Math.min(order.length, DISPLAY_LIMIT.pcaComponents);
  const loadings = [];
  for (let k = 0; k < shown; k++) {
    const source = order[k].index;
    const scale = Math.sqrt(order[k].value);
    loadings.push(orientSign(kept.map((_, i) => vectors[i][source] * scale)));
  }

  return {
    columns: kept.map((c) => c.name),
    usedRowCount: rows.length,
    droppedRowCount,
    droppedColumns,
    reduced,
    components,
    loadings,
  };
}

/**
 * 열이 상한을 넘으면 분산 상위만 남기고 원본 순서를 복원한다 —
 * chart-select.selectHeatmap 의 20열 축소와 같은 방식이다(실행마다 축 순서가 바뀌면 비교 불가).
 */
function limitColumns(numericColumns) {
  if (numericColumns.length <= PCA.maxColumns) return { selected: numericColumns, reduced: false };
  const ranked = numericColumns
    .slice()
    .sort((a, b) => variance(b.values) - variance(a.values))
    .slice(0, PCA.maxColumns);
  const kept = new Set(ranked.map((c) => c.name));
  return { selected: numericColumns.filter((c) => kept.has(c.name)), reduced: true };
}

/**
 * 결측을 건너뛴 표본분산. numericStats 를 쓰지 않는 이유는 그 계약이 결측 없는 배열이고
 * 분위수를 위해 정렬까지 하기 때문이다 — 여기서 필요한 것은 2차 적률뿐이다.
 */
function variance(values) {
  let n = 0;
  let sum = 0;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    n++;
    sum += v;
  }
  if (n < 2) return 0;
  const mean = sum / n;
  let m2 = 0;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    m2 += (v - mean) ** 2;
  }
  return m2 / (n - 1);
}

/** 전행 완전 케이스의 행 번호. correlation.vif() 와 같은 수집 방식이다. */
function completeRows(columns) {
  const rowCount = columns[0]?.values.length ?? 0;
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    let ok = true;
    for (const col of columns) {
      if (Number.isNaN(col.values[r])) {
        ok = false;
        break;
      }
    }
    if (ok) rows.push(r);
  }
  return rows;
}

/**
 * 표준화된 열들의 상관행렬. z 가 표본 std(n-1)로 표준화돼 있으므로
 * 분모를 n-1 로 두면 대각이 정확히 1 이 된다.
 */
function correlationMatrix(kept, n) {
  const p = kept.length;
  const C = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      const a = kept[i].z;
      const b = kept[j].z;
      let s = 0;
      for (let r = 0; r < n; r++) s += a[r] * b[r];
      const value = s / (n - 1);
      C[i][j] = value;
      C[j][i] = value;
    }
  }
  return C;
}

/**
 * 대칭 행렬의 고유분해 — 순환 Jacobi 회전.
 * 회전각은 t² + 2θt − 1 = 0 의 절댓값이 작은 근을 쓴다(수치 안정).
 * @param {Float64Array[]} matrix p×p 대칭 행렬 (변형하지 않는다)
 * @returns {{ values: number[], vectors: Float64Array[] }} vectors[i][k] = k번째 고유벡터의 i번째 성분
 */
function jacobiEigen(matrix) {
  const p = matrix.length;
  const a = matrix.map((row) => Float64Array.from(row));
  const v = Array.from({ length: p }, (_, i) =>
    Float64Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))
  );

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let off = 0;
    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) off += a[i][j] * a[i][j];
    }
    if (off < EPSILON) break;

    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) {
        if (Math.abs(a[i][j]) < EPSILON) continue;
        const theta = (a[j][j] - a[i][i]) / (2 * a[i][j]);
        const sign = theta >= 0 ? 1 : -1;
        const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < p; k++) {
          const aik = a[i][k];
          const ajk = a[j][k];
          a[i][k] = c * aik - s * ajk;
          a[j][k] = s * aik + c * ajk;
        }
        for (let k = 0; k < p; k++) {
          const aki = a[k][i];
          const akj = a[k][j];
          a[k][i] = c * aki - s * akj;
          a[k][j] = s * aki + c * akj;
          const vki = v[k][i];
          const vkj = v[k][j];
          v[k][i] = c * vki - s * vkj;
          v[k][j] = s * vki + c * vkj;
        }
      }
    }
  }

  return { values: Array.from({ length: p }, (_, i) => a[i][i]), vectors: v };
}

/**
 * 성분의 부호를 고정한다 — 절댓값이 가장 큰 로딩을 양수로 만든다.
 * 동률이면 앞선 열이 이긴다(결정성).
 *
 * 고윳값이 0 인 성분(완전 공선이면 반드시 생긴다)은 로딩이 전부 0 이라 부호 개념이 없다.
 * 이때 부호 반전이 만드는 -0 을 0 으로 되돌린다 — 표에 "-0" 이 뜨는 것을 막고
 * 실행 간 결과가 글자 단위로 같게 유지된다.
 */
function orientSign(row) {
  let anchor = 0;
  for (let i = 1; i < row.length; i++) {
    if (Math.abs(row[i]) > Math.abs(row[anchor])) anchor = i;
  }
  const flip = row[anchor] < 0;
  return row.map((value) => {
    const oriented = flip ? -value : value;
    return oriented === 0 ? 0 : oriented;
  });
}
