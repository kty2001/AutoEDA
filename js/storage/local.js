// storage/local.js — 브라우저 저장소 접근 (IO 계층. 도메인 모듈은 이 파일을 참조하지 않는다)
// 대응 유스케이스: UC-09, UC-10, UC-11, UC-15 (docs/use-cases.md)
// 키·수명·폴백 정책의 단일 원천: docs/data-model.md §4
//
// 결과를 sessionStorage 에 두는 이유는 축 6 의 `결과 → 해설 → 복귀` 왕복(UC-15)에서
// 결과가 살아 있어야 하기 때문이다. 탭을 닫으면 사라지는 편이 데이터 성격에 맞으므로
// localStorage 를 쓰지 않고, 표시 설정만 영구 보관한다.
//
// ⚠️ 원본 파일은 어디에도 저장하지 않는다. 결과 JSON 에도 원본 행이 없다.

import { FINDING } from '../domain/thresholds.js';

export const KEY_RESULT = 'autoeda:result'; // sessionStorage — 결과 JSON 전문
export const KEY_PREFS = 'autoeda:prefs'; // localStorage — 표시 설정

/**
 * 캐시가 수용하는 결과 스키마의 major. worker 의 SCHEMA_VERSION 과 같은 major 여야 하며
 * (docs/data-model.md §4 — 캐시와 내보내기 파일은 같은 버전 필드를 씀),
 * tests/storage.test.js 가 둘의 일치를 대조한다.
 */
export const RESULT_SCHEMA_MAJOR = '1';

/**
 * 결과를 캐시한다. 용량 초과 시 3단계로 축소 재시도한다(docs/data-model.md §4).
 *   1) stats.histogram 제외 → 2) correlations 를 임계값 이상 쌍으로 축소 → 3) 캐시 포기
 * 조용히 실패하지 않고 어느 단계까지 축소됐는지 반환해 화면에 표시하게 한다.
 * 입력 객체는 변형하지 않는다 — 화면이 들고 있는 결과에서 histogram 이 사라지면 안 된다.
 * @param {object} result
 * @returns {{ saved: boolean, degraded: null|'no-histogram'|'reduced-correlations' }}
 */
export function saveResult(result) {
  const attempts = [
    { degraded: null, build: () => result },
    { degraded: 'no-histogram', build: () => stripHistograms(result) },
    { degraded: 'reduced-correlations', build: () => reduceCorrelations(stripHistograms(result)) },
  ];
  for (const { degraded, build } of attempts) {
    try {
      sessionStorage.setItem(KEY_RESULT, JSON.stringify(build()));
      return { saved: true, degraded };
    } catch {
      // 용량 초과(QuotaExceededError 등) — 다음 단계로 축소해 재시도
    }
  }
  clearResult(); // 이전 캐시가 남아 있으면 복귀 시 다른 파일의 결과가 보인다
  return { saved: false, degraded: null };
}

/**
 * 캐시된 결과를 읽는다. 스키마 버전이 맞지 않으면 null 을 반환한다.
 * 깨진 캐시(파싱 불가·major 불일치)는 지운다 — 매 복귀마다 같은 실패를 반복하지 않는다.
 * @returns {object|null}
 */
export function loadResult() {
  const raw = sessionStorage.getItem(KEY_RESULT);
  if (raw === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearResult();
    return null;
  }
  const major = String(parsed?.schemaVersion ?? '').split('.')[0];
  if (major !== RESULT_SCHEMA_MAJOR) {
    clearResult();
    return null;
  }
  return parsed;
}

/**
 * 결과를 지운다. UC-11 의 경로이며 개인정보처리방침이 "직접 삭제할 수 있다"고
 * 기재하는 근거이므로 반드시 동작해야 한다.
 */
export function clearResult() {
  sessionStorage.removeItem(KEY_RESULT);
}

/** @returns {{ activeTab?: string, selectedColumn?: string, corrMethod?: string }} */
export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY_PREFS);
    const parsed = raw === null ? {} : JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 표시 설정을 부분 갱신한다(기존 값과 병합).
 * @param {object} patch
 */
export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  try {
    localStorage.setItem(KEY_PREFS, JSON.stringify(next));
  } catch {
    // 표시 설정은 저장에 실패해도 이번 세션 동작에는 지장이 없다
  }
}

// ─── 축소 단계 (docs/data-model.md §4) ──────────────────────

/** 1단계 — stats.histogram 제거. 복원 시 분포 차트만 다시 계산하면 된다. */
function stripHistograms(result) {
  return {
    ...result,
    columns: result.columns.map((col) => {
      if (!col.stats || !('histogram' in col.stats)) return col;
      const { histogram, ...rest } = col.stats;
      return { ...col, stats: rest };
    }),
  };
}

/**
 * 2단계 — 규칙이 참조하는 임계값 이상의 쌍만 남기고 산점도용 points 를 제거한다:
 * |Pearson| ≥ F-CORR-CAUSAL(가장 낮은 상관 임계) 또는 VIF ≥ F-MULTICOLLINEAR.
 * 히트맵 전체·산점도는 손실되지만 Finding 근거 쌍은 보존된다.
 */
function reduceCorrelations(result) {
  return {
    ...result,
    correlations: result.correlations
      .filter(
        (p) =>
          (p.pearson !== null && Math.abs(p.pearson) >= FINDING['F-CORR-CAUSAL'].absPearson) ||
          (p.vif !== null && p.vif >= FINDING['F-MULTICOLLINEAR'].vif)
      )
      .map(({ points, ...rest }) => rest),
  };
}
