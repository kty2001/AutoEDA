// domain/infer.js — 컬럼 타입 추론 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-02 (docs/use-cases.md)
// 의존 위치: parse.js 를 소비하고 stats·correlation·outlier 에 공급한다. → docs/data-model.md §6
//
// 추론 결과가 이후 모든 분석의 기준이 되므로 근거(고유값 수·표본 값)를 함께 반환한다 —
// UC-02 규칙이 "사용자가 판단할 수 있게 근거를 노출"하도록 요구한다.
// 우편번호·코드값이 수치로 잡히는 사례가 흔하므로 사용자 오버라이드 경로가 필수다.
//
// 판정 기준 수치는 전부 thresholds.js 의 INFER · FINDING 에서 온다.
// 결측 = trim 후 빈 문자열만. 'NA'·'미상' 같은 표기는 값이 있는 것이므로
// invalidCount 로 잡힌다(빈 값은 결측, 타입 불일치는 invalid — docs/data-model.md §3.3).

import { hasLeadingZero, toNumber } from './parse.js';
import { FINDING, INFER } from './thresholds.js';

/** @typedef {'numeric'|'categorical'|'datetime'|'boolean'|'id'|'text'} ColumnType */

/** 불리언으로 인정하는 토큰. 0/1 은 수치 이진 변수와 구분할 수 없어 제외한다. */
const BOOL_TOKENS = new Set(['true', 'false', 'yes', 'no', 'y', 'n', 't', 'f']);

const SAMPLE_LIMIT = 5;

/**
 * 열마다 타입을 추론하고 공통 지표(결측·타입불일치·고유값·최빈값 비율)를 산출한다.
 * 여기서 산출하는 4개 지표는 타입과 무관하게 모든 열에서 채워진다(docs/data-model.md §3.3).
 * @param {{ names: string[], columns: Array<Float64Array|string[]>, rowCount: number }} parsed
 * @param {Record<string, ColumnType>} [overrides] 사용자가 지정한 타입. 키는 열 이름
 * @returns {Array<{
 *   name: string, index: number, type: ColumnType, typeOverridden: boolean,
 *   missingCount: number, missingRate: number,
 *   invalidCount: number, invalidRate: number,
 *   uniqueCount: number, modeRate: number,
 *   evidence: { sampleValues: string[] }
 * }>}
 */
export function inferColumns(parsed, overrides) {
  return parsed.names.map((name, index) => {
    const column = parsed.columns[index];
    const override = overrides?.[name];
    // 수치 열이라도 비수치 타입으로 오버라이드되면 문자열 경로로 계산해야
    // invalid 판정이 오버라이드된 타입 기준으로 이뤄진다
    const values =
      column instanceof Float64Array && override && override !== 'numeric'
        ? Array.from(column, (v) => (Number.isNaN(v) ? '' : String(v)))
        : column;

    const base =
      values instanceof Float64Array
        ? inferNumeric(values, parsed.rowCount)
        : inferString(values, parsed.rowCount);

    const type = override ?? base.type;
    const invalidCount =
      type === base.type ? base.invalidCount : countInvalid(values, type);

    return {
      name,
      index,
      type,
      typeOverridden: override != null && override !== base.type,
      missingCount: base.missingCount,
      missingRate: rate(base.missingCount, parsed.rowCount),
      invalidCount,
      invalidRate: rate(invalidCount, parsed.rowCount),
      uniqueCount: base.uniqueCount,
      modeRate: base.modeRate,
      evidence: { sampleValues: base.sampleValues },
    };
  });
}

/**
 * 값 하나가 해당 타입으로 변환 가능한지 판정한다. invalidCount 산정에 쓰인다.
 * 빈 값은 결측이지 타입 불일치가 아니다 — 둘을 구분해야 한다(docs/data-model.md §3.3).
 * @param {string} value
 * @param {ColumnType} type
 * @returns {boolean}
 */
export function isValidFor(value, type) {
  const s = String(value).trim();
  if (s === '') return true; // 결측은 invalid 가 아니다
  switch (type) {
    case 'numeric':
      return toNumber(s) !== null;
    case 'datetime':
      return parseDate(s) !== null;
    case 'boolean':
      return BOOL_TOKENS.has(s.toLowerCase());
    default:
      return true; // categorical·id·text 는 어떤 문자열도 유효하다
  }
}

const ISO_DATE = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const KO_DATE = /^(\d{4})년\s*(\d{1,2})월(?:\s*(\d{1,2})일)?$/;

/**
 * 날짜 문자열을 파싱한다. 한국식 포맷(`YYYY년 M월 D일`, `YYYY.MM.DD`)을 포함한다.
 * @param {string} value
 * @returns {number|null} epoch ms, 실패 시 null
 */
