// domain/transform.js — 전처리 변환 엔진 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 작업: docs/TODO.md T7 1단계
// 의존 위치: parse.js 산출물을 받아 같은 형태로 돌려준다. stats·outlier 를 소비하고
//            worker 의 profile() 에 공급한다. → docs/data-model.md §6
//
// 이 모듈의 존재 이유는 "판정과 조치가 같은 정의를 쓰게" 하는 것이다 —
// 이상치 경계는 outlier.iqrOutliers 를, 분위수·적률은 stats 를 그대로 쓴다.
// 여기서 IQR 계수를 다시 정의하면 발견 목록과 조치 결과가 어긋난다.
//
// ⚠️ 입력 배열을 변형하지 않는다. 원본 무수정은 파일뿐 아니라 메모리 상의 파싱 결과에도
//    적용된다 — Worker 가 원본 parsed 를 붙들고 있고 레시피를 바꿔 가며 반복 적용하므로,
//    한 번이라도 제자리 수정하면 이후 적용이 전부 오염된다. (tests/transform.test.js 가 고정)

import { PREPROCESS, OUTLIER } from './thresholds.js';
import { numericStats } from './stats.js';
import { iqrOutliers } from './outlier.js';

/**
 * 스텝 적용 순서. 레시피 배열의 삽입 순서와 무관하게 항상 이 순서로 적용한다 —
 * 대치 전에 스케일링하는 것 같은 무의미한 조합을 구조로 막기 위한 것이다.
 * 같은 단계 안에서는 삽입 순서를 유지한다(안정 정렬).
 */
export const STEP_ORDER = Object.freeze([
  'drop-duplicates',
  'drop-column',
  'impute',
  'outlier',
  'log1p',
  'encode',
  'scale',
]);

/**
 * 레시피를 적용해 새 데이터셋을 만든다.
 * @param {{ names: string[], columns: Array<Float64Array|string[]>, rowCount: number }} parsed
 * @param {Array<object>} columns 프로파일된 열 정보(type 참조). 없으면 저장 형태로만 판단한다
 * @param {Array<{ op: string, column?: string, method?: string, action?: string, value?: number|string }>} recipe
 * @returns {{ names: string[], columns: Array<Float64Array|string[]>, rowCount: number,
 *            log: Array<{ op: string, column?: string, params: object, note?: string }> }}
 *   log 은 각 스텝의 적합 파라미터다(대치값·IQR 경계·평균/표준편차·인코딩 사전).
 *   테스트 세트에 같은 변환을 적용하려면 이 값이 필요하므로 화면에 그대로 노출한다.
 */
export function applyRecipe(parsed, columns, recipe) {
  // 원본을 건드리지 않기 위해 처음부터 사본으로 시작한다
  const state = {
    names: [...parsed.names],
    cols: parsed.columns.map((col) => (col instanceof Float64Array ? Float64Array.from(col) : [...col])),
    rowCount: parsed.rowCount,
  };
  const typeByName = new Map((columns ?? []).map((c) => [c.name, c.type]));
  const log = [];

  for (const step of sortSteps(recipe ?? [])) {
    const handler = OPS[step.op];
    if (!handler) {
      log.push({ op: step.op, column: step.column, params: {}, note: '알 수 없는 조치라 건너뜀' });
      continue;
    }
    // 앞선 스텝이 열을 지우거나 이름을 바꿨을 수 있다 — 조용히 실패하지 않고 이유를 남긴다
    if (step.column !== undefined && !state.names.includes(step.column)) {
      log.push({ op: step.op, column: step.column, params: {}, note: '앞선 조치로 사라진 열이라 건너뜀' });
      continue;
    }
    log.push(handler(state, step, typeByName));
  }

  return { names: state.names, columns: state.cols, rowCount: state.rowCount, log };
}

/** 정규 순서로 안정 정렬한다. 순서에 없는 op 는 뒤로 보내되 버리지 않는다(로그에 남긴다). */
function sortSteps(recipe) {
  return recipe
    .map((step, i) => [step, i])
    .sort((a, b) => {
      const rank = (s) => {
        const idx = STEP_ORDER.indexOf(s.op);
        return idx === -1 ? STEP_ORDER.length : idx;
      };
      return rank(a[0]) - rank(b[0]) || a[1] - b[1];
    })
    .map(([step]) => step);
}

