// worker/analyze.worker.js — 분석 실행 Worker
// 대응 유스케이스: UC-01 ~ UC-05 (docs/use-cases.md)
// 메시지 프로토콜의 단일 원천: docs/data-model.md §5
// 결과 JSON 스키마의 단일 원천: docs/data-model.md §3
//
// UI 를 멈추지 않기 위해 파싱·연산을 전부 이 안에서 수행한다.
// 무료 티어 Worker CPU 10ms 제약 때문에 서버 연산이 불가하므로 이 Worker 가 엔진 전체를 담당한다.
//
// 받는 메시지: start { file, encoding?, typeOverrides? } · cancel
// 보내는 메시지: progress { stage, ratio } · done { result } · error { code, detail }
// stage: 'decode' | 'parse' | 'infer' | 'stats' | 'finding'
// error code: ENCODING_UNDETECTED | FILE_TOO_LARGE | PARSE_FAILED  (→ docs/data-model.md §5.1)
//
// 파이프라인 자체는 순수 함수 analyze() 로 분리했다 — Worker 전역(self) 없이도
// node --test 로 결과 JSON 조립을 검증하기 위함이다. 메시지 글루만 self 존재 시 배선한다.

import { decode } from '../domain/decode.js';
import { detectDelimiter, parseCsv, toNumber } from '../domain/parse.js';
import { inferColumns, parseDate } from '../domain/infer.js';
import { numericStats, topValues, histogram, densityCurve } from '../domain/stats.js';
import { iqrOutliers } from '../domain/outlier.js';
import { correlationPairs } from '../domain/correlation.js';
import { healthScore } from '../domain/quality.js';
import { buildFindings } from '../domain/finding.js';
import { FILE_LIMIT, DISPLAY_LIMIT } from '../domain/thresholds.js';
import { bytes } from '../lib/format.js';

const SCHEMA_VERSION = '1.1';

/** 단계 진입 시 보고하는 진행률. 값 자체는 표시용 근사치다. */
const STAGE_RATIO = { decode: 0.1, parse: 0.3, infer: 0.5, stats: 0.75, finding: 0.9 };

/**
 * 분석 파이프라인 전체. 결과 JSON(docs/data-model.md §3)을 조립한다.
 * @param {ArrayBuffer} buffer 원본 파일 바이트
 * @param {{
 *   encoding?: 'utf-8'|'euc-kr',
 *   typeOverrides?: Record<string, string>,
 *   target?: string,
 *   onProgress?: (stage: string, ratio: number) => void,
 *   isCancelled?: () => boolean
 * }} [options]
 * @returns {object|null} 결과 JSON. 취소되면 null — 부분 결과를 내지 않는다(§5.2)
 * @throws {Error & {code: 'FILE_TOO_LARGE'|'ENCODING_UNDETECTED'|'PARSE_FAILED'}}
 */
export function analyze(buffer, options = {}) {
  const { encoding, typeOverrides, target, onProgress, isCancelled } = options;
  const step = (stage) => {
    if (isCancelled?.()) return false;
    onProgress?.(stage, STAGE_RATIO[stage]);
    return true;
  };

  if (buffer.byteLength > FILE_LIMIT.maxBytes) {
    const err = new Error('파일 크기 초과');
    err.code = 'FILE_TOO_LARGE';
    err.detail = `파일이 ${bytes(buffer.byteLength)}로 상한 ${bytes(FILE_LIMIT.maxBytes)}를 넘습니다.`;
    throw err;
  }

  if (!step('decode')) return null;
  const decoded = decode(buffer, encoding);

  if (!step('parse')) return null;
  const delimiter = detectDelimiter(decoded.text);
  // 비수치 타입으로 오버라이드된 열은 문자열로 유지한다 — Float64Array 변환은
  // 선행 0(우편번호)을 비가역으로 잃는다(parse.js keepAsString, work-log.md 함정)
  const keepAsString = Object.entries(typeOverrides ?? {})
    .filter(([, type]) => type !== 'numeric')
    .map(([name]) => name);
  const parsed = parseCsv(decoded.text, { delimiter, keepAsString });

  if (!step('infer')) return null;
  const inferred = inferColumns(parsed, typeOverrides);

  if (!step('stats')) return null;
  const columns = inferred.map((col) => ({
    ...col,
    stats: columnStats(col, parsed.columns[col.index]),
  }));
  const numericArrays = columns
    .filter((c) => c.type === 'numeric')
    .map((c) => ({ name: c.name, values: alignedNumeric(parsed.columns[c.index]) }));
  const correlations = attachScatterPoints(correlationPairs(numericArrays), numericArrays);

  const dataset = {
    rowCount: parsed.rowCount,
    columnCount: parsed.names.length,
    duplicateRowCount: duplicateRowCount(parsed),
    memoryBytes: estimateMemory(parsed.columns),
    encoding: decoded.encoding,
    delimiter,
    sampled: false, // Phase 1 은 샘플링 없음 (docs/data-model.md §3.2)
    createdAt: new Date().toISOString(),
  };

  if (!step('finding')) return null;
  const health = healthScore({ columns, dataset });
  const findings = buildFindings({ dataset, columns, health, correlations, target });

  return { schemaVersion: SCHEMA_VERSION, dataset, columns, health, findings, correlations };
}

