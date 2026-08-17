// tests/infer.test.js — domain/infer.js 동작 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferColumns, isValidFor, parseDate } from '../js/domain/infer.js';
import { parseCsv } from '../js/domain/parse.js';

/**
 * CSV 텍스트 → inferColumns 결과. 테스트 편의 헬퍼.
 * Worker 의 재계산 경로처럼, 비수치 타입으로 오버라이드된 열은 문자열로 유지해 파싱한다.
 */
const infer = (csv, overrides) => {
  const keepAsString = Object.entries(overrides ?? {})
    .filter(([, type]) => type !== 'numeric')
    .map(([name]) => name);
  return inferColumns(parseCsv(csv, { keepAsString }), overrides);
};

// ─── 타입 추론 ──────────────────────────────────────────────

test('수치 열 — Float64Array 경로', () => {
  const [col] = infer('v\n1\n2\n3');
  assert.equal(col.type, 'numeric');
  assert.equal(col.invalidCount, 0);
  assert.equal(col.uniqueCount, 3);
});

test('혼입 수치 열 — 90% 이상 수치면 numeric, 나머지는 invalid', () => {
  const rows = Array.from({ length: 19 }, (_, i) => String(i));
  const [col] = infer(`v\n${rows.join('\n')}\n미상`);
  assert.equal(col.type, 'numeric');
  assert.equal(col.invalidCount, 1);
  assert.equal(col.missingCount, 0);
});

test('불리언 열 — 0/1 은 불리언으로 잡지 않는다', () => {
  const [yn] = infer('f\nyes\nno\nyes');
  assert.equal(yn.type, 'boolean');
  const [zeroOne] = infer('f\n0\n1\n0');
  assert.equal(zeroOne.type, 'numeric');
});

test('날짜 열 — ISO·한국식 포맷', () => {
  const [col] = infer('d\n2023-01-05\n2023.02.10\n2023년 3월 1일');
  assert.equal(col.type, 'datetime');
});

test('범주형 열', () => {
  const [col] = infer('grade\nA\nB\nA\nC\nB\nA');
  assert.equal(col.type, 'categorical');
  assert.equal(col.uniqueCount, 3);
});

test('ID 열 — 전부 고유한 짧은 토큰', () => {
  const rows = Array.from({ length: 200 }, (_, i) => `USR-${i}`);
  const [col] = infer(`id\n${rows.join('\n')}`);
  assert.equal(col.type, 'id');
});

test('짧은 자유 텍스트는 전부 고유해도 id 가 아니다 (공백 신호)', () => {
  // "비고 3, 이상 없음" 처럼 짧고 고유한 문장이 id 로 잡히면 F-ID-COL 오탐이 난다
  const rows = Array.from({ length: 50 }, (_, i) => `"비고 ${i}, 이상 없음"`);
  const [col] = infer(`note\n${rows.join('\n')}`);
  assert.equal(col.type, 'text');
});