// ─── 연산 ───────────────────────────────────────────────────

const OPS = {
  'drop-duplicates'(state) {
    const seen = new Set();
    const keep = [];
    for (let r = 0; r < state.rowCount; r++) {
      const key = state.cols.map((col) => String(col[r])).join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      keep.push(r);
    }
    const removed = state.rowCount - keep.length;
    keepRows(state, keep);
    return { op: 'drop-duplicates', params: { removedRows: removed } };
  },

  'drop-column'(state, step) {
    const i = state.names.indexOf(step.column);
    state.names.splice(i, 1);
    state.cols.splice(i, 1);
    return { op: 'drop-column', column: step.column, params: {} };
  },

  impute(state, step, typeByName) {
    const i = state.names.indexOf(step.column);
    const col = state.cols[i];
    const numeric = col instanceof Float64Array;
    const method = step.method ?? (numeric ? 'median' : 'mode');

    if (numeric) {
      const values = compact(col);
      if (values.length === 0 && method !== 'constant') {
        return { op: 'impute', column: step.column, params: {}, note: '값이 전부 결측이라 대치할 수 없음' };
      }
      let fill;
      if (method === 'constant') fill = Number(step.value ?? 0);
      else if (method === 'mean') fill = numericStats(values).mean;
      else if (method === 'mode') fill = modeOf(Array.from(values, String)) ?? 0;
      else fill = numericStats(values).median;
      fill = Number(fill);
      let filled = 0;
      for (let r = 0; r < state.rowCount; r++) {
        if (Number.isNaN(col[r])) {
          col[r] = fill;
          filled++;
        }
      }
      return { op: 'impute', column: step.column, params: { method, fill, filled } };
    }

    const fill = method === 'constant' ? String(step.value ?? '') : (modeOf(col) ?? '');
    let filled = 0;
    for (let r = 0; r < state.rowCount; r++) {
      if (String(col[r] ?? '').trim() === '') {
        col[r] = fill;
        filled++;
      }
    }
    void typeByName;
    return { op: 'impute', column: step.column, params: { method, fill, filled } };
  },

  outlier(state, step) {
    const i = state.names.indexOf(step.column);
    const col = state.cols[i];
    if (!(col instanceof Float64Array)) {
      return { op: 'outlier', column: step.column, params: {}, note: '수치형 열이 아니라 건너뜀' };
    }
    const values = compact(col);
    if (values.length === 0) {
      return { op: 'outlier', column: step.column, params: {}, note: '값이 전부 결측이라 건너뜀' };
    }
    // 판정과 같은 정의를 쓴다 — 발견 목록의 이상치율과 조치 대상이 어긋나면 안 된다
    const { lowerBound, upperBound, count } = iqrOutliers(values, numericStats(values));
    const action = step.action ?? 'clip';
    const params = { action, lowerBound, upperBound, multiplier: OUTLIER.iqrMultiplier, affected: count };

    if (action === 'drop-rows') {
      const keep = [];
      for (let r = 0; r < state.rowCount; r++) {
        const v = col[r];
        if (Number.isNaN(v) || (v >= lowerBound && v <= upperBound)) keep.push(r);
      }
      params.removedRows = state.rowCount - keep.length;
      keepRows(state, keep);
      return { op: 'outlier', column: step.column, params };
    }

    for (let r = 0; r < state.rowCount; r++) {
      if (Number.isNaN(col[r])) continue;
      if (col[r] < lowerBound) col[r] = lowerBound;
      else if (col[r] > upperBound) col[r] = upperBound;
    }
    return { op: 'outlier', column: step.column, params };
  },

  log1p(state, step) {
    const i = state.names.indexOf(step.column);
    const col = state.cols[i];
    if (!(col instanceof Float64Array)) {
      return { op: 'log1p', column: step.column, params: {}, note: '수치형 열이 아니라 건너뜀' };
    }
    // log1p 는 v > -1 에서만 정의된다. 조용히 -Infinity·NaN 을 만들지 않는다
    for (const v of col) {
      if (!Number.isNaN(v) && v <= -1) {
        return { op: 'log1p', column: step.column, params: {}, note: '-1 이하 값이 있어 적용할 수 없음' };
      }
    }
    for (let r = 0; r < state.rowCount; r++) {
      if (!Number.isNaN(col[r])) col[r] = Math.log1p(col[r]);
    }
    return { op: 'log1p', column: step.column, params: { transform: 'log(1+x)' } };
  },

  encode(state, step) {
    const i = state.names.indexOf(step.column);
    const col = state.cols[i];
    const values = Array.from(col, stringOf);
    // sklearn 의 OrdinalEncoder·OneHotEncoder 와 같이 정렬된 고유값을 범주 순서로 쓴다
    const levels = [...new Set(values.filter((v) => v !== ''))].sort();
    const method = step.method ?? 'onehot';

    if (method === 'onehot') {
      if (levels.length > PREPROCESS.onehotMaxUnique) {
        return {
          op: 'encode',
          column: step.column,
          params: { method, uniqueCount: levels.length, limit: PREPROCESS.onehotMaxUnique },
          note: `고유값 ${levels.length}개로 상한 ${PREPROCESS.onehotMaxUnique}개를 넘어 적용하지 않음`,
        };
      }
      const created = levels.map((level) => `${step.column}=${level}`);
      const newCols = levels.map((level) =>
        Float64Array.from(values, (v) => (v === level ? 1 : 0))
      );
      state.names.splice(i, 1, ...created);
      state.cols.splice(i, 1, ...newCols);
      return { op: 'encode', column: step.column, params: { method, levels, created } };
    }

    const table = new Map();
    if (method === 'frequency') {
      for (const v of values) if (v !== '') table.set(v, (table.get(v) ?? 0) + 1);
    } else {
      levels.forEach((level, k) => table.set(level, k)); // ordinal
    }
    state.cols[i] = Float64Array.from(values, (v) => (v === '' ? NaN : table.get(v)));
    return { op: 'encode', column: step.column, params: { method, mapping: Object.fromEntries(table) } };
  },

  scale(state, step) {
    const i = state.names.indexOf(step.column);
    const col = state.cols[i];
    if (!(col instanceof Float64Array)) {
      return { op: 'scale', column: step.column, params: {}, note: '수치형 열이 아니라 건너뜀' };
    }
    const values = compact(col);
    if (values.length === 0) {
      return { op: 'scale', column: step.column, params: {}, note: '값이 전부 결측이라 건너뜀' };
    }
    const s = numericStats(values);
    const method = step.method ?? 'standard';
    let center;
    let spread;
    if (method === 'minmax') {
      center = s.min;
      spread = s.max - s.min;
    } else if (method === 'robust') {
      center = s.median;
      spread = s.q3 - s.q1;
    } else {
      center = s.mean;
      spread = s.std;
    }
    // 폭이 0 이면(상수 열·IQR 0) 나눌 수 없다. 전부 0 으로 두고 이유를 남긴다
    const degenerate = !(spread > 0);
    for (let r = 0; r < state.rowCount; r++) {
      if (Number.isNaN(col[r])) continue;
      col[r] = degenerate ? 0 : (col[r] - center) / spread;
    }
    return {
      op: 'scale',
      column: step.column,
      params: { method, center, spread },
      note: degenerate ? '폭이 0 이라 전부 0 으로 두었음' : undefined,
    };
  },
};

// ─── 공용 도우미 ────────────────────────────────────────────

/** 남길 행 인덱스만 추려 모든 열을 같은 길이로 다시 만든다. */
function keepRows(state, keep) {
  state.cols = state.cols.map((col) =>
    col instanceof Float64Array
      ? Float64Array.from(keep, (r) => col[r])
      : keep.map((r) => col[r])
  );
  state.rowCount = keep.length;
}

/** 결측(NaN)을 제외한 값 — stats·outlier 의 입력 계약. */
function compact(col) {
  const out = [];
  for (const v of col) if (!Number.isNaN(v)) out.push(v);
  return Float64Array.from(out);
}

function stringOf(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? '' : String(v);
  return String(v ?? '').trim();
}

/** 최빈값. 빈도가 같으면 먼저 등장한 값이 이긴다 — stats.topValues 와 같은 규칙. */
function modeOf(values) {
  const freq = new Map();
  for (const raw of values) {
    const v = stringOf(raw);
    if (v === '') continue;
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  let best = null;
  let bestCount = -1;
  for (const [value, count] of freq) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
