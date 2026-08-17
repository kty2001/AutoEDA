// tests/decode.test.js — domain/decode.js 동작 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, stripBom } from '../js/domain/decode.js';

const utf8 = (s) => new TextEncoder().encode(s).buffer;

test('UTF-8 텍스트를 감지한다', () => {
  const r = decode(utf8('이름,나이\n김,30'));
  assert.equal(r.encoding, 'utf-8');
  assert.equal(r.text, '이름,나이\n김,30');
});

test('EUC-KR(CP949) 텍스트를 폴백으로 감지한다', () => {
  // '이름' 의 EUC-KR 바이트열 — UTF-8 로는 유효하지 않다
  const bytes = Uint8Array.from([0xc0, 0xcc, 0xb8, 0xa7]);
  const r = decode(bytes.buffer);
  assert.equal(r.encoding, 'euc-kr');
  assert.equal(r.text, '이름');
});

test('BOM 을 제거한다', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a,b')]);
  const r = decode(bytes.buffer);
  assert.equal(r.text, 'a,b');
});

test('사용자 지정 인코딩은 감지를 건너뛴다', () => {
  const r = decode(utf8('abc'), 'euc-kr'); // ASCII 는 EUC-KR 로도 유효
  assert.equal(r.encoding, 'euc-kr');
});

test('둘 다 실패하면 ENCODING_UNDETECTED', () => {
  // 0xFF 0xFF 는 UTF-8·EUC-KR 어느 쪽으로도 유효하지 않은 바이트열이다
  const bytes = Uint8Array.from([0xff, 0xff]);
  assert.throws(() => decode(bytes.buffer), (err) => err.code === 'ENCODING_UNDETECTED');
});

test('stripBom — 본문을 손상시키지 않는다', () => {
  assert.equal(stripBom('﻿abc'), 'abc');
  assert.equal(stripBom('abc'), 'abc');
  assert.equal(stripBom('ab﻿c'), 'ab﻿c'); // 선행이 아니면 그대로
  assert.equal(stripBom(''), '');
});
