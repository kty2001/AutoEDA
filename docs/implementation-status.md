# 구현 현황

**무엇이 구현되어 있고, 무엇을 지켜야 하고, 어떻게 실행·검증하는지의 단일 원천임.** 코드 상태가 바뀌면 이 문서의 §1을 같이 갱신함.

- **다음에 할 일은 [`TODO.md`](TODO.md)에 있음** — 작업 항목은 여기 두지 않음
- 설계 문서 지도: [`README.md`](README.md) · 프로젝트 개요: [`../README.md`](../README.md)
- 이 문서는 수치·임계값을 옮겨 적지 않음. 확정본에 링크만 둠 ([`README.md` §단일 원천 지도](README.md))

최종 갱신: 2026-08-17

---

## 1. 현황 스냅숏

**단계: Phase 1 코드 완성, 브라우저 실기 검증 통과, SEO 빌드 완료.** domain·worker·storage·app·`build_seo` 전부 구현·테스트 완료 — 남은 코드는 빌드 스크립트 2종이고 둘 다 콘텐츠(Phase 1.5)가 있어야 의미가 있음. 실기 검증에서 나온 결함 1건(`.menu-panel` 의 `display` 가 `hidden` 을 덮음)은 수정함. **다음 관문은 첫 배포임.** 구현 중의 결정·함정은 [`work-log.md`](work-log.md) 참조.

### 완성된 것

| 항목 | 파일 | 비고 |
|---|---|---|
| 임계값 상수 | `js/domain/thresholds.js` | [`rules.md`](rules.md)와 1:1 (예외: `FILE_LIMIT` → [`direction.md §9`](direction.md)) |
| 인코딩 감지·디코드 | `js/domain/decode.js` | UTF-8 fatal 우선, EUC-KR 폴백, BOM 제거 |
| CSV 파싱 | `js/domain/parse.js` | RFC 4180 상태기계, 구분자 감지, 수치 열 Float64Array, `keepAsString` 옵션 |
| 타입 추론 | `js/domain/infer.js` | 6타입 추론, 결측/불일치 구분, 오버라이드, 한국식 날짜 |
| 기술통계 | `js/domain/stats.js` | 적률·R-7 분위수·topValues·classDistribution·히스토그램. 추정량 선택은 파일 헤더에 문서화 |
| 이상치 | `js/domain/outlier.js` | IQR(경계·비율), z-score 대조군 |
| 상관·공선성 | `js/domain/correlation.js` | Pearson(쌍별 제거)·Spearman(평균 순위)·VIF(정규방정식, listwise) |
| Health Score | `js/domain/quality.js` | 항목 6종 감점·verdict·evidence, id/text 제외 규칙 |
| 규칙 엔진 | `js/domain/finding.js` | Finding 19종(타깃군은 target 지정 시), 3단 문구 확정, 정렬·유형당 5건 묶기 |
| 표시 포맷 | `js/lib/format.js` | percent·count·stat·bytes |
| Finding→해설 매핑 | `data/finding-map.json` | 19종 전부. 테스트가 폐합 검사함 |
| Worker 파이프라인 | `js/worker/analyze.worker.js` | 순수 함수 `analyze()`가 결과 JSON([`data-model.md §3`](data-model.md)) 조립 — FILE_LIMIT 검사·progress·취소·중복행·메모리 추정 포함. 메시지 글루는 Worker 전역에서만 배선 |
| 저장소 | `js/storage/local.js` | 결과 캐시 3단 축소 폴백([`data-model.md §4`](data-model.md))·major 검증·prefs 병합 저장 |
| 차트 선택 | `js/domain/chart-select.js` | 타입별 대표 차트·산점도 상위 6쌍·히트맵 20열 축소·Finding 강조(왜도·IQR 경계) |
| SVG 렌더 | `js/domain/chart-svg.js` | 5종(히스토그램·박스플롯·막대·산점도·히트맵) 문자열 렌더 — 인라인 style 없음(CSP), 값 유래 문자열 전부 이스케이프 |
| app 배선 | `js/app/*.js` | analyze 4상태·Worker 왕복·5섹션 탭·내보내기/불러오기·이어보기, 전역 메뉴, 공통 동작, 문의 mailto+폴백 |
| SEO 빌드 | `scripts/build_seo.mjs` | canonical·OG·JSON-LD 주입(멱등) + `sitemap.xml`. 색인 정책 폐합 검사(sitemap↔noindex·확장자·URL 중복), `FAQPage` 는 페이지 HTML 에서 추출, 미생성 산출물은 경고 후 제외 |
| 테스트 | `tests/*.test.js` | 계약 21 + 동작 167 + 빌드 18 = 206건 (`integration.test.js` 가 계층 통합 스모크) |
| 배포 설정 | `wrangler.jsonc` `_headers` `_redirects` `robots.txt` `.assetsignore` `sitemap.xml` | `sitemap.xml` 은 빌드 산출물이지만 배포 자산이라 커밋함 |
| 페이지 골격 | `index.html` `404.html` `pages/*.html` `css/style.css` | analyze 4상태 섹션 포함 |

### 스텁 (구현 대상)

