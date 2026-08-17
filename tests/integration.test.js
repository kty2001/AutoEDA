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

let analyze, saveResult, loadResult;
let selectForColumn, selectPairs, selectHeatmap, selectForFinding, renderChart;
let result;

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
  ({ analyze } = await import('../js/worker/analyze.worker.js'));
  ({ saveResult, loadResult } = await import('../js/storage/local.js'));
  ({ selectForColumn, selectPairs, selectHeatmap, selectForFinding } = await import(
    '../js/domain/chart-select.js'
  ));
  ({ renderChart } = await import('../js/domain/chart-svg.js'));
  result = analyze(new TextEncoder().encode(sampleCsv()).buffer);
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
