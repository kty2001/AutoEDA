// domain/finding.js — 규칙 엔진 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-05, UC-06 (docs/use-cases.md)
// 의존 위치: quality·stats·correlation·outlier 를 소비하고 chart-select.js 에 공급한다.
//            → docs/data-model.md §6
//
// Finding 19종의 조건·심각도·문구 규칙은 docs/rules.md §3·§5, 임계값은 thresholds.js.
// 결정론적으로 생성한다 — LLM 을 쓰지 않으며 Phase 2 의 AI 레이어와 무관하게 동작해야 한다.
//
// ⚠️ what/why/how 를 "문자열로 확정해" 담는다. 템플릿 ID 만 담으면 규칙 버전이 바뀐 뒤
//    결과 파일을 열었을 때(UC-10) 당시 해석이 재현되지 않는다. → docs/data-model.md §3.5
// ⚠️ 문구는 해설 페이지 본문과 문장을 공유하지 않는다 — 안티패턴 #4(템플릿 문장 반복).
//    Finding 은 이 데이터의 수치가 들어간 진단문, 해설은 개념 설명이다. → docs/rules.md §5.2
// ⚠️ 문구에 단정("반드시 ~하세요")과 정도 부사를 쓰지 않는다. → docs/rules.md §5.3
//
// 타깃·모델링군(F-CLASS-IMBALANCE·F-TARGET-SKEW·F-SCALE-DIFF)과 F-LEAKAGE 는
// 타깃 지정 시에만 평가한다(rules.md §3.4·§3.5 — Phase 2 의 UC-21).

import { FINDING, DISPLAY_LIMIT } from './thresholds.js';
import { percent, stat, count, ro } from '../lib/format.js';

/** @typedef {'high'|'medium'|'low'} Severity */
/** @typedef {'dataset'|'column'|'pair'} Scope */

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

/**
 * 통계 결과를 평가해 Finding 목록을 생성한다.
 * 정렬은 심각도 → 영향 열 수 순이며, 표시 개수 상한과 같은 유형 묶기는
 * 표현 레이어가 아니라 여기서 적용한다(thresholds.DISPLAY_LIMIT).
 * 기본 표시 15건 상한(rules.md §4)은 정렬된 목록의 앞부분을 잘라 보여주는 화면의 몫이다 —
 * 여기서 버리면 "전체 보기" 펼침이 불가능해진다.
 * @param {{
 *   dataset: object,
 *   columns: Array<object>,
 *   health: object,
 *   correlations: Array<object>,
 *   target?: string
 * }} input target 이 있으면 타깃·모델링군(Phase 2)도 평가한다
 * @returns {Array<{
 *   id: string, type: string, severity: Severity, scope: Scope,
 *   targets: string[], metrics: object,
 *   what: string, why: string, how: string,
 *   mlRelevant: boolean
 * }>} 발견이 없으면 빈 배열. 호출측이 "확인할 문제가 없음"을 표시한다(UC-05 대안 흐름)
 */