| 계층 | 파일 | 내용 |
|---|---|---|
| 빌드 | `scripts/build_guides.mjs` `build_cases.py` | 해설·사례 HTML 생성. 둘 다 입력(콘텐츠 원자료·데이터셋 판정)이 없어 대기 중 |

`build_guides` 산출물의 `<head>` 에는 **`build_seo` 자리 표시 주석을 넣어야 함** — 없으면 `npm run build:seo` 가 exit 1 함(색인 신호 누락을 조용히 넘기지 않기 위한 게이트).

콘텐츠 원자료(`data/guide_source/`)와 사례 리포트(`pages/case/`)는 비어 있음 — Phase 1.5 범위임.

## 2. 구현 규약

코드를 쓸 때 지킬 것. 대부분 `tests/contracts.test.js`가 기계적으로 강제함.

1. **임계값은 `thresholds.js`에서만 import.** 다른 모듈에 수치를 직접 쓰지 않음 ([`rules.md` §1](rules.md))
2. **`js/domain/*`은 순수 함수.** DOM·storage·fetch 참조 금지. 테스트가 문자열 검사로 강제함
3. **export 이름은 계약.** 바꾸려면 `tests/contracts.test.js`의 `CONTRACTS`와 [`data-model.md` §6](data-model.md) 의존 그래프를 같이 고침
4. **스텁의 JSDoc 시그니처가 명세.** 구현 시 시그니처·오류 코드(`ENCODING_UNDETECTED` 등)를 임의로 바꾸지 않음. 바꿔야 하면 [`data-model.md` §5](data-model.md)부터 고침
5. **헤더 주석 유지.** 대응 유스케이스·의존 위치·정책 근거 링크는 구현 후에도 남김
6. **내부 링크·canonical·sitemap URL은 확장자 없이.** `.html`을 가리키면 307 리디렉션으로 색인이 깨짐 (`wrangler.jsonc` 주석, [`tech-stack.md` §6](tech-stack.md))
7. **빌드 스크립트는 서식 오류 시 파일을 쓰지 않고 exit 1.** 조용한 유실 금지 (`build_guides.mjs` 헤더)
8. **원본 데이터는 저장·전송·게시하지 않음.** 결과 JSON에도 원본 행을 넣지 않음 ([`data-model.md` §3](data-model.md), `storage/local.js` 헤더)
9. **문서를 고치면 코드·테스트를 같이 고침.** 폐합 절차는 [`README.md` §문서를 고칠 때](README.md)

## 3. 실행·검증

| 명령 | 내용 |
|---|---|
| `npm test` | 전체 테스트 206건(계약·동작·통합·빌드). **모든 작업 완료 전 필수** |
| `npm run serve` | 로컬 서빙 (`python -m http.server 8000`). ES Module·Worker 확인용 |
| `npx wrangler dev --persist-to <프로젝트 밖>` | **실기 검증용 서버.** `_headers` CSP·확장자 없는 URL 을 배포와 같게 적용함 — `npm run serve` 는 둘 다 재현하지 못하므로 CSP·링크 확인에는 쓸 수 없음. `--persist-to` 를 빼면 무한 리로드([`work-log.md`](work-log.md)) |
| `npm run build:guides` | 해설 md → HTML (미구현) |
| `npm run build:seo` | canonical·OG·JSON-LD 주입 + `sitemap.xml` 생성. 멱등하므로 몇 번 돌려도 무방하고, **배포 직전에 한 번 돌림** |
| `npx wrangler deploy` | Cloudflare Workers 배포 → `autoeda.tyoujungzz.workers.dev` |

모듈을 구현하면 계약 테스트 외에 **동작 테스트를 `tests/`에 추가함** (`node --test`가 `tests/*.test.js`를 집음). domain 모듈은 순수 함수라 fixture 입력→출력 단정으로 충분함.

**계층을 이어 붙인 뒤에는 통합 스모크를 한 번 돌림** — `tests/integration.test.js`가 그것으로, 현실적인 CSV 한 건(한글 열 이름·결측·중복행·편포·코드값·자유 텍스트 혼합)으로 `analyze` → 캐시 왕복 → 전 차트 렌더까지 이어서 실행함. 유닛 테스트가 전부 통과하는 상태에서 조립부 결함 3건이 이 방법으로만 드러났음([`work-log.md`](work-log.md) 2026-08-17). 작은 픽스처는 각 모듈이 옳다는 것만 보이고 **조합이 옳다는 것은 보이지 않음.** 새 계층을 이어 붙이면 이 파일에 단정을 추가함.

## 4. 다음 작업

**[`TODO.md`](TODO.md)가 확정본임** — 다음 차례는 브라우저 실기 검증이고, 그 뒤로 빌드 스크립트·배포·콘텐츠가 이어짐. 미결 결정 4건은 [`direction.md` §9](direction.md)가 원천임.

작업 항목을 이 문서에도 적으면 한쪽만 갱신되어 어긋나므로 여기서는 링크만 둠.

## 5. 작업 기록

구현 중의 결정 근거와 함정은 [`work-log.md`](work-log.md)에 날짜별로 남김. 완료 이력 요약은 [`TODO.md` §3](TODO.md)에 있음.
