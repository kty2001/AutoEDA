// domain/correlation.js — 상관·다중공선성 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-08 (docs/use-cases.md)
// 의존 위치: infer.js 를 소비하고 quality·finding 에 공급한다. → docs/data-model.md §6
//
// 전체 행렬이 아니라 쌍 배열로 반환한다 — 열 30개면 행렬은 900칸이지만
// 상삼각 쌍은 435개이고 임계값 미달을 제외하면 더 줄어든다. 히트맵은 이 배열로 재구성한다.
//
// 결측 처리: 열 배열은 행 정렬을 유지한 전체 길이(결측=NaN)여야 한다.
//   pearson·spearman 은 쌍별 제거(pairwise), vif 는 전행 완전 케이스(listwise)로 계산한다.

/** 수치 특이성 판정 하한. 피벗·분모가 이보다 작으면 계산 불가(null)로 처리한다. */
const EPSILON = 1e-12;

/**
 * 수치형 열들의 상관 쌍을 산출한다. 임계값 필터링은 여기서 하지 않는다 —
 * 용량 축소는 storage 폴백(docs/data-model.md §4)의 몫이다.
 * @param {Array<{name: string, values: Float64Array}>} numericColumns
 * @returns {Array<{ left: string, right: string, pearson: number|null, spearman: number|null, vif: number|null }>}
 *   계산 불가(분산 0 등)인 경우 null. vif 는 좌측 열의 값이다(docs/data-model.md §3.6)
 */
export function correlationPairs(numericColumns) {
  if (numericColumns.length < 2) return [];
  const vifByIndex = numericColumns.map((_, i) => vif(i, numericColumns));
  const pairs = [];
  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      pairs.push({
        left: numericColumns[i].name,
        right: numericColumns[j].name,
        pearson: pearson(numericColumns[i].values, numericColumns[j].values),
        spearman: spearman(numericColumns[i].values, numericColumns[j].values),
        vif: vifByIndex[i],
      });
    }
  }
  return pairs;
}

/**
 * Pearson 상관계수. 양쪽 모두 유효한 행만 사용한다(쌍별 제거).
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number|null} 유효 쌍 2개 미만이거나 한쪽 분산이 0이면 null
 */
export function pearson(a, b) {
  let n = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isNaN(a[i]) || Number.isNaN(b[i])) continue;
    n++;
    sumA += a[i];
    sumB += b[i];
  }
  if (n < 2) return null;
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isNaN(a[i]) || Number.isNaN(b[i])) continue;
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA < EPSILON || varB < EPSILON) return null;
  return cov / Math.sqrt(varA * varB);
}

/**
 * 범주형 열들의 연관성 쌍을 산출한다. correlationPairs() 의 범주형 버전 — 같은 이유로
 * 임계값 필터링은 여기서 하지 않는다.
 * @param {Array<{name: string, values: string[]}>} categoricalColumns 결측은 빈 문자열
 * @returns {Array<{ left: string, right: string, v: number|null }>}
 */
export function categoricalPairs(categoricalColumns) {
  if (categoricalColumns.length < 2) return [];
  const pairs = [];
  for (let i = 0; i < categoricalColumns.length; i++) {
    for (let j = i + 1; j < categoricalColumns.length; j++) {
      pairs.push({
        left: categoricalColumns[i].name,
        right: categoricalColumns[j].name,
        v: cramersV(categoricalColumns[i].values, categoricalColumns[j].values),
      });
    }
  }
  return pairs;
}

/** 조합 키 구분자. 범주값 자체에 공백이 흔하므로(예: "New York") 공백을 쓰면 서로 다른
 *  (a,b) 조합이 같은 키로 충돌할 수 있다 — 값에 나타날 일이 없는 문자로 구분한다. */
const KEY_SEP = "\u0000";

/**
 * Cramér's V — 두 범주형 열의 연관 강도. 분할표 카이제곱 기반, 표준(비보정) 공식을 쓴다.
 * 결측(빈 문자열)은 양쪽 모두 있는 행만 쌍별 제거한다.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number|null} 유효 표본 2개 미만이거나 어느 한쪽 수준이 1개 이하면 null
 */
