// tests/recipe.test.js — domain/recipe.js 동작 테스트
// 대응 작업: docs/TODO.md T7 1단계
//
// 핵심은 폐합 검사다 — Finding 유형이 늘었는데 조치 매핑도 제외 등재도 없으면
// 그 발견은 화면에서 "무엇을 하면 되는지"만 말하고 실행 경로가 없는 채로 남는다.
// data/finding-map.json(해설 폐합)과 같은 방식으로 여기서 막는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suggestSteps, normalizeRecipe, EXCLUDED } from '../js/domain/recipe.js';
import { STEP_ORDER } from '../js/domain/transform.js';

const COLUMNS = [
  { name: 'age', type: 'numeric' },
  { name: 'price', type: 'numeric' },
  { name: 'city', type: 'categorical' },
];

const finding = (type, scope, targets) => ({ type, scope, targets, severity: 'medium' });

// ─── 폐합 ───────────────────────────────────────────────────

test('모든 Finding 유형은 조치 매핑이 있거나 제외 사유가 등재돼 있다', () => {
  const map = JSON.parse(readFileSync(new URL('../data/finding-map.json', import.meta.url), 'utf-8'));
  const source = readFileSync(new URL('../js/domain/recipe.js', import.meta.url), 'utf-8');
  const rules = source.slice(source.indexOf('const RULES = {'));

  for (const type of Object.keys(map).filter((k) => k.startsWith('F-'))) {
    const mapped = rules.includes(`'${type}'`);
    const excluded = type in EXCLUDED;
    assert.ok(mapped || excluded, `${type} 에 조치 매핑도 제외 사유도 없음`);
    assert.ok(!(mapped && excluded), `${type} 이 매핑과 제외에 동시에 있음`);
  }
});

test('제외 사유는 빈 문자열이 아니다 — "아직 안 만들었다"를 걸러내기 위한 최소 검사', () => {
  for (const [type, reason] of Object.entries(EXCLUDED)) {
    assert.ok(reason.length > 10, `${type} 의 제외 사유가 비어 있음`);
  }
});

// ─── suggestSteps ───────────────────────────────────────────

test('제안마다 실행 가능한 op 와 대가(cost) 문구가 붙는다', () => {
  const steps = suggestSteps([finding('F-SKEW', 'column', ['price'])], COLUMNS);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].op, 'log1p');
  assert.equal(steps[0].column, 'price');
  assert.ok(steps[0].cost.length > 10, '대가 문구가 없으면 도구가 판단을 대신하는 셈이 된다');
  assert.equal(steps[0].findingType, 'F-SKEW');
});

test('같은 열의 서로 다른 방식은 나란히 제안된다 (사용자가 고를 대안)', () => {
  const steps = suggestSteps([finding('F-OUTLIER-RATE', 'column', ['age'])], COLUMNS);
  assert.deepEqual(steps.map((s) => s.action), ['clip', 'drop-rows']);
});

test('묶인 발견(collapsed)의 targets 는 전부 제안 대상이다', () => {
  const steps = suggestSteps([finding('F-CONST-COL', 'column', ['age', 'city'])], COLUMNS);
  assert.deepEqual(steps.map((s) => s.column), ['age', 'city']);
});

test('F-LEAKAGE — 타깃 자신을 지우자고 제안하지 않는다', () => {
  // targets 는 [상대 열, 타깃] 순서다 (finding.js)
  const steps = suggestSteps([finding('F-LEAKAGE', 'pair', ['age', 'price'])], COLUMNS);
  assert.deepEqual(steps.map((s) => s.column), ['age']);
});

test('F-SCALE-DIFF — dataset 범위이므로 수치형 열 전체에 표준화를 제안한다', () => {
  const steps = suggestSteps([finding('F-SCALE-DIFF', 'dataset', [])], COLUMNS);
  assert.deepEqual(steps.map((s) => s.column), ['age', 'price']);
  assert.ok(steps.every((s) => s.op === 'scale' && s.method === 'standard'));
});

test('제외 유형과 모르는 유형은 제안을 만들지 않는다', () => {
  assert.deepEqual(suggestSteps([finding('F-KURTOSIS', 'column', ['age'])], COLUMNS), []);
  assert.deepEqual(suggestSteps([finding('F-UNKNOWN', 'column', ['age'])], COLUMNS), []);
});

test('결측 제안의 대치 방식은 열 타입을 따른다', () => {
  const steps = suggestSteps(
    [finding('F-MISSING-HIGH', 'column', ['age']), finding('F-MISSING-HIGH', 'column', ['city'])],
    COLUMNS
  );
  const impute = steps.filter((s) => s.op === 'impute');
  assert.deepEqual(impute.map((s) => s.method), ['median', 'mode']);
});

// ─── normalizeRecipe ────────────────────────────────────────

test('normalizeRecipe — 정규 순서로 정렬한다', () => {
  const sorted = normalizeRecipe([
    { op: 'scale', column: 'a' },
    { op: 'drop-duplicates' },
    { op: 'impute', column: 'a' },
  ]);
  const ranks = sorted.map((s) => STEP_ORDER.indexOf(s.op));
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y));
  assert.equal(sorted[0].op, 'drop-duplicates');
});

test('normalizeRecipe — 같은 열의 같은 연산은 하나만 남는다 (방식이 달라도)', () => {
  const out = normalizeRecipe([
    { op: 'outlier', column: 'a', action: 'clip' },
    { op: 'outlier', column: 'a', action: 'drop-rows' },
    { op: 'outlier', column: 'b', action: 'clip' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].action, 'clip', '먼저 담은 쪽이 남는다');
});

test('normalizeRecipe — 빈 입력·null 을 견딘다', () => {
  assert.deepEqual(normalizeRecipe(), []);
  assert.deepEqual(normalizeRecipe([]), []);
});
