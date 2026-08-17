// lib/format.js — 표시용 포맷 (순수: DOM·IO 참조 없음, 의존성 0)
// 여러 화면과 Finding 문구가 같은 수치를 다르게 적으면 신뢰를 잃으므로 표기를 한 곳에 모은다.

/** 계산 불가·비유한 값의 공통 표기. */
const NOT_AVAILABLE = '—';

/**
 * 비율 → 백분율 문자열. Finding 문구와 화면 표기가 같은 함수를 쓴다.
 * @param {number} ratio 0~1
 * @param {number} [digits] 소수 자릿수. 기본 1
 * @returns {string} 예: "32.1%"
 */
export function percent(ratio, digits) {
  if (!Number.isFinite(ratio)) return NOT_AVAILABLE;
  return `${(ratio * 100).toFixed(digits ?? 1)}%`;
}

/**
 * 큰 수 천단위 구분.
 * @param {number} value
 * @returns {string}
 */
export function count(value) {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  return value.toLocaleString('ko-KR');
}

/**
 * 통계값 표기. 유효숫자를 제한해 과도한 정밀도로 오해를 주지 않는다.
 * @param {number} value
 * @returns {string} 유효숫자 4자리
 */
export function stat(value) {
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  if (value === 0) return '0';
  return String(Number(value.toPrecision(4)));
}

/**
 * 수치 뒤에 붙는 `으로/로` 를 받침에 맞게 고른다.
 * 한국어 리포트(차별화 축 5)에서 "왜도가 3로", "VIF가 6126로" 같은 표기를 막는다.
 * 판정은 숫자를 읽었을 때 마지막 음절의 받침 — 영·삼·육(0·3·6)만 `으로` 이고,
 * ㄹ 받침(일·칠·팔)과 무받침(이·사·오·구)은 `로` 다.
 *
 * ⚠️ 단위 기호가 붙은 표기에는 쓰지 않는다. `percent()` 결과는 "퍼센트"로 읽히므로
 *    숫자와 무관하게 항상 `로` 이고(100.0% → "백 퍼센트로"), `bytes()` 도 마찬가지다.
 *    대상은 stat()·count() 처럼 숫자로 끝나는 표기뿐이다.
 * @param {number|string} value stat()·count() 를 거친 표기여도 된다
 * @returns {'로'|'으로'}
 */
export function ro(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits === '') return '로';
  return '036'.includes(digits.slice(-1)) ? '으로' : '로';
}

/**
 * 바이트 → 사람이 읽는 크기.
 * @param {number} bytes
 * @returns {string} 예: "1.2 MB"
 */
export function bytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return NOT_AVAILABLE;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes;
  let unit = 'B';
  for (const u of units) {
    if (v < 1024) break;
    v /= 1024;
    unit = u;
  }
  return `${v.toFixed(1)} ${unit}`;
}
