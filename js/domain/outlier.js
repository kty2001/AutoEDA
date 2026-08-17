// domain/outlier.js — 이상치 탐지 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-07 (docs/use-cases.md)
// 의존 위치: infer.js 를 소비하고 quality·finding 에 공급한다. → docs/data-model.md §6
//
// 임계값(IQR 1.5배)은 thresholds.js 에서 가져온다. 여기에 상수를 쓰지 않는다.

import { OUTLIER } from './thresholds.js';

/** z-score 방식의 기본 임계값. 3σ 는 정규분포에서 0.27% 에 해당하는 관례적 기준이다. */
const DEFAULT_Z = 3;

/**
 * IQR 기반 이상치 비율. 박스플롯 정의(Q1 - k·IQR, Q3 + k·IQR)를 따른다.
 * @param {Float64Array} values 결측 제외
 * @param {{ q1: number, q3: number }} quartiles stats.numericStats 산출값 재사용
 * @returns {{ rate: number, lowerBound: number, upperBound: number, count: number }}
 */
export function iqrOutliers(values, quartiles) {
  const iqr = quartiles.q3 - quartiles.q1;
  const lowerBound = quartiles.q1 - OUTLIER.iqrMultiplier * iqr;
  const upperBound = quartiles.q3 + OUTLIER.iqrMultiplier * iqr;
  let count = 0;
  for (const v of values) {
    if (v < lowerBound || v > upperBound) count++;
  }
  return {
    rate: values.length === 0 ? 0 : count / values.length,
    lowerBound,
    upperBound,
    count,
  };
}

/**
 * z-score 기반 이상치 비율. 해설 D3(탐지법 비교)에서 대조군으로 제시하기 위해 함께 산출한다.
 * 표준편차가 0(상수 열)이면 이상치 없음으로 본다.
 * @param {Float64Array} values
 * @param {{ mean: number, std: number }} moments
 * @param {number} [z]
 * @returns {{ rate: number, count: number }}
 */
export function zScoreOutliers(values, moments, z) {
  const limit = z ?? DEFAULT_Z;
  if (moments.std === 0 || values.length === 0) return { rate: 0, count: 0 };
  let count = 0;
  for (const v of values) {
    if (Math.abs(v - moments.mean) / moments.std > limit) count++;
  }
  return { rate: count / values.length, count };
}
