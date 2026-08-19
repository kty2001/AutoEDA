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

/** KDE 곡선의 출력 점 수. 400 폭 캔버스에서 64점이면 꺾임이 보이지 않는다. */
const KDE_POINTS = 64;
/** KDE 계산용 정밀 구간 수. 원값을 직접 훑으면 O(점수 × n) 이라 행이 많을 때 느리다. */
const KDE_BINS = 256;

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

/**
 * 히스토그램 위에 겹칠 커널 밀도 곡선(가우시안 KDE).
 * 히스토그램은 구간 폭에 따라 모양이 달라지므로(F-BIN-SENSITIVE) 폭에 덜 의존하는
 * 곡선을 함께 보여 판단을 보정한다.
 *
 * 대역폭은 Silverman 의 경험식 h = 0.9 × min(std, IQR/1.349) × n^(-1/5).
 * IQR 을 함께 쓰는 이유는 std 만으로는 이상치가 있을 때 곡선이 과하게 뭉개지기 때문이다.
 *
 * 원값을 점마다 훑으면 O(KDE_POINTS × n) 이라 행이 많을 때 느리다. 값을 정밀 구간에
 * 먼저 담고 구간 대표값으로 합산해 O(n + KDE_POINTS × KDE_BINS) 로 줄인다
 * (R 의 density() 가 쓰는 binning 과 같은 방식).
 *
 * y 는 히스토그램 counts 와 같은 축으로 환산해 돌려준다 — 차트가 n·구간폭을
 * 되짚지 않고 그대로 겹쳐 그릴 수 있게 하기 위함이다(chart-svg 는 stats 를 역참조하지 않는다).
 *
 * @param {Float64Array|number[]} values 결측 제외
 * @param {{ std: number, q1: number, q3: number }} stats numericStats 산출물
 * @param {{ binEdges: number[] }} hist histogram() 산출물
 * @returns {Array<[number, number]>|undefined} 그릴 수 없으면 undefined
 */
export function densityCurve(values, stats, hist) {
  const n = values.length;
  const lo = hist.binEdges[0];
  const hi = hist.binEdges[hist.binEdges.length - 1];
  if (n < 5 || !(hi > lo)) return undefined; // 상수 열·표본 부족은 곡선이 의미 없다

  const iqr = stats.q3 - stats.q1;
  const spread = iqr > 0 ? Math.min(stats.std, iqr / 1.349) : stats.std;
  const h = 0.9 * spread * n ** -0.2;
  if (!(h > 0) || !Number.isFinite(h)) return undefined;

  const binWidth = (hi - lo) / KDE_BINS;
  const binned = new Float64Array(KDE_BINS);
  for (const v of values) {
    binned[Math.min(KDE_BINS - 1, Math.floor((v - lo) / binWidth))]++;
  }

  // counts 축 환산 계수 — 밀도 × n × 히스토그램 구간폭 을 정리하면 histWidth / (h√2π)
  const histWidth = hist.binEdges[1] - lo;
  const scale = histWidth / (h * Math.sqrt(2 * Math.PI));
  const step = (hi - lo) / (KDE_POINTS - 1);
  const points = [];
  for (let i = 0; i < KDE_POINTS; i++) {
    const x = lo + step * i;
    let sum = 0;
    for (let j = 0; j < KDE_BINS; j++) {
      if (binned[j] === 0) continue;
      const z = (x - (lo + binWidth * (j + 0.5))) / h;
      if (z > 4 || z < -4) continue; // 4σ 밖은 기여가 3e-5 미만이라 버린다
      sum += binned[j] * Math.exp(-0.5 * z * z);
    }
    points.push([round(x), round(sum * scale)]);
  }
  return points;
}

/** 결과 JSON 용량을 위해 유효숫자를 줄인다 — 곡선 좌표에 부동소수 잔여 자릿수는 쓸모가 없다. */
function round(v) {
  return Number(v.toPrecision(6));
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
