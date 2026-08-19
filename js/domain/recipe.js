// domain/recipe.js — 발견 → 조치 제안 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 작업: docs/TODO.md T7 1단계
// 의존 위치: finding.js 산출물을 소비하고 transform.js 에 공급한다. → docs/data-model.md §6
//
// 이 모듈이 진단과 조치를 잇는다. Finding 의 "무엇을 하면 되는지"는 지금까지 문장으로만
// 존재했고, 그것을 실행 가능한 스텝으로 옮기는 것이 여기서 하는 일의 전부다.
//
// ⚠️ 제안은 제안일 뿐이다 — 기본 레시피는 비어 있고 사용자가 켠 것만 적용된다.
//    그래서 제안마다 cost(대가)를 함께 낸다. 조치의 이득만 보여 주면 도구가 판단을
//    대신하는 것이 되고, 그것은 docs/direction.md 가 명시적으로 배제한 방향이다.
//
// 조치가 없는 Finding 유형은 EXCLUDED 에 이유와 함께 등재한다. 매핑도 제외도 없는 유형이
// 생기면 tests/recipe.test.js 의 폐합 검사가 실패한다 — 조용히 빠지는 것을 막기 위함이다.

import { STEP_ORDER } from './transform.js';

/**
 * 조치를 제안하지 않는 Finding 유형과 그 이유.
 * "아직 안 만들었다"가 아니라 "이 도구가 다룰 일이 아니다"를 적는다.
 */
export const EXCLUDED = Object.freeze({
  'F-KURTOSIS': '꼬리가 두꺼운 것 자체는 고칠 대상이 아님 — 모델 선택의 근거로 쓰는 정보임',
  'F-BIN-SENSITIVE': '구간 수에 민감한 분포는 표시 문제이지 데이터 문제가 아님',
  'F-CORR-METHOD': '상관 방식 선택은 관계 탭에서 바꾸는 것이며 데이터를 바꿀 일이 아님',
  'F-CORR-CAUSAL': '인과 해석의 경고이므로 데이터 조치가 존재하지 않음',
  'F-CLASS-IMBALANCE': '리샘플링·클래스 가중치는 학습 단계의 선택이며 전처리 산출물에 넣으면 누수를 만듦',
  'F-MIXED-RELATION': '폐지된 유형 (docs/rules.md §6.3)',
});

/**
 * Finding 목록에서 조치 후보를 만든다.
 * @param {Array<object>} findings buildFindings 산출물
 * @param {Array<object>} columns 결과 JSON 의 columns[]
 * @returns {Array<{ id: string, op: string, column?: string, method?: string, action?: string,
 *                   label: string, cost: string, findingType: string }>}
 */