export function cramersV(a, b) {
  const rowCounts = new Map();
  const colCounts = new Map();
  const cellCounts = new Map();
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (!av || !bv) continue;
    n++;
    rowCounts.set(av, (rowCounts.get(av) ?? 0) + 1);
    colCounts.set(bv, (colCounts.get(bv) ?? 0) + 1);
    const key = av + KEY_SEP + bv;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
  }
  if (n < 2 || rowCounts.size < 2 || colCounts.size < 2) return null;

  let chi2 = 0;
  for (const [rv, rn] of rowCounts) {
    for (const [cv, cn] of colCounts) {
      const expected = (rn * cn) / n;
      if (expected < EPSILON) continue;
      const observed = cellCounts.get(rv + KEY_SEP + cv) ?? 0;
      chi2 += (observed - expected) ** 2 / expected;
    }
  }
  const k = Math.min(rowCounts.size - 1, colCounts.size - 1);
  return Math.sqrt(chi2 / (n * k));
}

/**
 * 순위 변환 후 Pearson 을 적용한다. 동순위는 평균 순위로 처리한다.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number|null}
 */
export function spearman(a, b) {
  const idx = [];
  for (let i = 0; i < a.length; i++) {
    if (!Number.isNaN(a[i]) && !Number.isNaN(b[i])) idx.push(i);
  }
  if (idx.length < 2) return null;
  const rankA = ranks(idx.map((i) => a[i]));
  const rankB = ranks(idx.map((i) => b[i]));
  return pearson(rankA, rankB);
}

/** 평균 순위(1부터). 동순위는 묶음의 평균 순위를 받는다. */
function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const result = new Float64Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) result[order[k][1]] = avgRank;
    i = j + 1;
  }
  return result;
}

/**
 * 분산팽창계수. 대상 열을 나머지 수치형 열로 회귀한 R² 의 역수 기반.
 * 열 수가 적어 정규방정식으로 충분하다. 전행 완전 케이스(listwise)만 사용한다.
 * @param {number} targetIndex
 * @param {Array<{name: string, values: Float64Array}>} numericColumns
 * @returns {number|null} 계산 불가(특이 행렬, 표본 부족, 완전 공선 R²≈1 — 이 경우
 *   Pearson |1| 이 이미 F-MULTICOLLINEAR 를 성립시킨다)이면 null
 */
export function vif(targetIndex, numericColumns) {
  const k = numericColumns.length;
  if (k < 2) return null;

  // 전행 완전 케이스 수집
  const rowCount = numericColumns[0].values.length;
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    let ok = true;
    for (const col of numericColumns) {
      if (Number.isNaN(col.values[r])) {
        ok = false;
        break;
      }
    }
    if (ok) rows.push(r);
  }
  const p = k; // 절편 + 예측 열 (k-1)개
  if (rows.length <= p) return null;

  // 설계 행렬 X = [1, 나머지 열들], y = 대상 열
  const predictors = numericColumns.filter((_, i) => i !== targetIndex);
  const X = rows.map((r) => [1, ...predictors.map((col) => col.values[r])]);
  const y = rows.map((r) => numericColumns[targetIndex].values[r]);

  const beta = solveNormalEquations(X, y);
  if (beta === null) return null;

  let meanY = 0;
  for (const v of y) meanY += v;
  meanY /= y.length;

  let ssRes = 0;
  let ssTot = 0;
  for (let r = 0; r < X.length; r++) {
    let fit = 0;
    for (let c = 0; c < beta.length; c++) fit += X[r][c] * beta[c];
    ssRes += (y[r] - fit) ** 2;
    ssTot += (y[r] - meanY) ** 2;
  }
  if (ssTot < EPSILON) return null; // 대상 열이 상수
  const r2 = 1 - ssRes / ssTot;
  if (1 - r2 < EPSILON) return null; // 완전 공선
  return 1 / (1 - r2);
}

/** (XᵀX)β = Xᵀy 를 부분 피벗 가우스 소거로 푼다. 특이 행렬이면 null. */
function solveNormalEquations(X, y) {
  const p = X[0].length;
  // XᵀX 와 Xᵀy 구성
  const A = Array.from({ length: p }, () => new Float64Array(p + 1));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let r = 0; r < X.length; r++) s += X[r][i] * X[r][j];
      A[i][j] = s;
    }
    let s = 0;
    for (let r = 0; r < X.length; r++) s += X[r][i] * y[r];
    A[i][p] = s;
  }
  // 소거
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < EPSILON) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const factor = A[r][col] / A[col][col];
      for (let c = col; c <= p; c++) A[r][c] -= factor * A[col][c];
    }
  }
  return A.map((row, i) => row[p] / row[i]);
}
