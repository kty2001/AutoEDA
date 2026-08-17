// domain/thresholds.js — 판정 임계값 단일 집약 (순수: 상수만, 로직 없음)
// 대응 문서: docs/rules.md — 이 파일의 모든 값은 그 문서의 표와 1:1로 대응한다.
//            (예외: FILE_LIMIT 만 docs/direction.md §9 가 단일 원천이다)
// 규약: rules.md §1 "코드에 상수를 흩뿌리지 않고 한 모듈의 상수 객체로 모아 문서와 대조 가능하게 한다".
//       임계값을 다른 모듈에 직접 쓰지 말고 반드시 여기서 import 한다.
//       tests/contracts.test.js 가 이 값들을 문서 수치와 대조한다.

/** Health Score 항목별 감점 상한. 합계 100. → rules.md §2 */
export const HEALTH_PENALTY_CAP = Object.freeze({
  missing: 25,
  duplicate: 15,
  constant: 15,
  cardinality: 15,
  outlier: 15,
  invalid: 15,
});

/** 감점 계산 계수 — penalty = min(cap, 지표 × 계수). → rules.md §2.1 */
export const HEALTH_PENALTY_FACTOR = Object.freeze({
  missing: 100,
  duplicate: 300,
  constant: 5, // 열 수 기준 (비율 아님)
  cardinality: 5, // 열 수 기준
  outlier: 300,
  invalid: 500,
});

/** 항목별 verdict 경계. 값 미만이면 ok, warn 미만이면 warn, 그 이상은 bad. → rules.md §2.1 */
export const HEALTH_VERDICT = Object.freeze({
  missing: { ok: 0.05, warn: 0.2 },
  duplicate: { ok: 0.0, warn: 0.05 },
  outlier: { ok: 0.01, warn: 0.05 },
  invalid: { ok: 0.0, warn: 0.01 },
  // constant·cardinality 는 비율이 아니라 "해당 열 수"로 판정한다.
  // 0개 → ok / 1개 이상 → warn / 전체(또는 범주형) 대비 비율이 bad 기준 이상 → bad
  constant: { bad: 0.2 },
  cardinality: { bad: 0.5 },
});

/** 총점 → 등급 구간. 3단으로만 둔다(감점이 근사치이므로 해상도를 낮게 유지). → rules.md §2.2 */
export const HEALTH_GRADE = Object.freeze({
  good: 80, // 80 이상
  fair: 50, // 50 이상
  // 그 미만은 poor
});

/**
 * Finding 유형별 발생 조건 임계값. 키는 Finding 유형 ID.
 * → rules.md §3.2~§3.5. data/finding-map.json 의 키와 동일해야 한다.
 */
export const FINDING = Object.freeze({
  // ── 데이터 품질군 (rules.md §3.2)
  'F-MISSING-HIGH': Object.freeze({ missingRate: 0.2 }),
  'F-MISSING-IMPUTE': Object.freeze({ missingRateMin: 0.05, missingRateMax: 0.2, absSkewness: 1 }),
  'F-DUP-ROW': Object.freeze({ duplicateRowCount: 1 }),
  'F-CONST-COL': Object.freeze({ modeRate: 0.95 }),
  'F-HIGH-CARD': Object.freeze({ uniqueCount: 50, uniqueRatio: 0.5 }),
  'F-ID-COL': Object.freeze({ uniqueRatio: 0.99 }),

  // ── 분포군 (rules.md §3.3)
  'F-SKEW': Object.freeze({ absSkewness: 2 }),
  'F-KURTOSIS': Object.freeze({ excessKurtosis: 7 }),
  'F-OUTLIER-RATE': Object.freeze({ outlierRate: 0.05 }),
  'F-OUTLIER-ACTION': Object.freeze({ outlierRate: 0.01, absSkewness: 1 }),
  'F-BIN-SENSITIVE': Object.freeze({ uniqueCountMax: 20 }),

  // ── 관계군 (rules.md §3.4)
  'F-CORR-METHOD': Object.freeze({ absSkewness: 2 }),
  'F-MULTICOLLINEAR': Object.freeze({ absPearson: 0.8, vif: 10 }),
  'F-CORR-CAUSAL': Object.freeze({ absPearson: 0.7 }),
  'F-MIXED-RELATION': Object.freeze({ minCategorical: 1, minNumeric: 1 }),
  'F-LEAKAGE': Object.freeze({ absPearson: 0.95 }),

  // ── 타깃·모델링군 (rules.md §3.5) — Phase 2, 타깃 지정 시에만 활성
  'F-CLASS-IMBALANCE': Object.freeze({ minClassRatio: 0.1 }),
  'F-TARGET-SKEW': Object.freeze({ absSkewness: 1 }),
  'F-SCALE-DIFF': Object.freeze({ stdRatio: 100 }),
});

/** 이상치 판정 방식 기본값. IQR 1.5배는 박스플롯 표준 정의. → rules.md §6.1 */
export const OUTLIER = Object.freeze({ iqrMultiplier: 1.5 });

/** 타입 추론 판정 기준 (infer.js 전용). → rules.md §6.2 — 자체 판단, 실측 후 조정 대상 */
export const INFER = Object.freeze({
  typeMajority: 0.9, // 비결측 값 중 해당 타입 파싱 성공 비율이 이 이상이면 그 타입
  textUniqueRatio: 0.5, // 텍스트 판정: 고유값 비율이 이 이상이고
  textAvgLength: 20, //   평균 길이가 이 이상이면 자유 텍스트
  idMaxLength: 36, // id 판정: 평균 길이가 이 이하일 때만 (UUID 36자를 포함하는 값)
  idMaxSpaceRatio: 0.1, // id 판정: 공백을 포함한 값의 비율이 이 이하일 때만.
  //                       식별자에는 공백이 없다 — 길이만으로는 짧은 자유 텍스트와 구분되지 않는다
});

/** 처리 파일 크기 상한. 단일 원천: docs/direction.md §9. 초과 시 FILE_TOO_LARGE. */
export const FILE_LIMIT = Object.freeze({ maxBytes: 25 * 1024 * 1024 }); // 25MB

/** 화면 표시 개수 상한 — 정보 과부하(G2) 방지. → rules.md §4 */
export const DISPLAY_LIMIT = Object.freeze({
  findings: 15, // 발견 목록 기본 표시
  findingsPerType: 5, // 같은 유형은 5건까지, 나머지는 "그 외 N개 열" 로 묶음
  columnCharts: 8, // 변수별 탭 초기 차트
  scatterPairs: 6, // 관계 탭 산점도
  scatterPoints: 200, // 산점도 쌍당 점 수 (초과 시 균등 간격 다운샘플)
  heatmapColumns: 20, // 상관 히트맵 (초과 시 분산 상위 20열로 축소)
});
