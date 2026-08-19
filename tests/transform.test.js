// tests/transform.test.js — domain/transform.js 동작 테스트
// 대응 작업: docs/TODO.md T7 1단계
//
// 이 파일이 고정하는 두 가지 불변식:
//  1. 입력 배열을 변형하지 않는다 — Worker 가 원본 parsed 를 붙들고 레시피를 바꿔 가며
//     반복 적용하므로, 한 번이라도 제자리 수정하면 이후 적용이 전부 오염된다
//  2. 삽입 순서와 무관하게 STEP_ORDER 로 적용된다 — 대치 전 스케일링 같은 조합을 막는다

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRecipe, STEP_ORDER } from '../js/domain/transform.js';
import { PREPROCESS, OUTLIER } from '../js/domain/thresholds.js';

const F = (arr) => Float64Array.from(arr);

/** 수치 열 v(0~9 + 이상치 + 결측), 범주 열 g, 상수 열 c 를 가진 픽스처. */
function fixture() {
  return {
    names: ['v', 'g', 'c'],
    columns: [F([...Array(10).keys(), 1000, NaN]), ['가', '나', '가', '나', '가', '나', '가', '나', '가', '나', '가', ''], Array(12).fill('7')],
    rowCount: 12,
  };
}

const COLUMNS = [
  { name: 'v', type: 'numeric' },
  { name: 'g', type: 'categorical' },
  { name: 'c', type: 'categorical' },
];

const col = (out, name) => out.columns[out.names.indexOf(name)];

// ─── 불변식 ─────────────────────────────────────────────────

test('입력 parsed 를 변형하지 않는다 (반복 적용의 전제)', () => {
  const parsed = fixture();
  const snapshot = JSON.stringify([parsed.names, parsed.columns.map((c) => Array.from(c)), parsed.rowCount]);

  applyRecipe(parsed, COLUMNS, [
    { op: 'impute', column: 'v', method: 'median' },
    { op: 'outlier', column: 'v', action: 'drop-rows' },
    { op: 'drop-column', column: 'c' },
  ]);

  assert.equal(
    JSON.stringify([parsed.names, parsed.columns.map((c) => Array.from(c)), parsed.rowCount]),
    snapshot,
    '원본이 제자리에서 수정됐다'
  );
});

test('삽입 순서와 무관하게 STEP_ORDER 로 적용된다', () => {
  const parsed = fixture();
  // 스케일링을 먼저 적어도 대치가 앞선다 — 그렇지 않으면 결측이 남은 채 표준화된다
  const out = applyRecipe(parsed, COLUMNS, [
    { op: 'scale', column: 'v', method: 'standard' },
    { op: 'impute', column: 'v', method: 'constant', value: 0 },
  ]);
  assert.deepEqual(out.log.map((l) => l.op), ['impute', 'scale']);
  assert.ok(!Array.from(col(out, 'v')).some(Number.isNaN), '대치가 스케일링보다 먼저여야 결측이 남지 않는다');
});

test('STEP_ORDER 는 7종을 정의한다', () => {
  assert.deepEqual([...STEP_ORDER], [
    'drop-duplicates', 'drop-column', 'impute', 'outlier', 'log1p', 'encode', 'scale',
  ]);
});

// ─── 연산별 ─────────────────────────────────────────────────

test('drop-duplicates — 첫 등장만 남기고 제거 수를 log 에 남긴다', () => {
  const parsed = { names: ['a', 'b'], columns: [F([1, 1, 2]), ['x', 'x', 'y']], rowCount: 3 };
  const out = applyRecipe(parsed, null, [{ op: 'drop-duplicates' }]);
  assert.equal(out.rowCount, 2);
  assert.equal(out.log[0].params.removedRows, 1);
});