test('UUID 는 id 로 잡힌다 (길이 36)', () => {
  const rows = Array.from(
    { length: 50 },
    (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`
  );
  const [col] = infer(`uuid\n${rows.join('\n')}`);
  assert.equal(col.type, 'id');
});

test('선행 0 값은 수치로 추론하지 않는다 (코드값 보존)', () => {
  const [col] = infer('zip\n06236\n03187\n07995\n06236');
  assert.notEqual(col.type, 'numeric');
  assert.deepEqual(col.evidence.sampleValues.slice(0, 2), ['06236', '03187']);
});

test('텍스트 열 — 고유하고 긴 문자열', () => {
  const rows = Array.from(
    { length: 20 },
    (_, i) => `"이 상품은 배송이 빨랐고 포장 상태가 좋았으며 재구매 의사가 있습니다 후기 ${i}"`
  );
  const [col] = infer(`review\n${rows.join('\n')}`);
  assert.equal(col.type, 'text');
});

// ─── 공통 지표 ──────────────────────────────────────────────

test('결측과 타입 불일치를 구분한다 (data-model.md §3.3)', () => {
  const nums = Array.from({ length: 19 }, (_, i) => String(20 + i));
  const [col] = infer(`age\n${nums.join('\n')}\n\n미상`); // 수치 19 + 결측 1 + '미상' 1
  assert.equal(col.type, 'numeric'); // 비결측 20개 중 19개(95%)가 수치
  assert.equal(col.missingCount, 1); // 빈 값
  assert.equal(col.invalidCount, 1); // '미상'
});

test('modeRate — 비결측 기준 최빈값 비율. 준상수를 잡는다', () => {
  const rows = [...Array(19).fill('ok'), 'fail'];
  const [col] = infer(`status\n${rows.join('\n')}`);
  assert.equal(col.modeRate, 0.95);
});

test('추론 근거 — 표본 값을 노출한다 (UC-02 규칙)', () => {
  const [col] = infer('grade\nA\nB\nC');
  assert.deepEqual(col.evidence.sampleValues, ['A', 'B', 'C']);
});

test('전결측 열 — 지표는 0, 통계 없는 text 타입', () => {
  const [col] = infer('empty,other\n,1\n,2');
  assert.equal(col.type, 'text');
  assert.equal(col.missingRate, 1);
  assert.equal(col.uniqueCount, 0);
  assert.equal(col.modeRate, 0);
});

// ─── 오버라이드 (UC-02 대안 흐름) ───────────────────────────

test('오버라이드 — 수치로 잡힌 코드값을 범주형으로 바꾼다', () => {
  // 선행 0 이 없는 코드값(부서코드 등)은 수치로 잡히므로 오버라이드 경로가 필요하다
  const [col] = infer('dept\n11\n22\n11\n33', { dept: 'categorical' });
  assert.equal(col.type, 'categorical');
  assert.equal(col.typeOverridden, true);
  assert.equal(col.invalidCount, 0); // 범주형에는 모든 문자열이 유효
  assert.deepEqual(col.evidence.sampleValues, ['11', '22', '33']);
});

test('오버라이드 — 추론과 같은 타입이면 typeOverridden 은 false', () => {
  const [col] = infer('v\n1\n2', { v: 'numeric' });
  assert.equal(col.typeOverridden, false);
});

// ─── isValidFor · parseDate ────────────────────────────────

test('isValidFor — 빈 값은 어떤 타입에도 invalid 가 아니다', () => {
  assert.equal(isValidFor('', 'numeric'), true);
  assert.equal(isValidFor('  ', 'datetime'), true);
});

test('isValidFor — 타입별 판정', () => {
  assert.equal(isValidFor('3.5', 'numeric'), true);
  assert.equal(isValidFor('미상', 'numeric'), false);
  assert.equal(isValidFor('2023-01-05', 'datetime'), true);
  assert.equal(isValidFor('어제', 'datetime'), false);
  assert.equal(isValidFor('YES', 'boolean'), true);
  assert.equal(isValidFor('2', 'boolean'), false);
  assert.equal(isValidFor('아무거나', 'text'), true);
});

test('parseDate — 지원 포맷', () => {
  assert.equal(parseDate('2023-01-05'), Date.UTC(2023, 0, 5));
  assert.equal(parseDate('2023/1/5'), Date.UTC(2023, 0, 5));
  assert.equal(parseDate('2023.01.05'), Date.UTC(2023, 0, 5));
  assert.equal(parseDate('2023년 1월 5일'), Date.UTC(2023, 0, 5));
  assert.equal(parseDate('2023년 1월'), Date.UTC(2023, 0, 1));
  assert.equal(parseDate('2023-01-05 09:30'), Date.UTC(2023, 0, 5, 9, 30));
  assert.equal(parseDate('2023-01-05T09:30:15'), Date.UTC(2023, 0, 5, 9, 30, 15));
});

test('parseDate — 넘치는 날짜·시각은 거부한다', () => {
  assert.equal(parseDate('2023-02-31'), null);
  assert.equal(parseDate('2023-13-01'), null);
  assert.equal(parseDate('2023-01-05 25:00'), null);
  assert.equal(parseDate('123'), null);
});
