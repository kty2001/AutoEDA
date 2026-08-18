# 문서 안내

설계 문서 10종 + 작업 문서 3종의 진입점임. 프로젝트 개요는 [`../README.md`](../README.md) 참조.

## 읽는 순서

**처음 보는 사람**
`../README.md` → [`preinvestigation.md`](preinvestigation.md) (왜 만드는지) → [`direction.md`](direction.md) (무엇을 만드는지)

**작업을 이어받는 사람**
[`TODO.md`](TODO.md) (**여기서 시작** — 지금 어디이고 다음에 뭘 하는지) → [`implementation-status.md`](implementation-status.md) (현황·규약·실행) → [`work-log.md`](work-log.md) (왜 그렇게 했는지)

**구현 세부를 봐야 하는 사람**
[`tech-stack.md`](tech-stack.md) (스택·제약) → [`screens.md`](screens.md) (페이지 구분) → [`use-cases.md`](use-cases.md) (동작 흐름) → [`data-model.md`](data-model.md) (계약) → [`rules.md`](rules.md) (판정 기준)

**콘텐츠를 쓰는 사람**
[`content-strategy.md`](content-strategy.md) (인벤토리·안티패턴) → [`data-sources.md`](data-sources.md) (사례 리포트용 데이터셋 조건)

## 단일 원천 지도

주제마다 확정본이 하나임. **다른 문서에서 수치를 옮겨 적지 말고 링크할 것** — 옮겨 적으면 한쪽만 고쳐져 드리프트가 생김.

| 주제 | 확정본 |
|---|---|
| 조사 결과 · 갭 분석(G1~G9) · 수익화 타당성 | [`preinvestigation.md`](preinvestigation.md) |
| 제품 정의 · 차별화 6축 · Phase 범위 | [`direction.md`](direction.md) |
| 콘텐츠 인벤토리 · **광고·색인 정책** · 안티패턴 | [`content-strategy.md`](content-strategy.md) |
| 스택 · 인프라 제약 · 디렉토리 · 배포 구성 | [`tech-stack.md`](tech-stack.md) |
| 액터 · 유스케이스 · 추적 매트릭스 | [`use-cases.md`](use-cases.md) |
| 페이지 구분 · 페이지별 기능 · 화면 상태 | [`screens.md`](screens.md) |
| 색·타이포·컴포넌트 규격 · AutoEDA 적용 시 조정 | [`DESIGN.md`](DESIGN.md) |
| 결과 JSON 스키마 · 저장소 키 · Worker 프로토콜 · 모듈 의존 | [`data-model.md`](data-model.md) |
| Health Score 감점 · Finding 임계값 · 표시 상한 · 문구 규칙 | [`rules.md`](rules.md) |
| 데이터셋 이용 조건 · 표시 요건 | [`data-sources.md`](data-sources.md) |
| **작업 항목** · 완료 이력 · 다음 차례 · 재검토 대기 | [`TODO.md`](TODO.md) |
| 구현 현황(파일별) · 구현 규약 · 실행·검증 | [`implementation-status.md`](implementation-status.md) |
| 구현 중 결정 근거 · 함정 | [`work-log.md`](work-log.md) |

## 문서를 고칠 때

- **단일 원천이 아닌 문서에서는 링크만 둠.** 수치·임계값·정책은 확정본 한 곳에만 존재해야 함
- **규칙을 추가·수정하면 폐합 검사를 함** — `rules.md`의 조건이 참조하는 지표가 `data-model.md §3`에 필드로 존재하는지 대조. 이 검사는 **세 차례 수행에서 매번** 결함을 잡아냈음([`rules.md §3.6`](rules.md))
- 절 번호를 인용할 때는 실제 섹션이 있는지 확인함
- Phase 2~3 기능을 상세히 명세하지 않음. 구현 전에 폐기될 수 있음
- **작업 항목은 [`TODO.md`](TODO.md)에만 둠** — 설계 문서에 "다음에 할 일"을 적으면 완료 후에도 남아 낡은 지시가 됨

## 코드와 문서의 연결

문서가 코드로 이어지는 지점. 한쪽을 고치면 반대쪽을 함께 봄.

| 문서 | 코드 |
|---|---|
| `rules.md` 임계값 | `js/domain/thresholds.js` (상수 집약. 다른 모듈에 수치를 쓰지 않음) |
| `rules.md §2` Health Score 감점 | `js/domain/quality.js` |
| `rules.md §3` Finding 19종 | `js/domain/finding.js` · `data/finding-map.json` (해설 매핑) |
| `rules.md §4` 표시 상한 | `thresholds.DISPLAY_LIMIT` — `finding.js`(묶기) · `chart-select.js`(차트 수) · `analyze.page.js`(목록) |
| `rules.md §5.4` 수치 뒤 조사 | `js/lib/format.js` 의 `ro()` |
| `data-model.md §3` 결과 JSON | `js/worker/analyze.worker.js` 의 `analyze()` 가 조립 |
| `data-model.md §4` 저장소·용량 폴백 | `js/storage/local.js` |
| `data-model.md §5` Worker 프로토콜 | `js/worker/analyze.worker.js` 메시지 글루 |
| `data-model.md §6` 의존 그래프 | 각 `js/domain/*.js` 헤더 주석의 "의존 위치" |
| `use-cases.md` 추적 매트릭스 | 각 모듈 헤더 주석의 "대응 유스케이스" |
| `screens.md §4` 4상태 | `pages/analyze.html` 의 `.state` 섹션 4개 · `js/app/analyze.page.js` |
| `tech-stack.md §6` CSP 제약 | `js/domain/chart-svg.js` (인라인 style 금지) · `_headers` |
| `DESIGN.md §0·§2` 토큰·조정 항목 | `css/style.css` 토큰 블록 · `js/domain/chart-svg.js` 히트맵 배색 |

`npm test`가 `thresholds.js` ↔ `rules.md` 수치와 `finding-map.json` ↔ Finding 목록을 대조하므로, **문서만 고치고 코드를 안 고치면 테스트가 실패함.**
