// tests/share.test.js — domain/share.js 동작 테스트 (docs/TODO.md T8)
//
// decodeShareSummary 의 입력은 남이 만든 URL 이라는 점이 핵심이다 — 정상 왕복뿐 아니라
// 변조·손상된 입력이 예외를 던지지 않고 null 을 반환하는지, enum 이 아닌 값이
// CSS 클래스명 등으로 그대로 새지 않는지를 함께 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShareSummary, encodeShareSummary, decodeShareSummary } from '../js/domain/share.js';

const finding = (type, severity, what, collapsed) => ({
  type,
  severity,
  what,
  why: '이유 문장',
  how: '조치 문장',
  targets: [],
  metrics: {},
  mlRelevant: false,
  ...(collapsed ? { collapsed: true } : {}),
});

const result = (overrides = {}) => ({
  health: { total: 78.4, grade: 'fair' },
  findings: [
    finding('F-MULTICOLLINEAR', 'high', 'age 열과 income 열의 상관이 0.91입니다.'),
    finding('F-DUP-ROW', 'medium', '완전히 동일한 행이 12건(2.4%) 있습니다.'),
    finding('F-SKEW', 'medium', 'price 열의 왜도가 3.1로 분포가 한쪽으로 치우쳐 있습니다.'),
    finding('F-KURTOSIS', 'low', 'price 열의 초과첨도가 5.2로 꼬리가 두껍습니다.'),
  ],
  ...overrides,
});

// ─── buildShareSummary ────────────────────────────────────────

test('buildShareSummary — 총점을 반올림하고 상위 3건만 담는다', () => {
  const summary = buildShareSummary(result());
  assert.deepEqual(summary.h, { t: 78, g: 'fair' });
  assert.equal(summary.f.length, 3);
  assert.deepEqual(
    summary.f.map((f) => f.t),
    ['F-MULTICOLLINEAR', 'F-DUP-ROW', 'F-SKEW']
  );
});

test('buildShareSummary — why·how·metrics·targets 는 담지 않는다', () => {
  const summary = buildShareSummary(result());
  for (const f of summary.f) {
    assert.deepEqual(Object.keys(f).sort(), ['s', 't', 'w']);
  }
});

test('buildShareSummary — collapsed 묶음 항목은 제외한다', () => {
  const summary = buildShareSummary(
    result({ findings: [finding('F-CONST-COL', 'high', '대표 발견'), finding('F-CONST-COL', 'high', '묶음', true)] })
  );
  assert.equal(summary.f.length, 1);
  assert.equal(summary.f[0].w, '대표 발견');
});

test('buildShareSummary — 발견이 없으면 빈 배열', () => {
  const summary = buildShareSummary(result({ findings: [] }));
  assert.deepEqual(summary.f, []);
});

// ─── 인코딩/디코딩 왕복 ─────────────────────────────────────────

test('encode → decode 왕복이 원래 요약과 일치한다', () => {
  const summary = buildShareSummary(result());
  const decoded = decodeShareSummary(encodeShareSummary(summary));
  assert.deepEqual(decoded, summary);
});

test('발견이 0건이어도 왕복한다', () => {
  const summary = buildShareSummary(result({ findings: [] }));
  const decoded = decodeShareSummary(encodeShareSummary(summary));
  assert.deepEqual(decoded, summary);
});

test('한글·특수문자가 포함된 what 문장도 왕복한다', () => {
  const summary = buildShareSummary(
    result({ findings: [finding('F-MISSING-HIGH', 'high', '한글 열 이름 & "따옴표" <태그> 결측 32.1%')] })
  );
  const decoded = decodeShareSummary(encodeShareSummary(summary));
  assert.equal(decoded.f[0].w, '한글 열 이름 & "따옴표" <태그> 결측 32.1%');
});

// ─── 길이 축소 ─────────────────────────────────────────────────

test('what 문장이 길어 인코딩 결과가 상한을 넘으면 findings 를 줄여 재시도한다', () => {
  const longWhat = '매우 '.repeat(400) + '긴 발견 문장입니다.';
  const summary = buildShareSummary(
    result({
      findings: [
        finding('F-A', 'high', longWhat),
        finding('F-B', 'high', longWhat),
        finding('F-C', 'high', longWhat),
      ],
    })
  );
  const encoded = encodeShareSummary(summary);
  assert.ok(encoded.length <= 1500, `인코딩 길이 ${encoded.length} 가 상한을 넘음`);
  const decoded = decodeShareSummary(encoded);
  assert.ok(decoded.f.length < 3, 'findings 가 줄어들어야 함');
});

// ─── decodeShareSummary — 변조·손상된 입력 ──────────────────────

test('버전이 다르면 무효', () => {
  const bogus = Buffer.from(JSON.stringify({ v: 2, h: { t: 50, g: 'good' }, f: [] })).toString('base64url');
  assert.equal(decodeShareSummary(bogus), null);
});

test('grade 가 화이트리스트 밖이면 전체가 무효', () => {
  const bogus = Buffer.from(
    JSON.stringify({ v: 1, h: { t: 50, g: '<script>' }, f: [] })
  ).toString('base64url');
  assert.equal(decodeShareSummary(bogus), null);
});

test('개별 finding 의 severity 가 화이트리스트 밖이면 그 항목만 제외한다', () => {
  const bogus = Buffer.from(
    JSON.stringify({
      v: 1,
      h: { t: 50, g: 'good' },
      f: [
        { t: 'F-A', s: 'high', w: '정상' },
        { t: 'F-B', s: 'onclick=alert(1)', w: '위조' },
      ],
    })
  ).toString('base64url');
  const decoded = decodeShareSummary(bogus);
  assert.deepEqual(decoded.f, [{ t: 'F-A', s: 'high', w: '정상' }]);
});

test('findings 가 3건을 넘게 조작돼 있어도 3건까지만 취한다', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ t: `F-${i}`, s: 'low', w: `${i}` }));
  const bogus = Buffer.from(JSON.stringify({ v: 1, h: { t: 50, g: 'good' }, f: many })).toString('base64url');
  assert.equal(decodeShareSummary(bogus).f.length, 3);
});

test('total 이 0~100 밖이어도 clamp 한다', () => {
  const bogus = Buffer.from(JSON.stringify({ v: 1, h: { t: 999, g: 'good' }, f: [] })).toString('base64url');
  assert.equal(decodeShareSummary(bogus).h.t, 100);
});

test('JSON 이 아닌 문자열·빈 문자열·너무 긴 문자열은 예외 없이 null', () => {
  assert.equal(decodeShareSummary(''), null);
  assert.equal(decodeShareSummary('not-valid-base64!!'), null);
  assert.equal(decodeShareSummary('a'.repeat(5000)), null);
  assert.equal(decodeShareSummary(null), null);
  assert.equal(decodeShareSummary(undefined), null);
});

test('health 객체 자체가 없으면 무효', () => {
  const bogus = Buffer.from(JSON.stringify({ v: 1, f: [] })).toString('base64url');
  assert.equal(decodeShareSummary(bogus), null);
});
