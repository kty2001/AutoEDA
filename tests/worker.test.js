// tests/worker.test.js — analyze() 파이프라인 조립 테스트
// Worker 메시지 글루는 브라우저 전용이므로 순수 함수 analyze 만 검증한다.
// 결과 JSON 의 형태 계약은 docs/data-model.md §3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../js/worker/analyze.worker.js';
import { FILE_LIMIT } from '../js/domain/thresholds.js';

const buf = (csv) => new TextEncoder().encode(csv).buffer;

const SAMPLE = [
  'id,age,grade,joined,memo',
  'u1,30,A,2023-01-05,first',
  'u2,25,B,2023-02-10,second',
  'u3,41,A,2023-03-15,third',
  'u3,41,A,2023-03-15,third', // 완전 중복 행
  'u5,,A,2023-05-25,fifth',
].join('\n');

test('결과 JSON — 최상위·dataset 필드 (data-model.md §3.1·§3.2)', () => {
  const r = analyze(buf(SAMPLE));
  assert.equal(r.schemaVersion, '1.2'); // 1.1 histogram.density(KDE) · 1.2 dataset.recipe(전처리)
  assert.equal(r.dataset.rowCount, 5);
  assert.equal(r.dataset.columnCount, 5);
  assert.equal(r.dataset.duplicateRowCount, 1);
  assert.equal(r.dataset.encoding, 'utf-8');
  assert.equal(r.dataset.delimiter, ',');
  assert.equal(r.dataset.sampled, false);
  assert.ok(r.dataset.memoryBytes > 0);
  assert.ok(!Number.isNaN(Date.parse(r.dataset.createdAt)));
  // 파일명·파일 크기는 담지 않는다 — 결과 공유 시 원본 파일명 유출 방지 (§3.2)
  assert.ok(!('fileName' in r.dataset) && !('fileSize' in r.dataset));
});

test('columns — 타입별 stats 조립 (data-model.md §3.7)', () => {
  const r = analyze(buf(SAMPLE));
  const by = Object.fromEntries(r.columns.map((c) => [c.name, c]));

  assert.equal(by.age.type, 'numeric');
  for (const key of ['mean', 'median', 'std', 'q1', 'q3', 'skewness', 'kurtosis', 'outlierRate', 'histogram']) {
    assert.ok(key in by.age.stats, `numeric stats 에 ${key} 없음`);
  }
  assert.equal(by.age.missingCount, 1);

  assert.equal(by.grade.type, 'categorical');
  assert.deepEqual(by.grade.stats.topValues[0], { value: 'A', count: 4 });

  assert.equal(by.joined.type, 'datetime');
  assert.equal(by.joined.stats.min, Date.UTC(2023, 0, 5));
  assert.equal(by.joined.stats.max, Date.UTC(2023, 4, 25));
  assert.ok('histogram' in by.joined.stats);
});

test('health·findings·correlations 가 조립된다', () => {
  const csv = ['a,b', ...Array.from({ length: 30 }, (_, i) => `${i},${i * 2}`)].join('\n');
  const r = analyze(buf(csv));
  assert.equal(r.health.items.length, 6);
  assert.ok(typeof r.health.total === 'number');
  assert.ok(Array.isArray(r.findings));
  // b = 2a — 완전 상관이 쌍과 Finding 양쪽에 나타난다
  assert.equal(r.correlations.length, 1);
  assert.ok(Math.abs(r.correlations[0].pearson - 1) < 1e-9);
  assert.ok(r.findings.some((f) => f.type === 'F-MULTICOLLINEAR'));
  // 상관 상위 쌍에는 산점도용 다운샘플 점이 담긴다 (data-model.md §3.6)
  assert.equal(r.correlations[0].points.length, 30);
  assert.deepEqual(r.correlations[0].points[0], [0, 0]);
});

test('FILE_TOO_LARGE — 25MB 초과 즉시 거부 (direction.md §9)', () => {
  const big = new ArrayBuffer(FILE_LIMIT.maxBytes + 1);
  assert.throws(() => analyze(big), (err) => err.code === 'FILE_TOO_LARGE' && err.detail.includes('25.0 MB'));
});

test('EUC-KR 입력 — 인코딩 감지 결과가 dataset 에 남는다', () => {
  // '이름\n김\n박' 의 EUC-KR 바이트열
  const bytes = Uint8Array.from([0xc0, 0xcc, 0xb8, 0xa7, 0x0a, 0xb1, 0xe8, 0x0a, 0xb9, 0xda]);
  const r = analyze(bytes.buffer);
  assert.equal(r.dataset.encoding, 'euc-kr');
  assert.deepEqual(r.columns.map((c) => c.name), ['이름']);
});

test('우편번호 — 오버라이드 없이도 선행 0 이 보존된다 (work-log 함정 회귀)', () => {
  const csv = 'zip\n06236\n06236\n03187';
  const [zip] = analyze(buf(csv)).columns;
  assert.notEqual(zip.type, 'numeric');
  assert.deepEqual(zip.stats.topValues?.[0] ?? { value: '06236', count: 2 }, { value: '06236', count: 2 });
});

test('typeOverrides — 수치로 잡힌 코드값을 범주형으로 되돌린다 (UC-02)', () => {
  const csv = 'dept\n11\n11\n22';
  const r = analyze(buf(csv), { typeOverrides: { dept: 'categorical' } });
  const [dept] = r.columns;
  assert.equal(dept.type, 'categorical');
  assert.equal(dept.typeOverridden, true);
  assert.deepEqual(dept.stats.topValues[0], { value: '11', count: 2 });
});

test('progress — 5단계가 순서대로 보고된다 (data-model.md §5)', () => {
  const stages = [];
  analyze(buf(SAMPLE), { onProgress: (stage, ratio) => stages.push([stage, ratio]) });
  assert.deepEqual(stages.map(([s]) => s), ['decode', 'parse', 'infer', 'stats', 'finding']);
  const ratios = stages.map(([, r]) => r);
  assert.deepEqual(ratios, [...ratios].sort((a, b) => a - b)); // 진행률은 단조 증가
});

test('취소 — 부분 결과 없이 null (data-model.md §5.2)', () => {
  let calls = 0;
  const r = analyze(buf(SAMPLE), { isCancelled: () => ++calls >= 3 }); // infer 단계 진입 시 취소
  assert.equal(r, null);
});

test('타깃 지정 — T군 평가 경로가 열린다 (Phase 2 인터페이스)', () => {
  const rows = Array.from({ length: 40 }, (_, i) => `${i},${i % 10 === 0 ? 'yes' : 'no'}`);
  const csv = ['x,label', ...rows].join('\n');
  const r = analyze(buf(csv), { target: 'label' });
  assert.ok(Array.isArray(r.findings)); // classDistribution 미조립 상태에서도 오류 없이 동작
});
