// domain/quality.js — Dataset Health Score (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-04 (docs/use-cases.md)
// 의존 위치: stats·correlation·outlier 를 소비하고 finding.js 에 공급한다. → docs/data-model.md §6
//
// 감점 규칙의 단일 원천은 docs/rules.md §2 이며 수치는 thresholds.js 에서 가져온다.
// UC-04 가 "임의 점수가 아님을 보장한다"고 선언했으므로 항목마다 evidence 를 반드시 채운다 —
// 점수만 보여주고 근거를 감추면 그 약속을 위반한다.
//
// id·text 타입 열은 missing 을 제외한 모든 항목에서 제외한다(rules.md §2.3).
// ID 열의 고유값이 100% 인 것은 정상이므로 cardinality 로 감점하면 오판이다.
//
// penalty 는 정수(data-model.md §3.4)이므로 항목별로 반올림한 뒤 합산한다.

import {
  HEALTH_PENALTY_CAP,
  HEALTH_PENALTY_FACTOR,
  HEALTH_VERDICT,
  HEALTH_GRADE,
  FINDING,
} from './thresholds.js';

/** evidence 의 열 목록 상한 — 근거 노출이 목적이므로 최악 몇 개면 충분하다. */
const EVIDENCE_COLUMNS = 5;

/**
 * 항목 6종을 판정해 총점·등급·항목별 결과를 산출한다.
 * @param {{ columns: Array<object>, dataset: { rowCount: number, duplicateRowCount: number } }} input
 * @returns {{
 *   total: number, grade: 'good'|'fair'|'poor',
 *   items: Array<{
 *     key: 'missing'|'duplicate'|'constant'|'cardinality'|'outlier'|'invalid',
 *     verdict: 'ok'|'warn'|'bad',
 *     penalty: number,
 *     evidence: object
 *   }>
 * }}
 */
export function healthScore(input) {
  const { columns, dataset } = input;
  // rules.md §2.3 — id·text 는 missing 외 항목에서 제외
  const eligible = columns.filter((c) => c.type !== 'id' && c.type !== 'text');
  const categorical = columns.filter((c) => c.type === 'categorical');
  const numeric = columns.filter((c) => c.type === 'numeric');

  const items = [
    missingItem(columns),
    duplicateItem(dataset),
    constantItem(eligible, columns.length),
    cardinalityItem(categorical, dataset.rowCount),
    outlierItem(numeric),
    invalidItem(eligible),
  ];

  const total = Math.max(0, 100 - items.reduce((sum, item) => sum + item.penalty, 0));
  return { total, grade: grade(total), items };
}

function grade(total) {
  if (total >= HEALTH_GRADE.good) return 'good';
  if (total >= HEALTH_GRADE.fair) return 'fair';
  return 'poor';
}

/** ratio 기준 공통 verdict — 0 이면 항상 ok (duplicate·invalid 의 ok 경계가 0 이므로). */
function verdictByRatio(ratio, bounds) {
  if (ratio === 0 || ratio < bounds.ok) return 'ok';
  return ratio < bounds.warn ? 'warn' : 'bad';
}

function penalty(key, metric) {
  return Math.round(Math.min(HEALTH_PENALTY_CAP[key], metric * HEALTH_PENALTY_FACTOR[key]));
}

/** 지표가 큰 순으로 최악의 열 몇 개를 근거로 남긴다. */
function worstColumns(columns, getRate) {
  return columns
    .filter((c) => getRate(c) > 0)
    .sort((a, b) => getRate(b) - getRate(a))
    .slice(0, EVIDENCE_COLUMNS)
    .map((c) => ({ name: c.name, rate: getRate(c) }));
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── 항목별 판정 (rules.md §2.1) ────────────────────────────

function missingItem(columns) {
  const avg = mean(columns.map((c) => c.missingRate));
  return {
    key: 'missing',
    verdict: verdictByRatio(avg, HEALTH_VERDICT.missing),
    penalty: penalty('missing', avg),
    evidence: { avgMissingRate: avg, worst: worstColumns(columns, (c) => c.missingRate) },
  };
}

function duplicateItem(dataset) {
  const ratio = dataset.rowCount === 0 ? 0 : dataset.duplicateRowCount / dataset.rowCount;
  return {
    key: 'duplicate',
    verdict: verdictByRatio(ratio, HEALTH_VERDICT.duplicate),
    penalty: penalty('duplicate', ratio),
    evidence: { duplicateRowCount: dataset.duplicateRowCount, duplicateRate: ratio },
  };
}

function constantItem(eligible, totalColumnCount) {
  const hit = eligible.filter((c) => c.modeRate >= FINDING['F-CONST-COL'].modeRate);
  const verdict =
    hit.length === 0
      ? 'ok'
      : hit.length / totalColumnCount >= HEALTH_VERDICT.constant.bad
        ? 'bad'
        : 'warn';
  return {
    key: 'constant',
    verdict,
    penalty: penalty('constant', hit.length),
    evidence: { count: hit.length, columns: hit.map((c) => c.name) },
  };
}

function cardinalityItem(categorical, rowCount) {
  const t = FINDING['F-HIGH-CARD'];
  const hit = categorical.filter(
    (c) => c.uniqueCount >= t.uniqueCount && rowCount > 0 && c.uniqueCount / rowCount >= t.uniqueRatio
  );
  const verdict =
    hit.length === 0
      ? 'ok'
      : hit.length / categorical.length >= HEALTH_VERDICT.cardinality.bad
        ? 'bad'
        : 'warn';
  return {
    key: 'cardinality',
    verdict,
    penalty: penalty('cardinality', hit.length),
    evidence: {
      count: hit.length,
      columns: hit.map((c) => c.name),
      categoricalCount: categorical.length,
    },
  };
}

function outlierItem(numeric) {
  const avg = mean(numeric.map((c) => c.stats?.outlierRate ?? 0));
  return {
    key: 'outlier',
    verdict: verdictByRatio(avg, HEALTH_VERDICT.outlier),
    penalty: penalty('outlier', avg),
    evidence: { avgOutlierRate: avg, worst: worstColumns(numeric, (c) => c.stats?.outlierRate ?? 0) },
  };
}

function invalidItem(eligible) {
  const avg = mean(eligible.map((c) => c.invalidRate));
  return {
    key: 'invalid',
    verdict: verdictByRatio(avg, HEALTH_VERDICT.invalid),
    penalty: penalty('invalid', avg),
    evidence: { avgInvalidRate: avg, worst: worstColumns(eligible, (c) => c.invalidRate) },
  };
}
