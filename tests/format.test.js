// tests/format.test.js — lib/format.js 동작 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percent, count, stat, bytes, ro } from '../js/lib/format.js';

test('percent — 기본 소수 1자리', () => {
  assert.equal(percent(0.321), '32.1%');
  assert.equal(percent(0.05), '5.0%');
  assert.equal(percent(1), '100.0%');
  assert.equal(percent(0.1234, 2), '12.34%');
});

test('count — 천단위 구분', () => {
  assert.equal(count(1234567), '1,234,567');
  assert.equal(count(0), '0');
});

test('stat — 유효숫자 4자리', () => {
  assert.equal(stat(3.14159), '3.142');
  assert.equal(stat(12345.678), '12350');
  assert.equal(stat(0.000123456), '0.0001235');
  assert.equal(stat(0), '0');
  assert.equal(stat(-2.5), '-2.5');
});

test('bytes — 단위 승급', () => {
  assert.equal(bytes(512), '512 B');
  assert.equal(bytes(2048), '2.0 KB');
  assert.equal(bytes(1258291), '1.2 MB');
  assert.equal(bytes(3 * 1024 ** 3), '3.0 GB');
});

test('ro — 숫자 읽기의 받침으로 으로/로 결정', () => {
  // 받침 있음: 영(0)·삼(3)·육(6)
  assert.equal(ro(3), '으로');
  assert.equal(ro(6126), '으로');
  assert.equal(ro(100), '으로');
  // ㄹ 받침(일·칠·팔)과 무받침(이·사·오·구)
  assert.equal(ro(1), '로');
  assert.equal(ro(2.5), '로');
  assert.equal(ro(7), '로');
  assert.equal(ro(-9), '로');
  assert.equal(ro('12.34'), '로');
  assert.equal(ro('—'), '로'); // 숫자가 없으면 안전한 쪽
});

test('비유한 값은 — 로 표기', () => {
  assert.equal(percent(NaN), '—');
  assert.equal(count(Infinity), '—');
  assert.equal(stat(NaN), '—');
  assert.equal(bytes(-1), '—');
});
