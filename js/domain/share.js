// domain/share.js — 결과 요약 공유 링크 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 작업: docs/TODO.md T8 (개선 제안 후보 S1)
//
// 원본 데이터·전체 통계는 담지 않는다. Health Score 총점·등급과 상위 발견 최대 3건의
// what 문장만 추려 URL 파라미터에 담는다. result.schemaVersion 과 독립된 버전(v)을 쓴다 —
// 결과 스키마가 바뀌어도 이미 공유된 링크의 해석이 흔들리면 안 된다. → docs/data-model.md §3.8
//
// ⚠️ decodeShareSummary 의 입력은 남이 만든 URL 이다(신뢰할 수 없음). 모든 필드를
//    화이트리스트로 검증한다 — grade·severity 는 그대로 CSS 클래스명으로 쓰이므로
//    (js/app/analyze.page.js 의 gradeClass) 검증 없이 통과시키면 안 된다.

const SHARE_VERSION = 1;
const MAX_FINDINGS = 3;
const MAX_ENCODED_LENGTH = 1500; // 이 안에 들도록 findings 를 줄여 재시도한다
const MAX_DECODE_LENGTH = 4000; // 넘으면 디코딩 자체를 시도하지 않는다(긴 문자열 방지)
const MAX_WHAT_LENGTH = 120; // 우리 인코더가 잘라내는 기준
const MAX_WHAT_DISPLAY = 200; // 디코딩한 값에 무조건 적용하는 안전 상한(출처 무관)

const GRADES = new Set(['good', 'fair', 'poor']);
const SEVERITIES = new Set(['high', 'medium', 'low']);

/**
 * 결과 JSON에서 공유용 요약을 추린다. why·how·metrics·targets 는 담지 않는다.
 * @param {{ health: { total: number, grade: string }, findings: Array<object> }} result
 * @returns {{ v: number, h: { t: number, g: string }, f: Array<{ t: string, s: string, w: string }> }}
 */
export function buildShareSummary(result) {
  const top = result.findings
    .filter((f) => !f.collapsed)
    .slice(0, MAX_FINDINGS)
    .map((f) => ({ t: f.type, s: f.severity, w: f.what }));
  return {
    v: SHARE_VERSION,
    h: { t: Math.round(result.health.total), g: result.health.grade },
    f: top,
  };
}

/** UTF-8 문자열 → base64url. 표준 base64 의 `+/=` 를 URL 안전 문자로 바꾼다. */
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → UTF-8 문자열. 표준 base64 로 되돌린 뒤 디코딩한다. */
function fromBase64Url(encoded) {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 요약을 URL에 넣을 문자열로 인코딩한다. 길이가 상한을 넘으면 findings 를 뒤에서부터
 * 줄여 재시도하고, 0건까지 줄여도 넘으면(비정상적으로 긴 what) 문장을 잘라낸다.
 * @param {object} summary buildShareSummary() 의 결과
 * @returns {string}
 */
export function encodeShareSummary(summary) {
  for (let n = summary.f.length; n >= 0; n--) {
    const encoded = toBase64Url(JSON.stringify({ ...summary, f: summary.f.slice(0, n) }));
    if (encoded.length <= MAX_ENCODED_LENGTH) return encoded;
  }
  const trimmed = { ...summary, f: summary.f.map((f) => ({ ...f, w: truncate(f.w, MAX_WHAT_LENGTH) })) };
  return toBase64Url(JSON.stringify(trimmed));
}

/**
 * URL 파라미터를 요약 객체로 되돌린다. 남이 만든 값일 수 있으므로 모든 필드를
 * 화이트리스트로 검증한다. 핵심 정보(health)가 어긋나면 전체를 무효로 하고,
 * 개별 finding 항목이 어긋나면 그 항목만 제외한다.
 * @param {string} encoded
 * @returns {{ v: number, h: { t: number, g: string }, f: Array<{ t: string, s: string, w: string }> }|null}
 */
export function decodeShareSummary(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_DECODE_LENGTH) return null;

  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  if (parsed?.v !== SHARE_VERSION) return null;
  if (!parsed.h || !GRADES.has(parsed.h.g) || !Number.isFinite(parsed.h.t)) return null;
  if (!Array.isArray(parsed.f)) return null;

  const total = Math.min(100, Math.max(0, Math.round(parsed.h.t)));
  const findings = parsed.f
    .filter((f) => f && typeof f.t === 'string' && SEVERITIES.has(f.s) && typeof f.w === 'string')
    .slice(0, MAX_FINDINGS)
    .map((f) => ({ t: f.t, s: f.s, w: truncate(f.w, MAX_WHAT_DISPLAY) }));

  return { v: SHARE_VERSION, h: { t: total, g: parsed.h.g }, f: findings };
}