test('drop-duplicates — 필드 경계를 넘어 값이 붙지 않는다', () => {
  // ["a b","c"] 와 ["a","b c"] 는 다른 행이다. 구분자를 공백으로 이으면 같은 키가 된다
  const parsed = { names: ['x', 'y'], columns: [['a b', 'a'], ['c', 'b c']], rowCount: 2 };
  const out = applyRecipe(parsed, null, [{ op: 'drop-duplicates' }]);
  assert.equal(out.rowCount, 2);
});

test('drop-column — 열과 이름이 함께 사라진다', () => {
  const out = applyRecipe(fixture(), COLUMNS, [{ op: 'drop-column', column: 'c' }]);
  assert.deepEqual(out.names, ['v', 'g']);
  assert.equal(out.columns.length, 2);
});

test('impute — 수치는 중위수, 범주는 최빈값이 기본이며 대치값을 log 에 남긴다', () => {
  const out = applyRecipe(fixture(), COLUMNS, [
    { op: 'impute', column: 'v' },
    { op: 'impute', column: 'g' },
  ]);
  const v = out.log.find((l) => l.column === 'v');
  assert.equal(v.params.method, 'median');
  assert.equal(v.params.filled, 1);
  assert.equal(col(out, 'v')[11], v.params.fill);

  const g = out.log.find((l) => l.column === 'g');
  assert.equal(g.params.method, 'mode');
  assert.equal(g.params.fill, '가');
  assert.equal(col(out, 'g')[11], '가');
});

test('impute — constant 는 값이 전부 결측이어도 채운다', () => {
  const parsed = { names: ['a'], columns: [F([NaN, NaN])], rowCount: 2 };
  const out = applyRecipe(parsed, null, [{ op: 'impute', column: 'a', method: 'constant', value: 3 }]);
  assert.deepEqual(Array.from(col(out, 'a')), [3, 3]);

  const none = applyRecipe(parsed, null, [{ op: 'impute', column: 'a', method: 'median' }]);
  assert.ok(none.log[0].note, '대치 불가 사유가 남아야 한다');
});

test('outlier — clip 은 IQR 경계로 조정하고 판정과 같은 계수를 쓴다', () => {
  const out = applyRecipe(fixture(), COLUMNS, [{ op: 'outlier', column: 'v', action: 'clip' }]);
  const { lowerBound, upperBound, multiplier, affected } = out.log[0].params;
  assert.equal(multiplier, OUTLIER.iqrMultiplier);
  assert.equal(affected, 1);
  assert.equal(col(out, 'v')[10], upperBound, '1000 이 상한으로 눌려야 한다');
  assert.ok(Array.from(col(out, 'v')).every((x) => Number.isNaN(x) || (x >= lowerBound && x <= upperBound)));
  assert.equal(out.rowCount, 12, 'clip 은 행을 지우지 않는다');
});

test('outlier — drop-rows 는 행을 지우되 결측 행은 남긴다', () => {
  const out = applyRecipe(fixture(), COLUMNS, [{ op: 'outlier', column: 'v', action: 'drop-rows' }]);
  assert.equal(out.log[0].params.removedRows, 1);
  assert.equal(out.rowCount, 11);
  assert.equal(col(out, 'g').length, 11, '다른 열도 같은 길이로 줄어야 한다');
  assert.ok(Array.from(col(out, 'v')).some(Number.isNaN), '결측 행까지 지우지 않는다');
});

test('log1p — 변환하고, −1 이하 값이 있으면 거부한다', () => {
  const ok = applyRecipe({ names: ['a'], columns: [F([0, 1, 3])], rowCount: 3 }, null, [
    { op: 'log1p', column: 'a' },
  ]);
  assert.deepEqual(Array.from(col(ok, 'a')), [0, Math.log(2), Math.log(4)]);

  const bad = applyRecipe({ names: ['a'], columns: [F([-1, 2])], rowCount: 2 }, null, [
    { op: 'log1p', column: 'a' },
  ]);
  assert.ok(bad.log[0].note);
  assert.deepEqual(Array.from(col(bad, 'a')), [-1, 2], '거부되면 값이 그대로여야 한다');
});

