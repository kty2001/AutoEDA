// tests/integration.test.js — 계층 통합 스모크
//
// 현실적인 CSV 한 건으로 analyze → 캐시 왕복 → 전 차트 렌더까지 이어서 실행한다.
// 작은 픽스처는 각 모듈이 옳다는 것만 보이고 조합이 옳다는 것은 보이지 않는다 —
// 이 파일은 2026-08-17 에 유닛 테스트를 전부 통과한 상태에서 조립부 결함 3건
// (자유 텍스트 → id 오탐 · 선행 0 유실 · 조사 오류)을 잡아낸 경로다.
// → docs/implementation-status.md §3, docs/work-log.md

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
  constructor() { this.map = new Map(); }
  setItem(k, v) { this.map.set(k, String(v)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  removeItem(k) { this.map.delete(k); }
}

let analyze, profile, saveResult, loadResult;
let selectForColumn, selectPairs, selectHeatmap, selectForFinding, selectScree, renderChart;
let applyRecipe, suggestSteps, normalizeRecipe, serializeCsv;
let result;
/** analyze 가 붙들어 준 파싱 결과 — 전처리 경로의 입력이다 (Worker 가 하는 일과 같다). */
let parsed;

/** 한글 열 이름 · 결측 · 중복행 · 극단값 · 강한 상관 · 코드값 · 자유 텍스트를 한 파일에 담는다. */
function sampleCsv() {
  const rows = ['회원ID,가입일,나이,연소득,등급,우편번호,메모'];
  for (let i = 0; i < 300; i++) {
    const age = i < 290 ? 20 + (i % 40) : 95 + (i % 5); // 소수의 극단값
    const income = age * 100 + (i % 7) * 10; // 나이와 강한 상관
    const grade = ['A', 'B', 'C'][i % 3];
    const ageCell = i % 25 === 0 ? '' : String(age); // 4% 결측
    rows.push(
      `U${String(i).padStart(4, '0')},2023-0${(i % 9) + 1}-15,${ageCell},${income},${grade},0${6000 + i},"비고 ${i}, 특이사항 없음"`
    );
  }
  rows.push(rows[1]); // 완전 중복 행
  return rows.join('\n');
}

before(async () => {
  globalThis.sessionStorage = new FakeStorage();
  globalThis.localStorage = new FakeStorage();
  ({ analyze, profile } = await import('../js/worker/analyze.worker.js'));
  ({ applyRecipe } = await import('../js/domain/transform.js'));
  ({ suggestSteps, normalizeRecipe } = await import('../js/domain/recipe.js'));
  ({ serializeCsv } = await import('../js/domain/parse.js'));
  ({ saveResult, loadResult } = await import('../js/storage/local.js'));
  ({ selectForColumn, selectPairs, selectHeatmap, selectForFinding, selectScree } = await import(
    '../js/domain/chart-select.js'
  ));
  ({ renderChart } = await import('../js/domain/chart-svg.js'));
  result = analyze(new TextEncoder().encode(sampleCsv()).buffer, {
    onParsed: (p) => {
      parsed = p;
    },
  });
});

test('파이프라인 — 데이터셋 메타가 입력과 일치한다', () => {
  assert.equal(result.dataset.rowCount, 301);
  assert.equal(result.dataset.columnCount, 7);
  assert.equal(result.dataset.duplicateRowCount, 1);
  assert.equal(result.dataset.encoding, 'utf-8');
});

test('타입 추론 — 열 성격이 뒤섞인 파일에서 각 열을 제대로 가른다', () => {
  const type = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
  assert.equal(type.회원ID, 'id');
  assert.equal(type.가입일, 'datetime');
  assert.equal(type.나이, 'numeric');
  assert.equal(type.연소득, 'numeric');
  assert.equal(type.등급, 'categorical');
  assert.notEqual(type.우편번호, 'numeric'); // 선행 0 코드값
  assert.equal(type.메모, 'text'); // 짧지만 고유한 자유 텍스트 — id 오탐 회귀
});

test('선행 0 — 우편번호가 값 그대로 보존된다', () => {
  const zip = result.columns.find((c) => c.name === '우편번호');
  assert.ok(zip.evidence.sampleValues[0].startsWith('0'), zip.evidence.sampleValues[0]);
});

test('판정 — Health Score 와 Finding 이 조립된다', () => {
  assert.ok(result.health.total >= 0 && result.health.total <= 100);
  assert.equal(result.health.items.length, 6);
  // 완전 중복 행 1건은 반드시 발견된다
  assert.ok(result.findings.some((f) => f.type === 'F-DUP-ROW'));
  // 자유 텍스트 열에 식별자 발견이 붙으면 오탐이다
  const idFindings = result.findings.filter((f) => f.type === 'F-ID-COL');
  assert.ok(!idFindings.some((f) => f.targets.includes('메모')));
});

test('문구 — 수치 뒤 조사가 어긋나지 않는다 (rules.md §5.4)', () => {
  for (const f of result.findings) {
    for (const text of [f.what, f.why, f.how]) {
      assert.ok(!/[036]로\s/.test(text), `조사 오류: ${text}`); // "3로" / "6126로"
      assert.ok(!/[1245789]으로\s/.test(text), `조사 오류: ${text}`); // "2.5으로"
    }
  }
});

test('캐시 — 축소 없이 저장되고 복원이 원본과 일치한다', () => {
  const cache = saveResult(result);
  assert.deepEqual(cache, { saved: true, degraded: null });
  assert.deepEqual(loadResult(), result);
});

test('차트 — 전 스펙이 렌더되고 CSP 를 어기지 않는다', () => {
  const specs = [
    ...result.columns.flatMap((c) => selectForColumn(c)),
    ...selectPairs(result.correlations),
    ...result.findings.flatMap((f) => selectForFinding(f, result.columns)),
  ];
  const heatmap = selectHeatmap(result.correlations, result.columns);
  if (heatmap) specs.push(heatmap);
  assert.ok(specs.length > 0);

  for (const spec of specs) {
    const svg = renderChart(spec);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `SVG 형태 이상: ${spec.kind}`);
    assert.ok(!svg.includes('style='), `인라인 style 누수: ${spec.kind}`); // style-src 'self'
  }
});