export function suggestSteps(findings, columns) {
  const typeByName = new Map((columns ?? []).map((c) => [c.name, c.type]));
  const out = [];
  const seen = new Set();
  const push = (step) => {
    // 제안 목록에서는 방식이 다르면 다른 제안이다 — 이상치 조정(clip)과 행 제거는
    // 사용자가 골라야 하는 대안이므로 op:column 으로 묶으면 한쪽이 사라진다.
    // 실제 적용 시에는 normalizeRecipe 가 op:column 기준으로 하나만 남긴다.
    const key = `${stepKey(step)}:${step.method ?? step.action ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: key, ...step });
  };

  for (const finding of findings ?? []) {
    const make = RULES[finding.type];
    if (!make) continue;
    // 묶인 발견(collapsed)은 targets 에 열이 여럿 들어 있다 — 전부 제안 대상이다
    const targets = finding.scope === 'column' || finding.scope === 'pair' ? finding.targets : [null];
    for (const [i, column] of targets.entries()) {
      for (const step of make(column, typeByName, columns, i)) {
        push({ ...step, findingType: finding.type });
      }
    }
  }
  return out;
}

/**
 * 레시피를 적용 가능한 형태로 정리한다 — 중복 제거 + 정규 순서 정렬.
 * transform.applyRecipe 도 자체적으로 정렬하지만, 화면에 보이는 순서와 실제 적용 순서가
 * 달라 보이지 않게 하려고 화면 쪽에서도 이 함수를 통과시킨다.
 * @param {Array<object>} steps
 * @returns {Array<object>}
 */
export function normalizeRecipe(steps) {
  const seen = new Set();
  const unique = [];
  for (const step of steps ?? []) {
    const key = stepKey(step);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(step);
  }
  return unique
    .map((step, i) => [step, i])
    .sort((a, b) => rank(a[0].op) - rank(b[0].op) || a[1] - b[1])
    .map(([step]) => step);
}

function rank(op) {
  const i = STEP_ORDER.indexOf(op);
  return i === -1 ? STEP_ORDER.length : i;
}

/** 같은 열의 같은 연산은 한 건이다. 방식(method)이 달라도 하나만 남는다. */
function stepKey(step) {
  return step.column ? `${step.op}:${step.column}` : step.op;
}

// ─── 유형별 제안 규칙 ───────────────────────────────────────
// 각 규칙은 (열 이름, 타입표, 전체 열) → 스텝 배열. 열이 없는 dataset 범위는 column 이 null 이다.

const RULES = {
  'F-DUP-ROW': () => [
    {
      op: 'drop-duplicates',
      label: '완전 중복 행 제거',
      cost: '의도적으로 같은 값이 반복되는 데이터(집계 전 원자료 등)라면 실제 관측을 지우게 됩니다.',
    },
  ],

  'F-CONST-COL': (column) => [
    {
      op: 'drop-column',
      column,
      label: `상수·준상수 열 제거 — ${column}`,
      cost: '준상수 열의 소수 값이 드문 사건을 가리키는 경우 그 신호까지 함께 사라집니다.',
    },
  ],

  'F-ID-COL': (column) => [
    {
      op: 'drop-column',
      column,
      label: `식별자 열 제거 — ${column}`,
      cost: '행을 되짚을 열쇠가 사라지므로 결과를 원본과 대조할 수 없게 됩니다.',
    },
  ],

  'F-HIGH-CARD': (column) => [
    {
      op: 'encode',
      column,
      method: 'frequency',
      label: `고카디널리티 열을 빈도로 인코딩 — ${column}`,
      cost: '범주의 정체성이 빈도 하나로 눌립니다. 빈도가 같은 서로 다른 범주는 구분되지 않습니다.',
    },
    {
      op: 'drop-column',
      column,
      label: `고카디널리티 열 제거 — ${column}`,
      cost: '범주가 담고 있던 정보를 통째로 버립니다.',
    },
  ],

  'F-MISSING-HIGH': (column, typeByName) => [
    {
      op: 'impute',
      column,
      method: typeByName.get(column) === 'numeric' ? 'median' : 'mode',
      label: `결측 대치 — ${column}`,
      cost: '결측이 20%를 넘는 열의 대치는 없는 값을 만들어 내는 일에 가깝습니다. 분산이 줄고 상관이 과대평가됩니다.',
    },
    {
      op: 'drop-column',
      column,
      label: `결측이 많은 열 제거 — ${column}`,
      cost: '결측 자체가 신호인 경우(응답 거부 등) 그 신호를 버리게 됩니다.',
    },
  ],

  'F-MISSING-IMPUTE': (column, typeByName) => [
    {
      op: 'impute',
      column,
      // 편포 열이라 평균이 아니라 중위수를 기본으로 둔다 — 해설 missing-imputation 과 같은 근거
      method: typeByName.get(column) === 'numeric' ? 'median' : 'mode',
      label: `결측 대치(중위수) — ${column}`,
      cost: '대치한 값이 한 점에 몰려 분포에 봉우리가 생기고 표준편차가 실제보다 작아집니다.',
    },
  ],

  'F-OUTLIER-RATE': (column) => outlierSteps(column),
  'F-OUTLIER-ACTION': (column) => outlierSteps(column),

  'F-SKEW': (column) => [
    {
      op: 'log1p',
      column,
      label: `로그 변환 — ${column}`,
      cost: '값의 단위가 바뀌어 해석이 어려워집니다. −1 이하 값이 있으면 적용되지 않습니다.',
    },
  ],

  'F-TARGET-SKEW': (column) => [
    {
      op: 'log1p',
      column,
      label: `타깃 로그 변환 — ${column}`,
      cost: '예측값을 원래 단위로 되돌리려면 역변환이 필요하고, 그 과정에서 편향이 생깁니다.',
    },
  ],

  'F-MULTICOLLINEAR': (column) => [
    {
      op: 'drop-column',
      column,
      label: `공선 쌍 중 한 열 제거 — ${column}`,
      cost: '어느 쪽을 남길지는 도메인 판단입니다. 잘못 고르면 해석하기 쉬운 열을 버립니다.',
    },
  ],

  // targets 는 [상대 열, 타깃] 순서다(finding.js). 타깃 자신을 지우자고 제안하면 안 되므로
  // 첫 번째 대상에서만 스텝을 낸다.
  'F-LEAKAGE': (column, _typeByName, _columns, index) =>
    index === 0
      ? [
          {
            op: 'drop-column',
            column,
            label: `누수 후보 열 제거 — ${column}`,
            cost: '타깃과 정당하게 강한 관계인 열이라면 예측력을 스스로 버리는 것이 됩니다.',
          },
        ]
      : [],

  'F-SCALE-DIFF': (_column, _typeByName, columns) =>
    (columns ?? [])
      .filter((c) => c.type === 'numeric')
      .map((c) => ({
        op: 'scale',
        column: c.name,
        method: 'standard',
        label: `표준화 — ${c.name}`,
        cost: '값이 원래 단위를 잃습니다. 테스트 세트에는 이 표에 적힌 평균·표준편차를 그대로 써야 합니다.',
      })),
};

function outlierSteps(column) {
  return [
    {
      op: 'outlier',
      column,
      action: 'clip',
      label: `이상치를 경계값으로 조정 — ${column}`,
      cost: '경계 밖 값이 전부 한 값에 쌓여 그 지점에 인위적인 봉우리가 생깁니다.',
    },
    {
      op: 'outlier',
      column,
      action: 'drop-rows',
      label: `이상치 행 제거 — ${column}`,
      cost: '해당 행의 다른 열 값까지 함께 사라집니다. 이상치가 관심 대상이었다면 분석 자체가 무의미해집니다.',
    },
  ];
}