/** 타입별 stats 필드 조립(docs/data-model.md §3.7). id·text 는 빈 객체. */
function columnStats(col, raw) {
  switch (col.type) {
    case 'numeric': {
      const compact = compactNumeric(raw);
      if (compact.length === 0) return {};
      const s = numericStats(compact);
      const hist = histogram(compact);
      // KDE 는 수치형에만 붙인다 — 날짜 히스토그램은 x 가 epoch 라 곡선의 대역폭이 뜻을 잃는다
      const density = densityCurve(compact, s, hist);
      return {
        ...s,
        outlierRate: iqrOutliers(compact, s).rate,
        histogram: density ? { ...hist, density } : hist,
      };
    }
    case 'categorical':
    case 'boolean':
      return { topValues: topValues(stringValues(raw)) };
    case 'datetime': {
      const epochs = compactDates(raw);
      if (epochs.length === 0) return {};
      let min = Infinity;
      let max = -Infinity;
      for (const v of epochs) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return { min, max, histogram: histogram(epochs) };
    }
    default:
      return {};
  }
}

/** 결측·타입 불일치를 제외한 수치 값만 모은다 — stats·outlier 계약(결측 제외 배열). */
function compactNumeric(raw) {
  const out = [];
  if (raw instanceof Float64Array) {
    for (const v of raw) if (!Number.isNaN(v)) out.push(v);
  } else {
    for (const v of raw) {
      const n = toNumber(v);
      if (n !== null) out.push(n);
    }
  }
  return Float64Array.from(out);
}

/** 행 정렬을 유지한 전체 길이 배열(결측·불일치=NaN) — correlation 계약(쌍별 제거). */
function alignedNumeric(raw) {
  if (raw instanceof Float64Array) return raw;
  return Float64Array.from(raw, (v) => toNumber(v) ?? NaN);
}

function stringValues(raw) {
  return raw instanceof Float64Array
    ? Array.from(raw, (v) => (Number.isNaN(v) ? '' : String(v)))
    : raw;
}

function compactDates(raw) {
  const out = [];
  for (const v of stringValues(raw)) {
    const ms = parseDate(v);
    if (ms !== null) out.push(ms);
  }
  return Float64Array.from(out);
}

/**
 * 상관 절댓값 상위 쌍에 산점도용 다운샘플 점을 붙인다(docs/data-model.md §3.6).
 * 결과 JSON 에 원본 행이 없으므로 산점도는 여기서 담아 준 점 없이는 그릴 수 없다.
 * 상한: 쌍 수 DISPLAY_LIMIT.scatterPairs · 쌍당 점 수 DISPLAY_LIMIT.scatterPoints.
 */
function attachScatterPoints(correlations, numericArrays) {
  const byName = new Map(numericArrays.map((c) => [c.name, c.values]));
  const top = correlations
    .filter((p) => p.pearson !== null)
    .sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson))
    .slice(0, DISPLAY_LIMIT.scatterPairs);
  const chosen = new Set(top);
  return correlations.map((pair) => {
    if (!chosen.has(pair)) return pair;
    return { ...pair, points: samplePoints(byName.get(pair.left), byName.get(pair.right)) };
  });
}

/** 쌍별 완전 케이스를 균등 간격으로 상한까지 추린다. */
function samplePoints(a, b) {
  const all = [];
  for (let i = 0; i < a.length; i++) {
    if (!Number.isNaN(a[i]) && !Number.isNaN(b[i])) all.push([a[i], b[i]]);
  }
  const limit = DISPLAY_LIMIT.scatterPoints;
  if (all.length <= limit) return all;
  const step = all.length / limit;
  return Array.from({ length: limit }, (_, k) => all[Math.floor(k * step)]);
}

/** 완전 중복 행 수 — 첫 등장을 제외한 나머지를 센다(docs/data-model.md §3.2). */
function duplicateRowCount(parsed) {
  const seen = new Set();
  let duplicates = 0;
  for (let r = 0; r < parsed.rowCount; r++) {
    const key = parsed.columns
      .map((col) => (col instanceof Float64Array ? String(col[r]) : col[r]))
      .join('\u0000');
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  return duplicates;
}

/** 메모리 사용량 추정치 — Float64 는 8바이트, 문자열은 UTF-16 기준 2바이트/자. */
function estimateMemory(columns) {
  let total = 0;
  for (const col of columns) {
    if (col instanceof Float64Array) total += col.length * 8;
    else for (const v of col) total += v.length * 2;
  }
  return total;
}

// ─── Worker 메시지 글루 (브라우저 전용) ──────────────────────

/** 취소 플래그. cancel 을 받으면 세우고, 각 단계 진입 시 확인해 중단한다. */
let cancelled = false;

// self 존재만 보면 안 된다 — 일반 페이지의 window.self 도 참이 되어
// window 의 message 이벤트(타 출처 postMessage 포함)에 파이프라인이 배선된다.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.addEventListener('message', (event) => {
    const { type } = event.data ?? {};

    if (type === 'cancel') {
      // 중단 시점의 부분 결과를 쓰지 않는다 — 부분 통계는 틀린 통계다(docs/data-model.md §5.2).
      // 응답 없이 종료하며 Page 가 terminate() 한다.
      cancelled = true;
      return;
    }

    if (type === 'start') {
      run(event.data).catch((err) => {
        self.postMessage({
          type: 'error',
          code: err?.code ?? 'PARSE_FAILED',
          detail: err?.detail ?? String(err?.message ?? err),
        });
      });
    }
  });
}

/**
 * 분석 실행. 단계마다 progress 를 보낸다.
 * 타입 수정 재계산도 이 경로를 다시 타므로(start 재호출) 부분 재계산 코드를 두지 않는다.
 * @param {{ file: File, encoding?: string, typeOverrides?: object }} payload
 */
async function run(payload) {
  cancelled = false;
  const buffer = await payload.file.arrayBuffer();
  const result = analyze(buffer, {
    encoding: payload.encoding,
    typeOverrides: payload.typeOverrides,
    target: payload.target,
    onProgress: (stage, ratio) => self.postMessage({ type: 'progress', stage, ratio }),
    isCancelled: () => cancelled,
  });
  if (result !== null) self.postMessage({ type: 'done', result });
}
