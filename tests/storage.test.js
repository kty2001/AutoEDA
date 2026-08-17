// tests/storage.test.js — storage/local.js 동작 테스트
// Node 에는 Web Storage 가 없으므로 용량 상한을 흉내내는 가짜 저장소를 전역에 꽂는다.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
  constructor(limit = Infinity) {
    this.map = new Map();
    this.limit = limit;
  }
  setItem(key, value) {
    if (String(value).length > this.limit) throw new Error('QuotaExceededError');
    this.map.set(key, String(value));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

globalThis.sessionStorage = new FakeStorage();
globalThis.localStorage = new FakeStorage();

const { saveResult, loadResult, clearResult, loadPrefs, savePrefs, KEY_RESULT, RESULT_SCHEMA_MAJOR } =
  await import('../js/storage/local.js');

/** 히스토그램이 큰 결과 픽스처. 축소 단계별 크기 차이를 만들기 위한 구성. */
const makeResult = () => ({
  schemaVersion: '1.0',
  dataset: { rowCount: 10 },
  columns: [
    { name: 'a', type: 'numeric', stats: { mean: 1, histogram: { binEdges: Array(200).fill(0), counts: Array(199).fill(1) } } },
    { name: 'b', type: 'categorical', stats: { topValues: [{ value: 'x', count: 5 }] } },
  ],
  health: { total: 100 },
  findings: [],
  correlations: [
    { left: 'a', right: 'b', pearson: 0.95, spearman: 0.9, vif: null },
    { left: 'a', right: 'c', pearson: 0.1, spearman: 0.1, vif: 2 },
    { left: 'b', right: 'c', pearson: null, spearman: null, vif: 12 },
  ],
});

const sizeOf = (result) => JSON.stringify(result).length;

beforeEach(() => {
  globalThis.sessionStorage = new FakeStorage();
  globalThis.localStorage = new FakeStorage();
});

// ─── saveResult 폴백 3단계 ─────────────────────────────────

test('전문 저장 — degraded 없음, 왕복 일치', () => {
  const result = makeResult();
  assert.deepEqual(saveResult(result), { saved: true, degraded: null });
  assert.deepEqual(loadResult(), result);
});

test('1단계 — histogram 만 제외하고 저장, 원본은 변형하지 않는다', () => {
  const result = makeResult();
  globalThis.sessionStorage = new FakeStorage(sizeOf(result) - 1);
  const r = saveResult(result);
  assert.deepEqual(r, { saved: true, degraded: 'no-histogram' });

  const cached = loadResult();
  assert.ok(!('histogram' in cached.columns[0].stats));
  assert.equal(cached.columns[0].stats.mean, 1); // 다른 stats 는 유지
  assert.equal(cached.correlations.length, 3); // 상관은 아직 전량
  assert.ok('histogram' in result.columns[0].stats); // 화면이 든 원본은 그대로
});

test('2단계 — 임계값 이상 상관 쌍만 남긴다', () => {
  const result = makeResult();
  const stage1Size = sizeOf({ ...result, columns: result.columns.map((c) => ({ ...c, stats: { mean: 1 } })) });
  globalThis.sessionStorage = new FakeStorage(stage1Size - 1);
  const r = saveResult(result);
  assert.deepEqual(r, { saved: true, degraded: 'reduced-correlations' });

  const cached = loadResult();
  // |r|≥0.7(F-CORR-CAUSAL) 또는 VIF≥10(F-MULTICOLLINEAR)만 생존
  assert.deepEqual(cached.correlations.map((p) => `${p.left}-${p.right}`), ['a-b', 'b-c']);
});

test('3단계 — 캐시 포기, 이전 캐시도 남기지 않는다', () => {
  saveResult(makeResult()); // 이전 결과가 저장된 상태에서
  globalThis.sessionStorage.limit = 10; // 어떤 축소로도 안 들어가는 한도
  const r = saveResult({ ...makeResult(), dataset: { rowCount: 999 } });
  assert.deepEqual(r, { saved: false, degraded: null });
  assert.equal(loadResult(), null); // 다른 파일의 옛 결과가 보이면 안 된다
});

// ─── loadResult 검증 ────────────────────────────────────────

test('스키마 major 불일치 — null 반환하고 캐시를 지운다', () => {
  globalThis.sessionStorage.setItem(KEY_RESULT, JSON.stringify({ schemaVersion: '2.0' }));
  assert.equal(loadResult(), null);
  assert.equal(globalThis.sessionStorage.getItem(KEY_RESULT), null);
});

test('깨진 JSON — null 반환하고 캐시를 지운다', () => {
  globalThis.sessionStorage.setItem(KEY_RESULT, '{broken');
  assert.equal(loadResult(), null);
  assert.equal(globalThis.sessionStorage.getItem(KEY_RESULT), null);
});

test('minor 차이는 허용 (data-model.md §4 버전 정책)', () => {
  globalThis.sessionStorage.setItem(KEY_RESULT, JSON.stringify({ schemaVersion: '1.7' }));
  assert.ok(loadResult() !== null);
});

test('clearResult — UC-11 삭제 경로', () => {
  saveResult(makeResult());
  clearResult();
  assert.equal(loadResult(), null);
});

// ─── prefs ──────────────────────────────────────────────────

test('prefs — 부분 갱신은 기존 값과 병합된다', () => {
  savePrefs({ activeTab: 'quality' });
  savePrefs({ corrMethod: 'spearman' });
  assert.deepEqual(loadPrefs(), { activeTab: 'quality', corrMethod: 'spearman' });
});

test('prefs — 없거나 깨져 있으면 빈 객체', () => {
  assert.deepEqual(loadPrefs(), {});
  globalThis.localStorage.setItem('autoeda:prefs', 'not-json');
  assert.deepEqual(loadPrefs(), {});
});

// ─── 버전 드리프트 방지 ─────────────────────────────────────

test('worker 산출 결과의 major 와 캐시 수용 major 가 일치한다', async () => {
  const { analyze } = await import('../js/worker/analyze.worker.js');
  const result = analyze(new TextEncoder().encode('a\n1\n2').buffer);
  assert.equal(result.schemaVersion.split('.')[0], RESULT_SCHEMA_MAJOR);
});