export function buildFindings(input) {
  const { dataset, columns, correlations, target } = input;
  const rowCount = dataset.rowCount;
  const numeric = columns.filter((c) => c.type === 'numeric');
  const categorical = columns.filter((c) => c.type === 'categorical');
  const found = [];
  const counters = {};

  const add = (type, severity, scope, targets, metrics, mlRelevant, what, why, how) => {
    counters[type] = (counters[type] ?? 0) + 1;
    found.push({
      id: `${type}#${counters[type]}`,
      type,
      severity,
      scope,
      targets,
      metrics,
      what,
      why,
      how,
      mlRelevant,
    });
  };

  // ── 데이터 품질군 (rules.md §3.2) ─────────────────────────
  for (const col of columns) {
    if (col.missingRate >= FINDING['F-MISSING-HIGH'].missingRate) {
      add('F-MISSING-HIGH', 'high', 'column', [col.name], { missingRate: col.missingRate }, false,
        `${col.name} 열의 결측이 ${percent(col.missingRate)}입니다.`,
        `결측이 이 수준이면 남은 값만으로 계산한 통계가 열 전체를 대표하지 못할 수 있습니다.`,
        `결측이 특정 조건의 행에 몰려 있는지 확인하고, 열을 유지할지 제외할지 검토해 보세요.`);
    }

    const t = FINDING['F-MISSING-IMPUTE'];
    const skew = col.stats?.skewness;
    if (
      col.missingRate >= t.missingRateMin &&
      col.missingRate < t.missingRateMax &&
      skew !== undefined &&
      Math.abs(skew) >= t.absSkewness
    ) {
      add('F-MISSING-IMPUTE', 'medium', 'column', [col.name],
        { missingRate: col.missingRate, skewness: skew }, true,
        `${col.name} 열은 결측이 ${percent(col.missingRate)}이고 왜도가 ${stat(skew)}입니다.`,
        `치우친 분포에서 평균으로 결측을 채우면 값이 한쪽으로 쏠려 원래 분포와 멀어집니다.`,
        `중앙값 대치나 결측 여부 변수 추가를 적용해 보고, 대치 전후 분포를 비교해 보세요.`);
    }

    if (col.modeRate >= FINDING['F-CONST-COL'].modeRate) {
      add('F-CONST-COL', 'high', 'column', [col.name], { modeRate: col.modeRate }, true,
        `${col.name} 열은 최빈값 하나가 ${percent(col.modeRate)}를 차지합니다.`,
        `거의 변하지 않는 열은 행을 구분하는 정보가 없어 분석과 모델에 기여하지 못합니다.`,
        `수집 범위가 의도와 맞는지 확인하고, 이 열을 분석에서 제외할지 검토해 보세요.`);
    }

    const hc = FINDING['F-HIGH-CARD'];
    const uniqueRatio = rowCount > 0 ? col.uniqueCount / rowCount : 0;
    if (col.type === 'categorical' && col.uniqueCount >= hc.uniqueCount && uniqueRatio >= hc.uniqueRatio) {
      add('F-HIGH-CARD', 'medium', 'column', [col.name],
        { uniqueCount: col.uniqueCount, uniqueRatio }, true,
        `${col.name} 열의 고유값이 ${count(col.uniqueCount)}개로 행의 ${percent(uniqueRatio)}에 해당합니다.`,
        `범주가 이만큼 많으면 빈도 요약이 의미를 잃고, 원-핫 인코딩 시 차원이 급격히 늘어납니다.`,
        `상위 범주 외를 '기타'로 묶거나, 코드성 값이라면 타입 지정을 바꿔 보세요.`);
    }

    if (col.type === 'id' && uniqueRatio >= FINDING['F-ID-COL'].uniqueRatio) {
      add('F-ID-COL', 'low', 'column', [col.name], { uniqueRatio }, true,
        `${col.name} 열은 고유값 비율이 ${percent(uniqueRatio)}로 식별자로 보입니다.`,
        `식별자는 행을 구분할 뿐 통계적 정보가 없고, 모델에 넣으면 과적합의 통로가 됩니다.`,
        `행 식별용으로만 두고 분석·모델 입력에서 제외하는 것을 검토해 보세요.`);
    }
  }

  if (dataset.duplicateRowCount >= FINDING['F-DUP-ROW'].duplicateRowCount) {
    const ratio = rowCount > 0 ? dataset.duplicateRowCount / rowCount : 0;
    add('F-DUP-ROW', 'medium', 'dataset', [],
      { duplicateRowCount: dataset.duplicateRowCount, duplicateRate: ratio }, false,
      `완전히 동일한 행이 ${count(dataset.duplicateRowCount)}건(${percent(ratio)}) 있습니다.`,
      `중복 행은 빈도와 통계를 부풀리고, 학습·평가 분할 시 같은 행이 양쪽에 들어갈 수 있습니다.`,
      `중복이 수집 과정에서 생긴 것인지 확인하고, 제거한 결과와 비교해 보세요.`);
  }

  // ── 분포군 (rules.md §3.3) — 수치형 열 대상 ────────────────
  for (const col of numeric) {
    const s = col.stats ?? {};

    if (Math.abs(s.skewness ?? 0) >= FINDING['F-SKEW'].absSkewness) {
      add('F-SKEW', 'medium', 'column', [col.name], { skewness: s.skewness }, true,
        `${col.name} 열의 왜도가 ${stat(s.skewness)}${ro(stat(s.skewness))} 분포가 한쪽으로 치우쳐 있습니다.`,
        `치우친 분포에서는 평균이 대표값 역할을 하지 못하고 극단값의 영향이 커집니다.`,
        `중앙값 기준으로 요약하거나, 로그 변환 뒤 분포를 다시 확인해 보세요.`);
    }

    if ((s.kurtosis ?? 0) >= FINDING['F-KURTOSIS'].excessKurtosis) {
      add('F-KURTOSIS', 'low', 'column', [col.name], { kurtosis: s.kurtosis }, false,
        `${col.name} 열의 초과첨도가 ${stat(s.kurtosis)}${ro(stat(s.kurtosis))} 꼬리가 두껍습니다.`,
        `꼬리가 두꺼운 분포에서는 드문 극단값이 정규분포 가정보다 자주 나타납니다.`,
        `극단값 구간의 값을 직접 확인하고, 이상치 탐지 결과와 함께 살펴보세요.`);
    }

    if ((s.outlierRate ?? 0) >= FINDING['F-OUTLIER-RATE'].outlierRate) {
      add('F-OUTLIER-RATE', 'medium', 'column', [col.name], { outlierRate: s.outlierRate }, false,
        `${col.name} 열의 값 중 ${percent(s.outlierRate)}가 IQR 기준 범위를 벗어납니다.`,
        `이상치가 이 비율이면 개별 오류라기보다 분포 자체의 특성일 가능성이 있습니다.`,
        `벗어난 값들이 실제 관측인지 입력 오류인지 표본을 직접 확인해 보세요.`);
    }

    const oa = FINDING['F-OUTLIER-ACTION'];
    if ((s.outlierRate ?? 0) >= oa.outlierRate && Math.abs(s.skewness ?? 0) >= oa.absSkewness) {
      add('F-OUTLIER-ACTION', 'low', 'column', [col.name],
        { outlierRate: s.outlierRate, skewness: s.skewness }, true,
        `${col.name} 열은 이상치가 ${percent(s.outlierRate)} 있고 왜도가 ${stat(s.skewness)}입니다.`,
        `치우친 분포에서 이상치를 일괄 제거하면 실제 신호까지 함께 잘려 나갈 수 있습니다.`,
        `제거 대신 변환이나 상·하한 캡핑을 적용한 결과와 비교해 보세요.`);
    }

    if (col.uniqueCount <= FINDING['F-BIN-SENSITIVE'].uniqueCountMax) {
      add('F-BIN-SENSITIVE', 'low', 'column', [col.name], { uniqueCount: col.uniqueCount }, false,
        `${col.name} 열은 수치형이지만 고유값이 ${count(col.uniqueCount)}개뿐입니다.`,
        `이산적인 수치를 연속형 히스토그램으로 그리면 구간 폭에 따라 모양이 달라져 오해를 부릅니다.`,
        `값별 빈도 막대그래프로 보는 편이 적절한지 검토해 보세요.`);
    }
  }

  // ── 관계군 (rules.md §3.4) ────────────────────────────────
  const skewed = numeric.filter(
    (c) => Math.abs(c.stats?.skewness ?? 0) >= FINDING['F-CORR-METHOD'].absSkewness
  );
  if (skewed.length >= 1) {
    add('F-CORR-METHOD', 'low', 'dataset', [],
      { count: skewed.length, columns: skewed.map((c) => c.name) }, false,
      `왜도 절댓값이 2 이상인 수치형 열이 ${count(skewed.length)}개 있습니다.`,
      `Pearson 상관은 직선 관계를 재므로 치우친 분포에서는 관계를 놓치거나 약하게 잴 수 있습니다.`,
      `순위 기반인 Spearman 상관을 함께 확인해 보세요.`);
  }

  const mc = FINDING['F-MULTICOLLINEAR'];
  for (const pair of correlations) {
    const byR = pair.pearson !== null && Math.abs(pair.pearson) >= mc.absPearson;
    const byVif = pair.vif !== null && pair.vif >= mc.vif;
    if (byR || byVif) {
      add('F-MULTICOLLINEAR', 'high', 'pair', [pair.left, pair.right],
        { pearson: pair.pearson, vif: pair.vif }, true,
        byR
          ? `${pair.left} 열과 ${pair.right} 열의 상관이 ${stat(pair.pearson)}입니다.`
          : `${pair.left} 열의 VIF가 ${stat(pair.vif)}${ro(stat(pair.vif))} 다른 열들과 강하게 겹칩니다.`,
        `정보가 겹치는 변수들을 함께 넣으면 회귀 계수가 불안정해지고 해석이 어려워집니다.`,
        `둘 중 하나만 쓰거나 결합 변수를 만드는 방안을 검토해 보세요.`);
    }
  }

  const causal = correlations.filter(
    (p) => p.pearson !== null && Math.abs(p.pearson) >= FINDING['F-CORR-CAUSAL'].absPearson
  );
  if (causal.length >= 1) {
    add('F-CORR-CAUSAL', 'low', 'dataset', [],
      { count: causal.length, pairs: causal.map((p) => [p.left, p.right]) }, false,
      `상관 절댓값이 0.7 이상인 쌍이 ${count(causal.length)}개 있습니다.`,
      `상관은 함께 움직인다는 사실만 말하며, 어느 쪽이 원인인지는 알려주지 않습니다.`,
      `제3의 변수나 수집 구조가 관계를 만들었을 가능성을 함께 검토해 보세요.`);
  }

  const mr = FINDING['F-MIXED-RELATION'];
  if (categorical.length >= mr.minCategorical && numeric.length >= mr.minNumeric) {
    add('F-MIXED-RELATION', 'low', 'dataset', [],
      { categoricalCount: categorical.length, numericCount: numeric.length }, false,
      `범주형 열 ${count(categorical.length)}개와 수치형 열 ${count(numeric.length)}개가 함께 있습니다.`,
      `상관행렬은 수치형끼리만 다루므로 범주형과 수치형 사이의 관계는 별도로 봐야 합니다.`,
      `범주별 수치 분포를 그룹 상자그림으로 비교해 보세요.`);
  }

  // ── 타깃 지정 시에만 (rules.md §3.4 F-LEAKAGE · §3.5) ─────
  if (target) {
    addTargetFindings(add, { columns, numeric, correlations, target });
  }

  return collapseByType(sortFindings(found));
}