test('산점도 — 상위 쌍에 점 데이터가 상한 내로 담긴다', () => {
  const withPoints = result.correlations.filter((p) => p.points);
  assert.ok(withPoints.length > 0);
  for (const p of withPoints) assert.ok(p.points.length <= 200);
});

test('타입 수정 재계산 — 오버라이드가 결과에 반영된다 (UC-02)', () => {
  const re = analyze(new TextEncoder().encode(sampleCsv()).buffer, {
    typeOverrides: { 우편번호: 'categorical' },
  });
  const zip = re.columns.find((c) => c.name === '우편번호');
  assert.equal(zip.type, 'categorical');
  assert.ok(zip.evidence.sampleValues[0].startsWith('0'));
});


// ─── 전처리 루프 (docs/TODO.md T7) ──────────────────────────
// 발견 → 조치 → 적용 → 검증 → 산출물이 실제로 이어지는지 한 번에 확인한다.
// 모듈 단위 테스트는 각 단계가 옳다는 것만 보이고 루프가 닫힌다는 것은 보이지 않는다.

test('전처리 — 발견에서 실행 가능한 조치가 나온다', () => {
  const steps = suggestSteps(result.findings, result.columns);
  assert.ok(steps.length > 0, '발견은 있는데 조치 제안이 하나도 없다');
  assert.ok(steps.every((s) => s.op && s.label && s.cost), '조치마다 op·라벨·대가가 있어야 한다');
  // 이 픽스처는 중복 행·결측·극단값을 담고 있으므로 대응 조치가 나와야 한다
  const ops = new Set(steps.map((s) => s.op));
  assert.ok(ops.has('drop-duplicates'), '완전 중복 행에 대한 조치가 없다');
});