test('encode — onehot 은 정렬된 고유값만큼 열을 만들고 원래 열을 대체한다', () => {
  const out = applyRecipe(fixture(), COLUMNS, [{ op: 'encode', column: 'g', method: 'onehot' }]);
  assert.deepEqual(out.names, ['v', 'g=가', 'g=나', 'c']);
  assert.deepEqual(Array.from(col(out, 'g=가')).slice(0, 4), [1, 0, 1, 0]);
  assert.deepEqual(out.log[0].params.levels, ['가', '나']);
});

test('encode — onehot 은 고유값 상한을 넘으면 적용하지 않는다', () => {
  const n = PREPROCESS.onehotMaxUnique + 1;
  const parsed = { names: ['g'], columns: [Array.from({ length: n }, (_, i) => `v${i}`)], rowCount: n };
  const out = applyRecipe(parsed, null, [{ op: 'encode', column: 'g', method: 'onehot' }]);
  assert.deepEqual(out.names, ['g'], '열이 늘어나면 안 된다');
  assert.ok(out.log[0].note.includes(String(PREPROCESS.onehotMaxUnique)));
});

test('encode — ordinal·frequency 는 수치 열로 바꾸고 사전을 log 에 남긴다', () => {
  const ord = applyRecipe(fixture(), COLUMNS, [{ op: 'encode', column: 'g', method: 'ordinal' }]);
  assert.deepEqual(ord.log[0].params.mapping, { 가: 0, 나: 1 });
  assert.ok(Number.isNaN(col(ord, 'g')[11]), '결측은 결측으로 남는다');

  const freq = applyRecipe(fixture(), COLUMNS, [{ op: 'encode', column: 'g', method: 'frequency' }]);
  assert.deepEqual(freq.log[0].params.mapping, { 가: 6, 나: 5 });
});

test('scale — 방식별 center·spread 를 log 에 남기고 폭 0 은 0 으로 둔다', () => {
  const std = applyRecipe(fixture(), COLUMNS, [{ op: 'scale', column: 'v', method: 'standard' }]);
  assert.equal(std.log[0].params.method, 'standard');
  assert.ok(std.log[0].params.spread > 0);

  const mm = applyRecipe({ names: ['a'], columns: [F([0, 5, 10])], rowCount: 3 }, null, [
    { op: 'scale', column: 'a', method: 'minmax' },
  ]);
  assert.deepEqual(Array.from(col(mm, 'a')), [0, 0.5, 1]);

  const flat = applyRecipe({ names: ['a'], columns: [F([2, 2, 2])], rowCount: 3 }, null, [
    { op: 'scale', column: 'a', method: 'standard' },
  ]);
  assert.deepEqual(Array.from(col(flat, 'a')), [0, 0, 0]);
  assert.ok(flat.log[0].note);
});

// ─── 조용히 실패하지 않는다 ──────────────────────────────────

test('사라진 열·알 수 없는 조치는 이유를 남기고 건너뛴다', () => {
  const out = applyRecipe(fixture(), COLUMNS, [
    { op: 'drop-column', column: 'c' },
    { op: 'scale', column: 'c' }, // 앞 단계에서 사라짐
    { op: 'nonsense', column: 'v' },
  ]);
  const skipped = out.log.filter((l) => l.note);
  assert.equal(skipped.length, 2);
  assert.ok(skipped.every((l) => typeof l.note === 'string' && l.note.length > 0));
});

test('수치형이 아닌 열의 수치 전용 조치는 건너뛴다', () => {
  const out = applyRecipe(fixture(), COLUMNS, [
    { op: 'outlier', column: 'g' },
    { op: 'scale', column: 'g' },
    { op: 'log1p', column: 'g' },
  ]);
  assert.equal(out.log.filter((l) => l.note).length, 3);
});