function addTargetFindings(add, { columns, numeric, correlations, target }) {
  const lk = FINDING['F-LEAKAGE'];
  for (const pair of correlations) {
    if (pair.left !== target && pair.right !== target) continue;
    if (pair.pearson === null || Math.abs(pair.pearson) < lk.absPearson) continue;
    const other = pair.left === target ? pair.right : pair.left;
    add('F-LEAKAGE', 'high', 'pair', [other, target], { pearson: pair.pearson }, true,
      `${other} 열과 타깃 ${target}의 상관이 ${stat(pair.pearson)}입니다.`,
      `타깃과 거의 일치하는 변수는 타깃 이후에 만들어졌거나 타깃을 그대로 담고 있을 가능성이 있습니다.`,
      `이 열이 예측 시점에 실제로 알 수 있는 값인지 생성 과정을 확인해 보세요.`);
  }

  const targetCol = columns.find((c) => c.name === target);
  if (!targetCol) return;

  const dist = targetCol.classDistribution;
  if (dist && Object.keys(dist).length >= 2) {
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    let minClass = null;
    for (const [cls, n] of Object.entries(dist)) {
      if (minClass === null || n < minClass.count) minClass = { value: cls, count: n };
    }
    const minRatio = minClass.count / total;
    if (minRatio <= FINDING['F-CLASS-IMBALANCE'].minClassRatio) {
      add('F-CLASS-IMBALANCE', 'high', 'column', [target],
        { minClass: minClass.value, minClassRatio: minRatio }, true,
        `타깃 ${target}의 최소 클래스 '${minClass.value}' 비율이 ${percent(minRatio)}입니다.`,
        `불균형이 크면 다수 클래스만 맞혀도 정확도가 높아 보여 성능을 오판하기 쉽습니다.`,
        `정확도 대신 F1·재현율로 평가하고, 리샘플링이나 클래스 가중치 적용을 검토해 보세요.`);
    }
  }

  const targetSkew = targetCol.stats?.skewness;
  if (
    targetCol.type === 'numeric' &&
    targetSkew !== undefined &&
    Math.abs(targetSkew) >= FINDING['F-TARGET-SKEW'].absSkewness
  ) {
    add('F-TARGET-SKEW', 'medium', 'column', [target], { skewness: targetSkew }, true,
      `회귀 타깃 ${target}의 왜도가 ${stat(targetSkew)}입니다.`,
      `타깃이 치우치면 모델이 다수 구간에 맞춰지고 꼬리 구간의 예측이 약해집니다.`,
      `타깃에 로그 변환을 적용한 결과와 비교해 보세요.`);
  }

  const stds = numeric.map((c) => c.stats?.std ?? 0).filter((s) => s > 0);
  if (stds.length >= 2) {
    const ratio = Math.max(...stds) / Math.min(...stds);
    if (ratio >= FINDING['F-SCALE-DIFF'].stdRatio) {
      add('F-SCALE-DIFF', 'medium', 'dataset', [], { stdRatio: ratio }, true,
        `수치형 열 간 표준편차 차이가 최대 ${stat(ratio)}배입니다.`,
        `스케일 차이가 크면 거리 기반 방법과 정규화 없는 모델에서 큰 스케일 변수가 결과를 지배합니다.`,
        `표준화·정규화를 적용할지 검토해 보세요.`);
    }
  }
}