test('전처리 — 조치를 적용하면 Health Score 가 개선된다', () => {
  const steps = suggestSteps(result.findings, result.columns);
  // 정보를 버리는 조치(열 제거)는 빼고, 품질 문제만 직접 겨냥한 것만 켠다
  const recipe = normalizeRecipe(
    steps.filter((s) => s.op === 'drop-duplicates' || s.op === 'impute' || (s.op === 'outlier' && s.action === 'clip'))
  );
  assert.ok(recipe.length > 0);

  const applied = applyRecipe(parsed, result.columns, recipe);
  const after = profile(applied, {
    encoding: result.dataset.encoding,
    delimiter: result.dataset.delimiter,
    recipe,
  });

  assert.ok(after.health.total > result.health.total, `점수가 오르지 않았다: ${result.health.total} → ${after.health.total}`);
  assert.equal(after.dataset.duplicateRowCount, 0, '중복 행 제거가 반영되지 않았다');
  assert.deepEqual(after.dataset.recipe, recipe, '전처리 후 결과는 스스로 그 사실을 밝혀야 한다');
  assert.equal(parsed.rowCount, 301, '원본 파싱 결과가 변형됐다');
});

test('전처리 — 내려받은 CSV 를 다시 분석하면 After 통계와 일치한다 (왕복)', () => {
  // 변환 엔진과 직렬화가 동시에 맞아야만 통과하는 검사다
  const recipe = [
    { op: 'drop-duplicates' },
    { op: 'impute', column: '나이', method: 'median' },
    { op: 'outlier', column: '나이', action: 'clip' },
    { op: 'scale', column: '연소득', method: 'standard' },
  ];
  const applied = applyRecipe(parsed, result.columns, recipe);
  const after = profile(applied, { encoding: 'utf-8', delimiter: ',', recipe });

  const csv = serializeCsv(applied.names, applied.columns, applied.rowCount, { delimiter: ',' });
  const reread = analyze(new TextEncoder().encode(csv).buffer);

  assert.equal(reread.dataset.rowCount, after.dataset.rowCount);
  assert.deepEqual(reread.columns.map((c) => c.name), after.columns.map((c) => c.name));
  const digest = (r) =>
    r.columns.map((c) => [c.type, c.missingRate, c.stats.mean ?? null, c.stats.std ?? null]);
  assert.deepEqual(digest(reread), digest(after));
});

test('전처리 — 적합 파라미터가 log 에 남는다 (테스트 세트에 다시 쓰려면 필요하다)', () => {
  const recipe = [{ op: 'scale', column: '연소득', method: 'standard' }];
  const { log } = applyRecipe(parsed, result.columns, recipe);
  assert.equal(log.length, 1);
  assert.equal(typeof log[0].params.center, 'number');
  assert.equal(typeof log[0].params.spread, 'number');
});

// ─── 타깃 기반 EDA (docs/TODO.md T7 2단계) ──────────────────
// 규칙 엔진은 이미 있었으나 classDistribution 미부착으로 죽어 있던 경로다.
// 실제 혼합 데이터로 한 번의 analyze() 호출 안에서 조립되는지 확인한다.

test('타깃 지정 — 분류 타깃의 classDistribution·classStats 가 한 번의 analyze() 로 조립된다', () => {
  const withTarget = analyze(new TextEncoder().encode(sampleCsv()).buffer, { target: '등급' });
  const grade = withTarget.columns.find((c) => c.name === '등급');
  assert.ok(grade.classDistribution);
  const total = Object.values(grade.classDistribution).reduce((a, b) => a + b, 0);
  assert.equal(total, withTarget.dataset.rowCount - grade.missingCount);

  const age = withTarget.columns.find((c) => c.name === '나이');
  assert.ok(age.classStats);
  for (const cls of Object.keys(grade.classDistribution)) {
    assert.ok(cls in age.classStats, `클래스 ${cls} 의 수치 요약이 없다`);
  }
});

test('타깃 지정 — F-LEAKAGE 가 실제로 발화한다 (거의 결정론적 관계, 이전에는 도달 불가였던 경로)', () => {
  const withTarget = analyze(new TextEncoder().encode(sampleCsv()).buffer, { target: '나이' });
  const leakage = withTarget.findings.find((f) => f.type === 'F-LEAKAGE');
  assert.ok(leakage, 'F-LEAKAGE 가 발화하지 않았다 — 연소득은 나이의 거의 결정론적 함수다');
  assert.ok(leakage.targets.includes('연소득') && leakage.targets.includes('나이'));
});