export function parseDate(value) {
  const s = String(value).trim();
  const m = ISO_DATE.exec(s) ?? KO_DATE.exec(s);
  if (!m) return null;
  const [, y, mo, d = '1', h = '0', mi = '0', se = '0'] = m;
  if (+h > 23 || +mi > 59 || +se > 59) return null;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  const dt = new Date(ms);
  // 2023-02-31 처럼 넘치는 날짜는 Date 가 조용히 이월시키므로 성분을 역검증한다
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) {
    return null;
  }
  return ms;
}

// ─────────────────────────────────────────────────────────────
// 내부 구현
// ─────────────────────────────────────────────────────────────

function rate(count, total) {
  return total === 0 ? 0 : count / total;
}

/** Float64Array 열 — parse 단계에서 전량 수치 확인이 끝났으므로 invalid 는 0 이다. */
function inferNumeric(nums, rowCount) {
  const freq = new Map();
  let missingCount = 0;
  for (const v of nums) {
    if (Number.isNaN(v)) missingCount++;
    else freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  return {
    type: 'numeric',
    missingCount,
    invalidCount: 0,
    ...distribution(freq, rowCount - missingCount),
    sampleValues: [...freq.keys()].slice(0, SAMPLE_LIMIT).map(String),
  };
}

function inferString(raw, rowCount) {
  const freq = new Map();
  let missingCount = 0;
  let numericOk = 0;
  let dateOk = 0;
  let boolOk = 0;
  let totalLength = 0;
  let spacedCount = 0;

  for (const value of raw) {
    const s = value.trim();
    if (s === '') {
      missingCount++;
      continue;
    }
    freq.set(s, (freq.get(s) ?? 0) + 1);
    totalLength += s.length;
    // 선행 0 값은 수치 후보에서 제외한다 — 코드값이며 parse.js 도 같은 이유로 문자열을 유지한다
    if (!hasLeadingZero(s) && toNumber(s) !== null) numericOk++;
    if (parseDate(s) !== null) dateOk++;
    if (BOOL_TOKENS.has(s.toLowerCase())) boolOk++;
    if (/\s/.test(s)) spacedCount++;
  }

  const present = rowCount - missingCount;
  const dist = distribution(freq, present);
  const type =
    present === 0
      ? 'text'
      : pickType({ present, numericOk, dateOk, boolOk, totalLength, spacedCount, uniqueCount: dist.uniqueCount });

  let invalidCount = 0;
  if (type === 'numeric') invalidCount = present - numericOk;
  else if (type === 'datetime') invalidCount = present - dateOk;
  else if (type === 'boolean') invalidCount = present - boolOk;

  return {
    type,
    missingCount,
    invalidCount,
    ...dist,
    sampleValues: [...freq.keys()].slice(0, SAMPLE_LIMIT),
  };
}

/** 값 파싱 성공 비율(다수결) → 실패 시 고유값 비율·길이·공백으로 id/text/categorical 구분. */
function pickType({ present, numericOk, dateOk, boolOk, totalLength, spacedCount, uniqueCount }) {
  const majority = INFER.typeMajority;
  if (boolOk / present >= majority) return 'boolean';
  if (numericOk / present >= majority) return 'numeric';
  if (dateOk / present >= majority) return 'datetime';

  const uniqueRatio = uniqueCount / present;
  const avgLength = totalLength / present;
  if (uniqueRatio >= FINDING['F-ID-COL'].uniqueRatio) {
    // 식별자는 짧고 공백이 없다. 길이만 보면 "비고 3, 이상 없음" 같은 짧은 자유 텍스트가
    // 전부 고유하다는 이유로 id 로 잡히고 F-ID-COL 오탐을 낳는다
    const spacey = spacedCount / present > INFER.idMaxSpaceRatio;
    return !spacey && avgLength <= INFER.idMaxLength ? 'id' : 'text';
  }
  if (uniqueRatio >= INFER.textUniqueRatio && avgLength >= INFER.textAvgLength) return 'text';
  return 'categorical';
}

function distribution(freq, present) {
  let maxFreq = 0;
  for (const count of freq.values()) if (count > maxFreq) maxFreq = count;
  return {
    uniqueCount: freq.size,
    modeRate: present === 0 ? 0 : maxFreq / present, // 분모는 비결측 — 결측이 많아도 관측값의 상수성을 본다
  };
}

function countInvalid(values, type) {
  let invalid = 0;
  for (const value of values) {
    const s = typeof value === 'number' ? String(value) : value;
    if (s.trim() !== '' && !isValidFor(s, type)) invalid++;
  }
  return invalid;
}
