// tests/parse.test.js — domain/parse.js 동작 테스트
// RFC 4180 엣지케이스를 직접 책임지는 영역이므로 두텁게 쓴다 (parse.js 헤더 방침).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, parseCsv, toNumber } from '../js/domain/parse.js';

// ─── detectDelimiter ────────────────────────────────────────

test('구분자 감지 — 쉼표·세미콜론·탭·파이프', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(detectDelimiter('a|b|c\n1|2|3'), '|');
});

test('구분자 감지 — 인용 내부의 다른 구분자에 속지 않는다', () => {
  assert.equal(detectDelimiter('name;note\n"kim";"a,b,c,d"\n"lee";"x,y"'), ';');
});

// ─── parseCsv 기본 ──────────────────────────────────────────

test('기본 파싱 — 이름·행 수·열 수', () => {
  const r = parseCsv('name,age\nkim,30\nlee,25\n');
  assert.deepEqual(r.names, ['name', 'age']);
  assert.equal(r.rowCount, 2);
  assert.equal(r.columns.length, 2);
});

test('수치로 보이는 열은 Float64Array, 그 외는 문자열 배열', () => {
  const r = parseCsv('name,age\nkim,30\nlee,25');
  assert.ok(Array.isArray(r.columns[0]));
  assert.ok(r.columns[1] instanceof Float64Array);
  assert.deepEqual([...r.columns[1]], [30, 25]);
});

test('수치 열의 결측은 NaN', () => {
  const r = parseCsv('v\n1\n\n3');
  assert.ok(r.columns[0] instanceof Float64Array);
  assert.ok(Number.isNaN(r.columns[0][1]));
});

test('비수치 값이 섞이면 문자열 열로 남는다', () => {
  const r = parseCsv('age\n30\n미상\n25');
  assert.ok(Array.isArray(r.columns[0]));
});

test('선행 0 이 있는 열은 문자열로 유지한다 (우편번호 등 코드값)', () => {
  const r = parseCsv('zip\n06236\n03187');
  assert.ok(Array.isArray(r.columns[0]));
  assert.deepEqual(r.columns[0], ['06236', '03187']); // "6236" 으로 뭉개지면 안 됨
});

test('0 과 0.5 는 선행 0 이 아니다 — 수치 열로 남는다', () => {
  const r = parseCsv('v\n0\n0.5\n1.25');
  assert.ok(r.columns[0] instanceof Float64Array);
});

// ─── RFC 4180 엣지케이스 ────────────────────────────────────

test('인용부호로 감싼 필드와 "" 이스케이프', () => {
  const r = parseCsv('a,b\n"x, y","say ""hi"""');
  assert.equal(r.columns[0][0], 'x, y');
  assert.equal(r.columns[1][0], 'say "hi"');
});

test('인용 내부의 개행', () => {
  const r = parseCsv('a,b\n"line1\nline2",v');
  assert.equal(r.rowCount, 1);
  assert.equal(r.columns[0][0], 'line1\nline2');
});

test('CRLF/LF 혼재', () => {
  const r = parseCsv('a,b\r\n1,2\n3,4\r\n');
  assert.equal(r.rowCount, 2);
});

test('마지막 줄 개행 없음', () => {
  const r = parseCsv('a,b\n1,2');
  assert.equal(r.rowCount, 1);
});

test('빈 필드는 빈 문자열', () => {
  const r = parseCsv('a,b,c\n1,,x');
  assert.equal(r.columns[1][0], '');
});

test('파일 끝의 빈 줄은 데이터로 세지 않는다', () => {
  const r = parseCsv('a,b\n1,2\n\n');
  assert.equal(r.rowCount, 1);
});

// ─── 헤더 처리 ──────────────────────────────────────────────

test('동명 열은 name, name_2 로 구분한다 (data-model.md §3.3)', () => {
  const r = parseCsv('x,x,x\n1,2,3');
  assert.deepEqual(r.names, ['x', 'x_2', 'x_3']);
});

test('빈 헤더는 col_N 으로 채운다', () => {
  const r = parseCsv('a,,c\n1,2,3');
  assert.deepEqual(r.names, ['a', 'col_2', 'c']);
});

// ─── 오류 경로 ──────────────────────────────────────────────

test('필드 수 불일치 — PARSE_FAILED 와 문제 행 위치', () => {
  assert.throws(
    () => parseCsv('a,b\n1,2\n1,2,3\n4,5'),
    (err) => err.code === 'PARSE_FAILED' && err.detail.line === 3
  );
});

test('빈 파일 — PARSE_FAILED', () => {
  assert.throws(() => parseCsv(''), (err) => err.code === 'PARSE_FAILED');
});

// ─── toNumber ───────────────────────────────────────────────

test('toNumber — 일반·부호·지수·천단위', () => {
  assert.equal(toNumber('42'), 42);
  assert.equal(toNumber('-3.5'), -3.5);
  assert.equal(toNumber('1e3'), 1000);
  assert.equal(toNumber('1,234,567.5'), 1234567.5);
  assert.equal(toNumber(' 7 '), 7);
});

test('toNumber — 거부', () => {
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('미상'), null);
  assert.equal(toNumber('12,34'), null); // 천단위 패턴이 아님
  assert.equal(toNumber('1.2.3'), null);
  assert.equal(toNumber('NaN'), null);
  assert.equal(toNumber('Infinity'), null);
});
