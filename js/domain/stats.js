// domain/stats.js — 기술통계 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-03, UC-07 (docs/use-cases.md)
// 의존 위치: infer.js 를 소비하고 quality·finding 에 공급한다. → docs/data-model.md §6
//
// 외부 통계 라이브러리를 쓰지 않으므로 분위수·표준편차·적률을 직접 구현한다.
// 산출 필드는 타입별로 다르다 — docs/data-model.md §3.7 참조.
//
// 추정량 선택 (테스트 기준값과 결부되므로 바꾸면 tests/stats.test.js 도 바꿔야 한다):
//   std      — 표본 표준편차 (n-1). pandas 기본값과 같다. n=1 이면 0
//   분위수    — 선형 보간 (R-7, numpy 기본). h = (n-1)p
//   왜도·첨도 — 모집단 적률 기반 g1 = m3/m2^1.5, g2 = m4/m2² - 3 (초과첨도, 정규=0).
//              상수 열(m2=0)은 정의되지 않으므로 0 을 반환한다 — 편포 신호 없음으로 취급

/** topValues 의 기본 상한. 화면 표시가 아니라 결과 JSON 용량을 위한 절단이다. */
const TOP_VALUES_LIMIT = 10;

/** 히스토그램 빈 수 상한 (Sturges 규칙 결과의 클램프). */
const MAX_BINS = 50;

/**
 * 수치형 열의 기술통계를 산출한다.
 * @param {Float64Array} values 결측을 제외한 값
 * @returns {{
 *   mean: number, median: number, std: number, min: number, max: number,
 *   q1: number, q3: number, skewness: number, kurtosis: number
 * }} kurtosis 는 초과첨도(excess kurtosis, 정규분포=0)
 */
export function numericStats(values) {
  const n = values.length;
  const sorted = Float64Array.from(values).sort();

  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of values) {
    const d = v - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;

  return {
    mean,
    median: quantile(sorted, 0.5),
    std: n > 1 ? Math.sqrt((m2 * n) / (n - 1)) : 0,
    min: sorted[0],
    max: sorted[n - 1],
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    skewness: m2 === 0 ? 0 : m3 / m2 ** 1.5,
    kurtosis: m2 === 0 ? 0 : m4 / (m2 * m2) - 3,
  };
}

/**
 * 분위수. 선형 보간(R-7, numpy 기본) — 보간 방식을 문서화해 테스트 기준값과 어긋나지 않게 한다.
 * @param {Float64Array} sorted 오름차순 정렬된 값
 * @param {number} p 0~1
 * @returns {number}
 */
export function quantile(sorted, p) {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  if (lo >= n - 1) return sorted[n - 1];
  return sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]);
}

/**
 * 범주형 열의 상위 값·빈도. 상위 N개만 담으므로 최소 클래스는 잘린다 —
 * 클래스 불균형 판정에는 classDistribution 을 써야 한다(docs/data-model.md §3.3).
 * 결측(공백)은 세지 않는다. 빈도가 같으면 먼저 등장한 값이 앞선다.
 * @param {string[]} values
 * @param {number} [limit]
 * @returns {Array<{ value: string, count: number }>}
 */
export function topValues(values, limit) {
  const freq = countValues(values);
  return [...freq.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit ?? TOP_VALUES_LIMIT);
}

/**
 * 전체 클래스 분포. 타깃 열로 지정된 열에만 산출한다(Phase 2).
 * @param {string[]} values
 * @returns {Record<string, number>}
 */
export function classDistribution(values) {
  return Object.fromEntries(countValues(values));
}

/**
 * 히스토그램 구간. 용량 폴백에서 가장 먼저 제외되는 항목이다(docs/data-model.md §4).
 * 등폭 구간이며 마지막 구간은 최댓값을 포함한다.
 * @param {Float64Array} values 결측 제외
 * @param {number} [binCount] 기본은 Sturges 규칙(⌈log2 n⌉+1), 최대 50
 * @returns {{ binEdges: number[], counts: number[] }}
 */
export function histogram(values, binCount) {
  const n = values.length;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return { binEdges: [min, max], counts: [n] };
  }

  const bins = binCount ?? Math.min(MAX_BINS, Math.ceil(Math.log2(n)) + 1);
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const i = Math.min(bins - 1, Math.floor((v - min) / width)); // 최댓값은 마지막 구간에
    counts[i]++;
  }
  const binEdges = Array.from({ length: bins + 1 }, (_, i) => min + width * i);
  binEdges[bins] = max; // 누적 오차로 마지막 경계가 max 를 벗어나지 않게 고정
  return { binEdges, counts };
}

/** 결측(trim 후 빈 문자열)을 제외한 빈도표. 등장 순서를 보존한다. */
function countValues(values) {
  const freq = new Map();
  for (const value of values) {
    const s = value.trim();
    if (s === '') continue;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  return freq;
}