/** 심각도 → 영향 열 수 → 유형 → 생성 순번 정렬. 결정론을 위해 동률 기준까지 고정한다.
 *  순번은 숫자로 비교한다 — 문자열 비교면 #10 이 #2 앞에 와서 대표 선정이 뒤틀린다. */
function sortFindings(findings) {
  return findings.slice().sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byTargets = b.targets.length - a.targets.length;
    if (byTargets !== 0) return byTargets;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    return Number(a.id.split('#')[1]) - Number(b.id.split('#')[1]);
  });
}

/**
 * 같은 유형이 상한을 초과하면 대표 몇 건만 남기고 "그 외 N개 열" 로 묶는다.
 * 열 50개 중 30개에 결측이 있으면 묶지 않을 때 목록이 그 유형으로만 채워진다. → docs/rules.md §4
 * 묶음 항목은 `collapsed: true` 와 `#more` 접미 id 를 가지며 targets 에 묶인 열 전부를 담는다.
 * @param {Array<object>} findings
 * @returns {Array<object>}
 */
export function collapseByType(findings) {
  const limit = DISPLAY_LIMIT.findingsPerType;
  const totalByType = {};
  for (const f of findings) totalByType[f.type] = (totalByType[f.type] ?? 0) + 1;

  const seen = {};
  const overflowByType = {};
  const result = [];
  for (const f of findings) {
    seen[f.type] = (seen[f.type] ?? 0) + 1;
    if (seen[f.type] <= limit) {
      result.push(f);
      continue;
    }
    (overflowByType[f.type] ??= { after: result.length, items: [] }).items.push(f);
  }

  // 묶음 항목을 각 유형의 마지막 대표 바로 뒤가 아니라 목록 끝에 두면 정렬이 깨진다 —
  // 대표들이 있던 위치 순서를 유지하도록 기록해 둔 삽입점에 역순으로 끼워 넣는다.
  const inserts = Object.entries(overflowByType).sort((a, b) => b[1].after - a[1].after);
  for (const [type, { after, items }] of inserts) {
    const first = items[0];
    result.splice(after, 0, {
      id: `${type}#more`,
      type,
      severity: first.severity,
      scope: first.scope,
      targets: items.flatMap((f) => f.targets),
      metrics: { collapsedCount: items.length },
      what: `같은 발견이 그 외 ${items.length}개 열에서 더 있습니다.`,
      why: `위의 대표 발견과 같은 기준으로 판정된 항목들입니다.`,
      how: `열 목록을 펼쳐 개별 수치를 확인해 보세요.`,
      mlRelevant: first.mlRelevant,
      collapsed: true,
    });
  }
  return result;
}
