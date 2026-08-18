// tests/contracts.test.js — 계약 고정 테스트
//
// 두 가지를 지킨다.
//  1) 모듈 계약 — js/domain/* 이 기대한 함수를 export 하는지. 이름이 바뀌면 실패하므로
//     의존 그래프(docs/data-model.md §6)가 코드와 어긋나는 것을 잡는다.
//  2) 임계값 ↔ 문서 대조 — thresholds.js 값이 docs/rules.md 수치와 일치하는지.
//     수동으로 3회 수행해 결함 3건을 잡았던 폐합 검사를 자동화한 것이다(docs/rules.md §3.6).
//
// 실행: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─────────────────────────────────────────────────────────────
// 1. 모듈 계약
// ─────────────────────────────────────────────────────────────

/** 모듈별 필수 export. docs/data-model.md §6 의존 그래프 노드와 일치한다. */
const CONTRACTS = {
  'decode.js': ['decode', 'stripBom'],
  'parse.js': ['detectDelimiter', 'parseCsv'],
  'infer.js': ['inferColumns', 'isValidFor', 'parseDate'],
  'stats.js': ['numericStats', 'quantile', 'topValues', 'classDistribution', 'histogram'],
  'correlation.js': ['correlationPairs', 'pearson', 'spearman', 'vif'],
  'outlier.js': ['iqrOutliers', 'zScoreOutliers'],
  'quality.js': ['healthScore'],
  'finding.js': ['buildFindings', 'collapseByType'],
  'chart-select.js': ['selectForColumn', 'selectPairs', 'selectForFinding'],
  'chart-svg.js': ['linearScale', 'renderAxis', 'renderChart', 'escapeXml'],
  'thresholds.js': [
    'HEALTH_PENALTY_CAP',
    'HEALTH_PENALTY_FACTOR',
    'HEALTH_VERDICT',
    'HEALTH_GRADE',
    'FINDING',
    'OUTLIER',
    'INFER',
    'FILE_LIMIT',
    'DISPLAY_LIMIT',
  ],
};

for (const [file, expected] of Object.entries(CONTRACTS)) {
  test(`domain/${file} — 계약 export`, async () => {
    const mod = await import(`../js/domain/${file}`);
    for (const name of expected) {
      assert.ok(name in mod, `${file} 이 ${name} 를 export 하지 않음`);
    }
  });
}

test('domain 모듈은 DOM·IO 를 참조하지 않는다', () => {
  // 순수 함수 계약(docs/tech-stack.md §5). 문자열 검사로 최소한을 지킨다.
  const forbidden = ['document.', 'window.', 'localStorage', 'sessionStorage', 'fetch('];
  for (const file of Object.keys(CONTRACTS)) {
    const src = readFileSync(join(ROOT, 'js/domain', file), 'utf8');
    // 주석 줄은 제외한다 (설명에서 언급할 수 있음)
    const code = src
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
      .join('\n');
    for (const token of forbidden) {
      assert.ok(!code.includes(token), `js/domain/${file} 이 ${token} 를 참조함 — 순수 함수 계약 위반`);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 2. 임계값 ↔ 문서 대조 (자동화된 폐합 검사)
// ─────────────────────────────────────────────────────────────

const { HEALTH_PENALTY_CAP, HEALTH_GRADE, FINDING, OUTLIER, INFER, FILE_LIMIT, DISPLAY_LIMIT } =
  await import('../js/domain/thresholds.js');

test('Health Score 감점 상한 합계는 100 (rules.md §2)', () => {
  const sum = Object.values(HEALTH_PENALTY_CAP).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test('Health Score 감점 상한 개별값 (rules.md §2)', () => {
  assert.deepEqual(HEALTH_PENALTY_CAP, {
    missing: 25,
    duplicate: 15,
    constant: 15,
    cardinality: 15,
    outlier: 15,
    invalid: 15,
  });
});

test('등급 구간 (rules.md §2.2)', () => {
  assert.equal(HEALTH_GRADE.good, 80);
  assert.equal(HEALTH_GRADE.fair, 50);
});

test('Finding 유형은 18종이며 ID 체계를 지킨다 (rules.md §3)', () => {
  const ids = Object.keys(FINDING);
  assert.equal(ids.length, 18);
  for (const id of ids) {
    assert.match(id, /^F-[A-Z-]+$/, `${id} 가 F- 접두사 + 대문자 스네이크 형식이 아님`);
  }
});

test('Finding 임계값 주요 항목 (rules.md §3.2~§3.5)', () => {
  assert.equal(FINDING['F-MISSING-HIGH'].missingRate, 0.2);
  assert.equal(FINDING['F-CONST-COL'].modeRate, 0.95);
  assert.equal(FINDING['F-HIGH-CARD'].uniqueCount, 50);
  assert.equal(FINDING['F-ID-COL'].uniqueRatio, 0.99);
  assert.equal(FINDING['F-SKEW'].absSkewness, 2);
  assert.equal(FINDING['F-KURTOSIS'].excessKurtosis, 7);
  assert.equal(FINDING['F-OUTLIER-RATE'].outlierRate, 0.05);
  assert.equal(FINDING['F-MULTICOLLINEAR'].absPearson, 0.8);
  assert.equal(FINDING['F-MULTICOLLINEAR'].vif, 10);
  assert.equal(FINDING['F-CORR-CAUSAL'].absPearson, 0.7);
  assert.equal(FINDING['F-LEAKAGE'].absPearson, 0.95);
  assert.equal(FINDING['F-CLASS-IMBALANCE'].minClassRatio, 0.1);
  assert.equal(FINDING['F-SCALE-DIFF'].stdRatio, 100);
  assert.equal(OUTLIER.iqrMultiplier, 1.5);
});

test('타입 추론 기준 (rules.md §6.2)', () => {
  assert.equal(INFER.typeMajority, 0.9);
  assert.equal(INFER.textUniqueRatio, 0.5);
  assert.equal(INFER.textAvgLength, 20);
  assert.equal(INFER.idMaxLength, 36);
  assert.equal(INFER.idMaxSpaceRatio, 0.1);
});

test('처리 파일 크기 상한 25MB (direction.md §9 — rules.md 외 유일한 예외)', () => {
  assert.equal(FILE_LIMIT.maxBytes, 25 * 1024 * 1024);
});

test('표시 개수 상한 (rules.md §4)', () => {
  assert.deepEqual(DISPLAY_LIMIT, {
    findings: 15,
    findingsPerType: 5,
    columnCharts: 8,
    scatterPairs: 6,
    scatterPoints: 200,
    heatmapColumns: 20,
  });
});

// ─────────────────────────────────────────────────────────────
// 3. finding-map.json ↔ thresholds.FINDING 폐합
// ─────────────────────────────────────────────────────────────

test('finding-map.json 이 Finding 18종 전부를 해설로 매핑한다', () => {
  const map = JSON.parse(readFileSync(join(ROOT, 'data/finding-map.json'), 'utf8'));
  const mapped = Object.keys(map).filter((k) => !k.startsWith('_'));
  const declared = Object.keys(FINDING);

  assert.deepEqual(
    mapped.slice().sort(),
    declared.slice().sort(),
    'thresholds.FINDING 과 finding-map.json 의 유형 목록이 다름'
  );

  for (const [id, entry] of Object.entries(map)) {
    if (id.startsWith('_')) continue;
    assert.ok(entry.slug, `${id} 에 slug 가 없음`);
    assert.ok(entry.label, `${id} 에 label 이 없음`);
    assert.match(entry.slug, /^[a-z][a-z-]*$/, `${id} 의 slug 형식이 잘못됨: ${entry.slug}`);
  }
});