// ─── 차원축소 (docs/TODO.md T9) ─────────────────────────────
// 수치형 열이 2개뿐인 위 픽스처는 PCA 산출 조건에 미달한다 — 그 경계도 함께 확인한다.

/** 수치형 4열(둘은 강하게 겹침) + 범주형 1열. 차원축소 경로를 타는 최소 현실형 파일이다. */
function pcaCsv() {
  const rows = ['키,몸무게,허리둘레,만족도,등급'];
  for (let i = 0; i < 120; i++) {
    const height = 150 + (i % 45);
    const weight = height * 0.6 + (i % 5); // 키와 강한 상관
    const waist = height * 0.45 + (i % 7);
    const score = (i * 13) % 10; // 체격과 무관
    rows.push(`${height},${weight.toFixed(1)},${waist.toFixed(1)},${score},${['A', 'B'][i % 2]}`);
  }
  return rows.join('\n');
}

test('차원축소 — 수치형 열이 최소 개수 미만이면 pca 필드 자체가 없다', () => {
  // 위 픽스처의 수치형은 나이·연소득 둘뿐이다 (우편번호는 선행 0 코드값이라 수치가 아니다)
  assert.equal(result.columns.filter((c) => c.type === 'numeric').length, 2);
  assert.equal('pca' in result, false);
});

test('차원축소 — analyze() 한 번으로 pca 가 조립되고 스크리 차트까지 그려진다', () => {
  const r = analyze(new TextEncoder().encode(pcaCsv()).buffer);
  assert.ok(r.pca, 'pca 가 조립되지 않았다');
  assert.deepEqual(r.pca.columns, ['키', '몸무게', '허리둘레', '만족도']);
  assert.equal(r.pca.usedRowCount, 120);
  assert.equal(r.pca.droppedRowCount, 0);

  const sum = r.pca.components.reduce((a, c) => a + c.ratio, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `설명 비율 합이 1 이 아님: ${sum}`);
  // 체격 3열이 서로 겹치므로 첫 축이 절반 이상을 가져간다
  assert.ok(r.pca.components[0].ratio > 0.5, `PC1 설명 비율 ${r.pca.components[0].ratio}`);

  const svg = renderChart(selectScree(r.pca));
  assert.match(svg, /<svg/);
  assert.ok(!svg.includes('style='), 'CSP — 인라인 style 금지');
});

test('차원축소 — 결과 캐시를 왕복해도 pca 가 살아남는다', () => {
  const r = analyze(new TextEncoder().encode(pcaCsv()).buffer);
  assert.ok(saveResult(r).saved);
  const reread = loadResult();
  assert.deepEqual(reread.pca, JSON.parse(JSON.stringify(r.pca)));
});

test('차원축소 — 전처리 후 결과도 같은 엔진으로 pca 를 다시 낸다', () => {
  let held;
  const r = analyze(new TextEncoder().encode(pcaCsv()).buffer, { onParsed: (p) => (held = p) });
  const applied = applyRecipe(held, r.columns, [{ op: 'drop-column', column: '만족도' }]);
  const after = profile(applied, { recipe: [{ op: 'drop-column', column: '만족도' }] });
  assert.deepEqual(after.pca.columns, ['키', '몸무게', '허리둘레']);
  assert.ok(after.pca.components[0].ratio > r.pca.components[0].ratio, '무관한 열을 빼면 첫 축의 비중이 커진다');
});

test('차원축소 — 결과 JSON 에 행 단위 값이 들어가지 않는다 (규약 8)', () => {
  const r = analyze(new TextEncoder().encode(pcaCsv()).buffer);
  const keys = Object.keys(r.pca);
  assert.deepEqual(keys.filter((k) => k.includes('score') || k.includes('points')), []);
  // 담긴 배열의 길이는 전부 열 수·성분 수에 묶여 있고 행 수와 무관하다
  assert.equal(r.pca.loadings.length, r.pca.components.length);
  for (const row of r.pca.loadings) assert.equal(row.length, r.pca.columns.length);
});
