# 작업 목록

**무엇을 했고, 지금 어디이며, 다음에 무엇을 하는지의 단일 원천임.** 작업을 시작하거나 중단할 때 이 문서를 갱신함.

| 찾는 것 | 문서 |
|---|---|
| 파일별 구현 현황 · 구현 규약 · 실행·검증 명령 | [`implementation-status.md`](implementation-status.md) |
| 결정 근거 · 되풀이하지 말 함정 | [`work-log.md`](work-log.md) |
| 임계값 · 스키마 · 정책 수치 | 각 확정본 ([`README.md` 단일 원천 지도](README.md)) |

여기에는 **작업 항목만** 둠. 수치·규칙·현황 표를 옮겨 적지 않고 링크함.

최종 갱신: 2026-09-08

---

## 1. 지금 어디인가

**Phase 1 완료. Phase 1.5 콘텐츠 작업 완료 — 해설 23편·사례 3편·용어집 발행. 필수 페이지 4종 확정.**
**그 뒤 T7(전처리·타깃 EDA)·T8(공유 링크)·T9(다중 컬럼 관계)·T10(용어집 검색·필수 페이지)·T11(차원축소)이 들어왔으나 전부 미배포임** — 프로덕션은 2026-08-18 배포본임.

도구·빌드 파이프라인이 닫혔고 해설 23편(K1 인덱스 + 하위 22편)·사례 4편(허브 1 + 리포트 3)이 발행됨. [`content-strategy.md` §8](content-strategy.md) 작성 순서 1~4 완료. **콘텐츠 축은 게이트를 크게 넘겼으므로 남은 관문은 인프라임** — 커스텀 도메인 취득, 광고 배치·`ads.txt`, GSC 등록. 셋 다 콘텐츠가 아니라 사용자 결정·대기에 묶여 있음.

| 지표 | 값 |
|---|---|
| 런타임 코드 | `js/` 23개 모듈 (domain 15 · app 5 · lib·storage·worker 각 1, 스텁 0) |
| 빌드 스크립트 | `build_seo` · `build_guides` 완료 / `build_cases` **미구현 — 쓰지 않기로 함**([`work-log.md` 2026-08-18](work-log.md)) |
| 테스트 | 386건 통과 + 실기 11(T8 5항목은 2026-09-06 별도 통과) + HTTP 검증 7 (2026-09-08) |
| 색인 대상 | **30 URL** — 전수가 리디렉션 0회로 200 (2026-09-08 `wrangler dev` 재실측) |
| 발행 콘텐츠 | **28편 · 48,125자** / 게이트 목표 15편 · 25,000자 — **충족(193%)** · 실측 원천은 `npm run build` 합계 줄 |
| 미발행 콘텐츠 | 사례 3편(데이터셋 미선정) |
| 필수 페이지 | **5종 확정** — 시행일·광고 쿠키 고지 기재 완료, 면책조항 추가(2026-09-06) |
| 죽은 내부 링크 | **0건** |

---

## 2. 다음 작업

### T1. 브라우저 실기 검증 — **완료 (2026-08-17)**

11항목 전부 확인함. 결함 1건(`.menu-panel` 의 `display` 가 `hidden` 을 덮음)을 수정했고, 검증 방법·함정·재검토로 넘긴 2건은 [`work-log.md`](work-log.md)에 있음.

**검증 서버는 `wrangler dev` 를 씀** — `npm run serve`(`python -m http.server`)는 `_headers` 의 CSP 를 보내지 않고 확장자 없는 URL 이 404 라 T1 의 핵심 두 항목을 검증할 수 없음. 다시 검증할 때도 같은 방법으로 함:

```bash
npx wrangler dev --port 8787 --persist-to <프로젝트 밖 경로>
```

`--persist-to` 없이 돌리면 자산 디렉토리가 루트라 무한 리로드에 빠짐([`work-log.md`](work-log.md) 함정).

### T2. 빌드 스크립트

각 파일 헤더의 TODO 목록이 명세임. 전부 **서식 오류 시 파일을 쓰지 않고 exit 1** ([`implementation-status.md` §2](implementation-status.md) 규약 7).

1. ~~`scripts/build_seo.mjs`~~ — **완료 (2026-08-17).** `npm run build:seo`. 색인 대상 페이지에 canonical·OG·JSON-LD 주입 + `sitemap.xml` 생성, 색인 정책 폐합 검사, 멱등. 미생성 해설·사례 인덱스는 경고 후 제외하므로 콘텐츠 없이도 돌아감. 결정·함정은 [`work-log.md`](work-log.md)
2. ~~`scripts/build_guides.mjs`~~ — **완료 (2026-08-17).** `npm run build:guides`. 산문 md → HTML + 섹션 인덱스 + `data/published.json`. 서식 검증은 줄 번호와 함께 exit 1. **사례 허브도 이 스크립트가 만듦** (데이터셋과 무관한 산문이므로)
3. ~~`scripts/build_cases.py`~~ — **구현하지 않기로 함 (2026-08-18).** 사례 리포트도 `build_guides` 원고 경로로 발행했음. 포기한 것은 빌드타임 인라인 SVG 차트뿐이고, 차트가 필요할 만큼 사례가 늘면 되살림. 근거·대가는 [`work-log.md`](work-log.md)

### T3. 첫 배포 — **완료 (2026-08-17)**

`https://autoeda.tyoujungzz.workers.dev` 공개됨. 색인 인프라 검증 전량 통과 — 로컬 `wrangler dev` 결과와 엣지 동작이 갈리지 않았음.

- [x] 확장자 없는 URL 6종 200 · `.html` 은 307 · `/index.html` 은 301 · 없는 경로는 404 페이지
- [x] `_headers` 6개 헤더 전부 적용 (CSP·HSTS·Referrer·nosniff·X-Frame·Permissions)
- [x] 정적 자산 Content-Type 정상 (Worker `text/javascript`, sitemap `application/xml`, finding-map `application/json`)
- [x] `sitemap.xml` 의 URL 2건이 **리디렉션 0회로 200** — 형제 프로젝트의 sitemap 전량 무효 원인을 회피함
- [x] `.assetsignore` 가 실제로 막음 — `docs/` `tests/` `scripts/` `package.json` `wrangler.jsonc` `README.md` `_headers` 전부 404
- [x] 색인 신호 — 홈 canonical·WebSite·Organization·FAQPage, 정책 4종 `noindex, follow`, 도구 페이지 robots 태그 없음(색인 대상)
- [x] 엣지에서 도구 실기 — CP949 파일 → `euc-kr` 감지, 301행, Health 88, 발견 8건, 차트 8개, 콘솔 오류 0건
- [ ] GSC 속성 등록 · **sitemap 재제출**(30 URL) · 신규 콘텐츠 URL 색인 요청 ([`content-strategy.md` §7](content-strategy.md) 게이트) — **Google 계정 필요, 직접 수행할 사항.** 커스텀 도메인으로 옮길 예정이면 도메인 확정 뒤에 등록할 것

### T3.5 내부 링크 404 — **해소 (2026-08-17)**

허브 2편을 발행하고 미발행 해설 링크에 게이트를 걸어 죽은 링크를 없앴음. **전 페이지 내부 링크·전역 메뉴 항목 전수가 리디렉션 0회로 200임**(로컬 확인).

| 위치 | 조치 |
|---|---|
| 헤더 nav · 전역 메뉴 · 랜딩 본문 · 404 안내 | `/pages/guide`·`/pages/case` 를 실제로 발행 |
| 발견 목록 `자세히 →` | `data/published.json`(build_guides 산출물)에 있는 슬러그만 링크. 미발행이면 링크를 렌더하지 않음 |

발행한 2편은 하위 목록 없이도 성립하는 글임 — 사례 0편 상태의 빈 목록은 "미완성 페이지"이고 "준비 중" 문구는 안티패턴 #5 이므로 둘 다 쓰지 않았음. 경위와 함정 3건은 [`work-log.md`](work-log.md).

### T4. Phase 1.5 — 콘텐츠 발행

[`content-strategy.md`](content-strategy.md)가 인벤토리·작성 순서·안티패턴의 확정본임. 원고는 초안을 만들고 검토받는 방식으로 진행함(T5 결정).

**발행 완료 — 해설 20편 + 사례 4편(허브 1 + 리포트 3) = 24편 (2026-08-18)**

| 순서 | 대상 | 상태 |
|---|---|---|
| 1 | K1 `/pages/guide` 인덱스 · K2 `csv-encoding` · K3 `korean-public-data` | ✅ |
| 2 | Q1 `missing-types` · Q2 `missing-imputation` · Q5 `high-cardinality` · D1 `skewness` · D3 `outlier-methods` · R2 `multicollinearity` · R5 `data-leakage` · T1 `class-imbalance` | ✅ |
| — | 사례 허브 `/pages/case` (EDA 리포트를 읽는 법) | ✅ |
| 3 | 사례 리포트 `bike-sharing` · `bank-marketing` · `air-quality` | ✅ **UCI CC BY 4.0 3편** |
| 4 | Q3 `duplicate-rows` · Q4 `constant-columns` · Q6 `id-columns` · R1 `correlation-coefficients` · R4 `categorical-numeric-relation` | ✅ |
| 5 | D2 `kurtosis` · D4 `outlier-removal` · D5 `histogram-bins` · R3 `correlation-causation` | ✅ **도구가 발화시키는 4편** |
| 5 | T2 `target-distribution` · T3 `scaling` | 보류 — Phase 2 타깃 기능 전까지 발화하지 않음 |
| 5 | 국내 공공데이터 사례 | 미착수 — 데이터셋 미선정([`data-sources.md §4`](data-sources.md)) |

**콘텐츠 게이트 충족** ([`content-strategy.md` §7](content-strategy.md)) — 편수 **24/15**, 분량 **42,728/25,000자(171%)**, 800자 미달 0건. 실측값은 `npm run build` 의 분량 합계 줄이 원천임.

> 이전 판은 *"잔여 해설 3편이면 분량도 2만자를 넘김"* 이라고 적었으나 **게이트 값은 2만자가 아니라 25,000자**임. 편당 평균 1,550자 기준으로 3편(21,700자)으로는 미달이라 5편을 썼음. 편수와 분량을 따로 세는 것을 잊지 말 것.

**Phase 1 에서 발화하는 Finding 유형은 해설이 전부 붙었음.** `data/finding-map.json` 의 슬러그 중 미발행은 T2·T3 둘뿐이며, 이 둘은 타깃 지정(Phase 2) 전까지 발화하지 않음.

**사례 리포트는 `build_cases.py` 가 아니라 `build_guides` 원고 경로로 발행했음** — 결정 근거·대가·함정은 [`work-log.md` 2026-08-18](work-log.md). 수치는 pandas 로 다시 계산하지 않고 `js/worker/analyze.worker.js` 의 `analyze` 를 Node 에서 그대로 돌려 뽑았음.

**원고 추가 절차**: `data/guide_source/{slug}.md` 를 넣고 **`npm run build`** → 페이지·허브 목록·sitemap·`자세히` 링크가 함께 살아남. 두 빌드를 따로 돌리지 않음 — `build:guides` 만 돌리면 색인 신호가 지워짐 ([`work-log.md` 2026-08-18](work-log.md)).

- 슬러그는 [`screens.md §2`](screens.md) 해설 슬러그 표와 [`data/finding-map.json`](../data/finding-map.json)이 원천임
- 프론트매터: `title` `summary` 필수, `description` `group` 선택 (`group` 은 허브 목록의 묶음)
- 서식: `##` `###` 문단 `-` `1.` 표 `>` 와 인라인 `**굵게**` · `[텍스트](url)` · `해설: {슬러그}` 만. 그 외는 줄 번호와 함께 exit 1. 링크 URL 은 `https://` 또는 `/` 로 시작해야 하고, 링크가 아닌 대괄호는 막힘
- 편당 800자 미달은 빌드가 경고함. 발행하지 않는 것이 정책임 ([`content-strategy.md` §9](content-strategy.md))
- **Finding 3단 문구를 복사하지 않음** (안티패턴 #4). 해설은 왜 그 기준인지·언제 틀리는지·언제 아무것도 하지 않아도 되는지를 다룸

### T5. 미결 결정

목록과 상세는 [`direction.md` §9](direction.md)가 확정본임. **작업을 막고 있는 순서**로 적음.

| 결정 | 막고 있는 것 | 판단 시점 |
|---|---|---|
| ~~콘텐츠 작성 분량·주체~~ | — | **결정됨 (2026-08-18)** — 초안 작성 후 검토. 작성 순서 1~2 완료로 실행 가능성 확인됨 |
| ~~데이터셋 이용 조건 판정~~ | — | **결정됨 (2026-08-18)** — UCI CC BY 4.0 3건 채택, Titanic·Ames Housing 은 조건 불명확으로 제외 ([`data-sources.md §4`](data-sources.md)) |
| 서비스명 | 도메인·브랜딩·문구 전반 | 공개 완료 상태이므로 빠를수록 좋음 |
| **커스텀 도메인 취득** | AdSense 신청(`ads.txt` 루트 소유) · GSC 등록 · 서비스명 확정 | **지금** — 콘텐츠 축이 닫혀 이것이 최장 리드타임 항목이 됨 |
| Excel 파서 선정 | 없음 (미해결 시 Phase 1은 CSV 전용) | 사용자 요구가 확인되면 |

### T6. 구현 후 재검토 항목

구현하며 미뤄 둔 판단들. 실사용 데이터가 있어야 결론이 나므로 T1 이후에 봄.

- ~~**상관 히트맵에 열(x축) 이름이 없음**~~ — **해소 (2026-08-18).** 히트맵만 정사각 캔버스로 키우고 열 이름을 −45° 회전해 그림. 폰트를 셀 크기에 종속시켜 겹침을 치수로 막았고, 표시 상한 20열은 그대로 둠. 경위는 [`work-log.md` 2026-08-18](work-log.md). 캔버스는 2026-08-19 에 셀 수치를 넣으며 420×420 → **640×640** 으로 다시 키웠음
- ~~**결과 화면 표시 결함 3건**~~ — **해소 (2026-08-19).** ① 발견 탭 "전체 보기" 버튼이 하단 결과 액션 버튼 줄과 맞닿던 것을 `<p>` 로 감싸 해소 ② 가로 막대의 좌우 레이블 viewBox 잘림을 막대 전용 캔버스(480×260)로 해소 ③ 히트맵 셀에 상관계수를 직접 표기하고 변수별 탭을 2열 그리드 + 넓은 본문 폭(1200px)으로 재배치. pairplot(산점도 행렬)은 **추가하지 않음** — "모든 그래프를 그리지 않는다"(정보 과부하 G2)는 [`chart-select.js`](../js/domain/chart-select.js) 의 전제와 정면으로 어긋나고, 히트맵 + 상관 상위 6쌍 산점도가 같은 역할을 함. 경위는 [`work-log.md` 2026-08-19](work-log.md)
- ~~**`F-MIXED-RELATION` 존치 여부**~~ — **폐지 (2026-08-18).** 발견에서 걷어내고 같은 안내를 관계 탭 상단 고정 문구로 옮김(해설 R4 링크 유지). Finding 19종 → **18종**. 근거는 [`rules.md` §6.3](rules.md)·[`work-log.md`](work-log.md)
- **자체 판단 임계값 재보정** — 결측 20%·상수 95%·왜도 2 등 ([`rules.md` §6.2](rules.md)). 실데이터에서 너무 자주/드물게 발화하면 조정
- **준상수 열의 `F-CONST-COL` 문구** — 완전 상수와 준상수를 같은 문구로 다룰지 ([`rules.md` §6.3](rules.md))
- **`data-model.md` §8 미해결** — `classDistribution` 크기 상한(고카디널리티 타깃). Phase 2 타깃 기능 착수 시
- ~~**[`DESIGN.md`](DESIGN.md) 구조 항목 미반영**~~ — **해소 (2026-08-19).** 히어로 40/60 분할(40% 칸은 사진 대신 결과 미리보기 카드) · 랜딩 중간 전면 폭 feature band · 플로팅 CTA 3종을 반영했음. 손으로 쓴 HTML 7개와 `build_guides` 템플릿을 함께 고쳤고, 공용 스크립트 폐합을 테스트로 고정했음. 근거·함정은 [`work-log.md` 2026-08-19](work-log.md)

---

### T7. 진단에서 조치로 — 전처리 파이프라인 + 타깃 기반 EDA

**1단계(전처리) 완료 (2026-08-19). 2단계(타깃 기반 EDA) 완료 (2026-09-02).**

**문제.** 도구가 데이터 상태를 알려주기만 하고 아무것도 바꾸지 못함. Finding 의 "무엇을 하면 되는지"가 문장으로만 존재해 사용자는 조치를 하려면 사이트를 떠나 코드를 써야 함. 이상치 제거·스케일링이 사이트에서 바로 되지 않으면 진단 자체의 쓸모가 반감됨.

**당시 확인됐던 것** — 축 3(타깃 기반 EDA)의 규칙 엔진은 **이미 구현돼 있는데 죽어 있었음**(2단계에서 해소):
- `js/domain/finding.js:213-270` 의 `F-LEAKAGE`·`F-CLASS-IMBALANCE`·`F-TARGET-SKEW`·`F-SCALE-DIFF` 가 `target` 인자에 걸려 있으나 타깃을 지정할 UI 가 없었음 → 개요 탭 "타깃 열" select 로 해소
- `classDistribution`(`js/domain/stats.js:104`)은 계산 함수만 있고 열에 부착되지 않아 `F-CLASS-IMBALANCE` 가 조건 자체에 도달하지 못했음 → `analyze.worker.js` 의 `attachTargetInfo()` 가 분류 타깃에만 부착하도록 해소
- 해설 `target-distribution`·`scaling` 은 `data/finding-map.json` 이 가리키는데 미발행이라 "자세히" 링크가 뜨지 않았음 → 두 편 발행으로 해소

**순서**: 1단계 전처리 → 2단계 타깃 EDA. [`direction.md §4`](direction.md) 기준으로 Phase 3 후보(전처리 지원)를 Phase 2 앞으로 당기는 결정임.

#### 지켜야 할 계약 (T7 전체에 걸림)

1. **원본 무수정** — 원본 파일을 건드리지 않고 새 CSV 만 만듦 ([`direction.md §8`](direction.md))
2. **변환된 데이터도 저장·전송하지 않음** — Worker 메모리에만 두고 `sessionStorage` 에 넣지 않음. 사용자가 내려받는 순간만 메인 스레드를 지나감 ([`implementation-status.md §2`](implementation-status.md) 규약 8)
3. **자동으로 고치지 않음** — 기본 레시피는 비어 있고 모든 조치는 사용자가 명시적으로 켬. 조치마다 대가(정보 손실·분산 축소 등)를 함께 표시함
4. `js/domain/*` 순수 함수 유지 · 임계값은 `thresholds.js` 에만

#### 1단계 — 전처리 파이프라인 — **완료 (2026-08-19)**

산출물: `js/domain/transform.js`(변환 엔진 7종) · `js/domain/recipe.js`(발견→조치 매핑) · `parse.serializeCsv` · `worker.profile()` 분리 + `preprocess`/`export-csv` 메시지 · 전처리 탭 + 발견 탭 `조치 담기`. 테스트 312건(신규 39건). 경위는 [`work-log.md` 2026-08-19](work-log.md).

**1.1 파이프라인 재구성 (선행).** `analyze.worker.js` 의 `analyze()` 가 decode→parse→infer→stats→quality→finding 을 한 함수에 갖고 `parsed` 를 버림. 파싱 이후 단계를 변환된 데이터에 다시 돌려야 하므로 분리함.

```js
export function profile(parsed, { typeOverrides, target, onProgress, isCancelled })
  → { columns, correlations, dataset, health, findings }
// analyze() = FILE_LIMIT 검사 + decode + parseCsv + profile(...)
```
- `analyze()` 의 인자·반환 형태는 바꾸지 않음 (`tests/contracts.test.js`·기존 호출부 유지)
- `parsed` 를 Worker 가 붙들 수 있게 선택 옵션 `onParsed(parsed)` 추가 — `onProgress` 와 같은 패턴이며 메시지 글루만 씀
- Before/After 를 **같은 엔진으로 다시 계산**하게 만드는 핵심. 별도 통계 경로를 만들지 않음

**1.2 새 도메인 모듈 (전부 순수 함수)**

| 파일 | 역할 |
|---|---|
| `js/domain/transform.js` | `applyRecipe(parsed, columns, recipe)` → `{ names, columns, rowCount, log }`. 입력 배열을 변형하지 않고 새 배열을 만듦 |
| `js/domain/recipe.js` | `suggestSteps(findings, columns)` — Finding → 조치 스텝 제안. `normalizeRecipe(steps)` — 순서 정규화·유효성 검사 |
| `js/domain/parse.js` (추가) | `serializeCsv(names, columns, rowCount)` — RFC 4180 인용. `parseCsv` 의 짝이라 같은 파일 |

스텝은 배열이지만 **삽입 순서와 무관하게 아래 정규 순서로 적용함** — 대치 전 스케일링 같은 무의미한 조합을 구조로 막음.

| 순서 | op | 파라미터 | 대응 Finding |
|---|---|---|---|
| 1 | `drop-duplicates` | — | `F-DUP-ROW` |
| 2 | `drop-column` | `column` | `F-CONST-COL` · `F-ID-COL` · `F-HIGH-CARD` |
| 3 | `impute` | `column`, `method: median\|mean\|mode\|constant`, `value?` | `F-MISSING-HIGH` · `F-MISSING-IMPUTE` |
| 4 | `outlier` | `column`, `action: clip\|drop-rows` (IQR 1.5배) | `F-OUTLIER-RATE` · `F-OUTLIER-ACTION` |
| 5 | `log1p` | `column` (음수 있으면 거부) | `F-SKEW` |
| 6 | `encode` | `column`, `method: onehot\|ordinal\|frequency` | 범주형 일반 |
| 7 | `scale` | `column`, `method: standard\|minmax\|robust` | `F-SCALE-DIFF` |

- 이상치 경계는 `js/domain/outlier.js` 의 `iqrOutliers()` 를 그대로 씀 — **판정과 조치가 같은 정의를 쓰게 함**
- 분위수·평균·표준편차는 `js/domain/stats.js` 의 `numericStats`·`quantile` 재사용
- `applyRecipe` 는 각 스텝의 **적합 파라미터**(대치값·IQR 경계·평균/표준편차·인코딩 사전)를 `log` 에 담아 돌려줌 — 사용자가 테스트 세트에 같은 변환을 적용하려면 이 값이 필요함
- `encode: onehot` 고유값 상한 등 새 임계값 `PREPROCESS` 를 `thresholds.js` 에 추가하고 [`rules.md`](rules.md) 에 표로 폐합

**1.3 Worker 프로토콜 확장** ([`data-model.md §5`](data-model.md))

| 방향 | 타입 | 페이로드 |
|---|---|---|
| Page → Worker | `preprocess` | `{ recipe }` → 변환 후 `profile()` 재실행 |
| Worker → Page | `preprocessed` | `{ result, log }` — result 는 §3 결과 JSON(집계만) |
| Page → Worker | `export-csv` | `{ recipe }` |
| Worker → Page | `csv` | `{ text }` — 다운로드 직전에만 건너감. 저장하지 않음 |

- Worker 가 `onParsed` 로 받은 `parsed` 를 모듈 스코프에 붙듦. **메인 스레드로 넘기지 않음** — §5 의 "파싱 결과를 Page 로 넘겨 보관하지 않는다(메모리 이중 보유 회피)" 근거를 그대로 유지하는 방식
- 새 `start`·`cancel` 은 Worker 를 종료·재생성하므로 보유분이 자연히 해제됨. "결과 지우기"(UC-11)에서도 `terminate()` 하도록 추가
- 메모리 — 변환 결과는 별개 사본이라 최대 2배. `FILE_LIMIT` 25MB 가 경계를 잡지만 한계로 명시함

**1.4 UI — 결과 탭 6번째 "전처리"**

`analyze.page.js` 의 `TABS` 에 `{ id: 'prep', label: '전처리' }` 추가. 기존 탭 기구(`renderResult` 의 `renderers` 맵·`activate`)를 그대로 씀.

- **제안 목록** — `suggestSteps()` 산출물을 카드로. 체크박스 + 방식 select + **대가 한 줄**("평균 대치는 분산을 줄여 상관을 과대평가하게 만듭니다")
- **직접 추가** — 열 select + 연산 select
- **발견 탭 연동** — 각 Finding 카드에 "조치 담기" 버튼. 진단과 조치를 잇는 동선이며 이 작업의 제품적 핵심임
- **적용** → `preprocess` 왕복 → **Before/After 비교표**: Health Score 총점·항목별 감점, 행·열 수, 열별 결측률·왜도·이상치율. `renderQuality` 의 표 구조와 `js/lib/format.js` 재사용
- **정제된 CSV 내려받기** → `export-csv` 왕복 → `Blob` + `URL.createObjectURL` (`exportResult()` 와 같은 패턴)
- 적합 파라미터를 표로 노출하되, **테스트 세트 변환은 이 도구가 대신 해 주지 않는다**는 한계를 함께 적음

**1.5 스키마·문구·문서**
- **`schemaVersion` 1.1 → 1.2** — After 결과의 `dataset` 에 `recipe`(적용 조치 목록) 추가. 내보낸 결과가 원자료인지 전처리 후인지 스스로 밝히게 함. 선택 필드라 major 유지
- **`pages/analyze.html`** — 한계 절의 "결측이나 이상치를 자동으로 고치지 않습니다"는 유지하되 "사용자가 고른 조치만 새 파일로 만들며 원본은 그대로 둡니다"를 덧붙임. FAQ 에 전처리 항목 1개 추가(초기 HTML 색인 코퍼스라 SEO 이득)
- **`pages/privacy.html`** — 정제 파일도 브라우저에서 생성되고 서버로 가지 않는다는 문장 추가. 실제 구현과 일치해야 함
- [`data-model.md`](data-model.md)(§5 프로토콜·§3 `recipe`) · [`rules.md`](rules.md)(전처리 임계값) · [`screens.md §4`](screens.md)(탭 6개) · [`direction.md §4`](direction.md)(앞당긴 근거) · [`implementation-status.md §1`](implementation-status.md) · `work-log.md`

#### 2단계 — 타깃 기반 EDA — **완료 (2026-09-02)**

산출물: `js/domain/stats.js` 의 `numericStatsByClass` · `analyze.worker.js` 의 `attachTargetInfo()`(classDistribution·classStats 부착, schemaVersion 1.3) · 개요 탭 타깃 열 select · 타깃 탭(7번째, 회귀/분류 분기) · 해설 2편(target-distribution·scaling) 발행. 테스트 318건(신규 6건).

- **타깃 지정 UI** — 개요 탭 상단 "타깃 열" select → `start { file, target }` 재계산(기존 `start` 페이로드 재사용, 새 메시지 타입 없음)
- **`classDistribution`·`classStats` 부착** — `attachTargetInfo()` 가 분류 타깃(범주형·불리언)이고 고유값이 `F-HIGH-CARD.uniqueCount`(50) 미만일 때만 붙임. 고카디널리티 타깃·회귀 타깃은 대상 밖 — `data-model.md §3.3`·§8 이 확정본
- **타깃 탭(7번째)** — 타깃 유형 판정 후 분기
  - 회귀(수치): 타깃 분포·왜도 안내(`selectForFinding` 재사용) + 피처별 |Pearson| 순위(`result.correlations` 재사용, 새 통계 없음)
  - 분류(범주·불리언): 클래스 분포 막대 + 클래스별 수치형 요약표(평균·표준편차, `numericStatsByClass` 신규) — η²·Cramér's V 는 범위 밖
- **해설 2편 발행** — `data/guide_source/target-distribution.md`·`scaling.md` 작성 후 `npm run build` 로 발행 완료
- **`F-SCALE-DIFF` 배치**: 타깃과 무관하게 계산되는데도 타깃 지정 시에만 발화하는 상태를 유지하기로 결정(사용자 확인, 2026-09-02) — 기존 문서·테스트와 일치하는 보수적 선택. 코드 변경 없음

#### 범위 밖 (이번에 넣지 않음)

재현 코드(pandas/sklearn) 생성 · 레시피 JSON 내보내기/불러오기 · η²(범주형-수치형 분산설명력) · 결측 패턴 분석 · AI 해석 레이어. 관계 탭의 범주형 안내 문구(`renderMixedRelationNote`)는 그대로 둠.

**범주형 연관 지표(Cramér's V)는 위 제외 목록에서 빠졌음** — 2026-09-06 T9(아래)에서 T7 과 별개로 관계 탭에 추가함. η²는 여전히 범위 밖 — 그룹별 상관관계(F-INTERACTION-GROUP)가 범주형×수치형 관계의 다른 측면(교호작용)을 이미 다루므로 별도 추가는 보류함.

#### 검증

1. **`npm test`**
   - `tests/transform.test.js` — 연산 7종 산출값, **입력 배열 불변**, 정규 순서 강제, `log` 파라미터 정확성
   - `tests/parse.test.js` 확장 — `serializeCsv` → `parseCsv` **왕복 일치**(인용·구분자·개행·결측)
   - `tests/recipe.test.js` — 조치형 Finding 유형이 전부 스텝으로 매핑되거나 명시적으로 제외됨(`finding-map.json` 폐합 검사와 같은 방식)
   - `tests/integration.test.js` 확장 — `analyze` → `suggestSteps` → `applyRecipe` → `profile` 을 이어 실행하고 **Health Score 개선**을 단정
   - `tests/worker.test.js` — `target` 지정 시 `classDistribution` 부착과 `F-CLASS-IMBALANCE` 발화
2. **왕복 검증(가장 중요)** — 내려받은 정제 CSV 를 도구에 다시 넣으면 **After 통계와 일치**해야 함. 변환 엔진과 직렬화가 동시에 맞아야만 통과함
3. **`npx wrangler dev --persist-to <프로젝트 밖>`** — CSP 적용 상태에서 다운로드(`Blob`+`createObjectURL`)와 새 UI 확인. `npm run serve` 는 CSP 를 재현하지 못함
4. **메모리 실측** — 25MB 근처 CSV 로 적용·다운로드까지. 넘치면 스텝 적용을 열 단위 스트리밍으로 전환
5. **`npm run build`** (2단계) — 해설 2편 발행 후 `published.json` 갱신과 "자세히" 링크 생존 확인

### T8. 결과 요약 공유 링크 (구 개선 제안 S1) — **완료 (실기 검증 2026-09-06)**

산출물: `js/domain/share.js`(`buildShareSummary`·`encodeShareSummary`·`decodeShareSummary`, 순수 함수) · `js/app/analyze.page.js`(`renderSharedSummary`, `init()`의 `?s=` 진입 분기, `share-summary` 버튼 배선, `renderError`에 `SHARE_INVALID` 유형 추가) · `pages/analyze.html`(공유 버튼·상태 문구·FAQ 1건 추가) · `pages/privacy.html`(공유 링크 문단 추가, 최종 개정일 갱신) · 스키마는 [`data-model.md §3.8`](data-model.md), URL 규칙 예외는 [`screens.md §1`](screens.md), Phase 3 안과의 구분은 [`direction.md §2`](direction.md). 테스트 `tests/share.test.js` 15건 신규.

**계약**: 원본 데이터·전체 통계는 담지 않음(Health Score 총점·등급 + 상위 발견 최대 3건의 `what`만). 서버 저장 없음 — URL 자체가 저장소. `decodeShareSummary`는 신뢰할 수 없는 입력(다른 사람이 만든 URL)을 다루므로 모든 필드를 화이트리스트로 검증함(자세한 내용은 `data-model.md §3.8`).

**브라우저 실기 검증 — 완료 (2026-09-06, `npx wrangler dev --persist-to <프로젝트 밖>`)**:
- [x] "요약 공유 링크 복사" → 클립보드에 `?s=...` 형태 URL 복사, 성공 문구 표시 확인
- [x] 그 URL을 새 탭에서 열어 카드 렌더링 확인(품질 점수·등급·상위 발견 3건), 콘솔 오류(CSP 위반 포함) 0건
- [x] `?s=` 뒤에 깨진 문자열을 붙였을 때 상태 D(`SHARE_INVALID` 문구) 진입, "다른 파일 선택" 클릭 후 URL의 `?s=` 제거 확인
- [x] 기존 흐름 회귀 없음 — 이어보기 정상 복원, 전처리 탭이 캐시 결과에 대해 "원본 없어 전처리 불가" 안내를 그대로 표시(공유 버튼 추가가 `canPreprocess` 게이팅에 영향 없음)
- [x] `npm run build` — FAQPage JSON-LD는 `extractFaq()`가 화면 HTML에서 직접 추출해 만들므로 구조적으로 항상 일치함. `pages/analyze.html`에 공유 관련 FAQ 포함 6문항 확인

`navigator.clipboard.readText()`를 진단 스크립트로 직접 호출하면 Chrome 권한 프롬프트가 CDP의 Page·Runtime 도메인을 블로킹함(앱이 쓰는 `writeText()`는 사용자 클릭 컨텍스트라 문제없음) — 클립보드 내용은 읽어오는 대신 동일 인코딩 함수로 만든 URL을 새 탭에서 열어 검증함.

---

### T9. 개요 화면 스크롤 버그 수정 + 다중 컬럼 관계(교호작용) 추가 — **완료 (2026-09-06)**

T7·T8 과 무관한 별도 사용자 요청 2건. 로드맵 순서를 밀어내지 않고 나란히 처리함.

1. **스크롤 버그** — 개요 탭에서 컬럼 타입을 바꿀 때마다(타깃 열 지정 포함) 결과 섹션이 상태 B(진행 화면)로 전환되며 레이아웃에서 사라져 문서 높이가 줄고 스크롤이 맨 위로 튀던 문제. 재계산 재실행(`runWorker(_, {silent:true})`)은 상태 전환 없이 결과 섹션을 유지한 채 `is-recomputing` 표시만 하도록 고쳐 근본 원인을 없앰 — 타입 select 뿐 아니라 T7 2단계에서 추가된 타깃 열 select 에도 같은 수정을 적용함. `js/app/analyze.page.js`·`pages/analyze.html`·`css/style.css`
2. **다중 컬럼 관계** — 관계 탭이 수치형 페어와이즈 상관만 다루던 한계를 메움. 세 갈래: 그룹상관(수치+수치+범주형, Simpson's paradox 유형 탐지) · 편상관(수치 3개, 제3변수 통제) · 범주형 연관성(Cramér's V, 범주형+범주형 — 원래 T7 범위 밖으로 제외했던 지표지만 이번에 별도로 포함함, 위 "범위 밖" 절 참조). 신규 `js/domain/interaction.js` + `correlation.js`(`cramersV`·`categoricalPairs`), 신규 Finding 3종(`F-INTERACTION-GROUP`·`F-INTERACTION-PARTIAL`·`F-ASSOC-STRONG`), `schemaVersion` 1.3 → 1.4(`associations`·`interactions` 필드 — T7 2단계가 이미 1.3을 썼으므로 그 다음 minor). 계산 비용은 `thresholds.INTERACTION`이 상수 상한을 둠(전수 조합 탐색 금지)
3. Finding 18종 → **21종**. 문서 갱신: `data-model.md`(§2·§3.1·§3.5·§3.6.1·§3.6.2·§4·§6) · `rules.md`(§3.1·§3.4·§3.6·§4·§4.6) · `screens.md`(관계 탭) · `finding-map.json` · 본 문서(위 "범위 밖" 절)

---

### T10. 용어집 검색창 + 면책조항·사이트맵 페이지 추가 — **완료 (2026-09-06)**

T7·T8·T9 과 무관한 별도 사용자 요청 2건.

1. **용어집 검색창** — 용어 40여 개가 한 페이지에 나열돼 있어 원하는 항목을 찾으려면 스크롤에 의존해야 했음. 대소문자 무시 부분 문자열 검색으로 실시간 필터링. 신규 `js/app/glossary.page.js`(`matchesQuery`·`collectTerms`·`applyFilter`), `scripts/build_guides.mjs`의 `page()`에 섹션별 추가 스크립트(`extraScripts`) 훅 신설. 실기 검증 중 결함 1건 발견·수정 — 용어(h3)가 없는 마지막 절("임계값을 그대로 믿지 않는 법")이 검색과 무관하게 항상 남아 "일치하는 용어가 없습니다" 안내와 모순되던 문제. `collectTerms`가 이런 "고아 h2 절"도 독립된 검색 대상으로 다루도록 고쳐 해소함
2. **필수 페이지 5종 → 면책조항 추가, 사이트맵 페이지 신설** — AdSense 체크리스트에서 자주 언급되는 5번째 정책 페이지(면책조항)와 크롤러 탐색을 돕는 HTML 사이트맵을 추가함. `pages/disclaimer.html`(수기, `terms` §2 와 상호 링크) · `pages/sitemap.html`(빌드 생성 — `build_guides.mjs`의 `report`를 원천으로 해설·사례 목록을 만들어 손으로 옮겨 적지 않음). 둘 다 `noindex, follow` + sitemap.xml 제외, CTA 밴드 없음(기존 정책 페이지와 동일 규약). 푸터 링크 2개를 수기 페이지 7개 + `build_guides.mjs` 템플릿에 함께 추가(마크업 중복 규약, `implementation-status.md` §1)
3. 문서 갱신: `content-strategy.md`(§5·§6) · `direction.md`(필수 페이지 수) · `screens.md`(§2·§3.7·§3.8 신설, 이하 절 번호 이동) · `scripts/build_seo.mjs`의 `PAGES`

---

### T11. 차원축소 — 주성분 분석 — 코드 완료, 실기 검증 대기 (2026-09-08)

**문제.** 수치형 열 사이의 관계를 **쌍 단위**로만 다뤘음 — 상관 쌍·VIF·히트맵·상위 6쌍 산점도. 열이 여럿 얽혔을 때 전체 정보가 몇 개의 축에 담겨 있는지 답할 수단이 없었음. 발행된 해설이 이미 그 자리를 가리키고 있었음 — R2(`multicollinearity`)는 다중공선성 조치로 주성분 축약을 제시하고 `scaling` 은 PCA 의 스케일 민감성을 다루는데 **도구는 주성분을 계산해 주지 않았음.** T7 이 해소한 "진단만 하고 조치를 못 함"과 같은 성격의 간극임.

산출물: `js/domain/pca.js`(신규) · `thresholds.PCA` + `DISPLAY_LIMIT.pcaComponents` · `chart-select.selectScree` · `analyze.worker.profile()` 의 `pca` 부착(schemaVersion **1.4**) · 결과 탭 8번째 `차원축소`. 테스트 366건(신규 48건).

#### 결정 (상세 근거는 [`work-log.md` 2026-09-08](work-log.md))

| 결정 | 내용 |
|---|---|
| 배치 | **8번째 탭 신설.** 관계 탭 하위 섹션으로 넣지 않음 — 스크리·누적표·로딩 표가 한 화면을 차지함 |
| 산출물 | 스크리 막대 + 누적 분산표 + 로딩 표. **PC1×PC2 점수 산점도는 넣지 않음** |
| Finding | **신설하지 않음.** 기존 카탈로그·`finding-map.json`·`rules.md §3` 을 건드리지 않고 탭 안 안내 문구로 처리하며 해설 R2 로 링크함 |
| 스케일 | 항상 표준화(= 상관행렬 기준). 선택 토글을 두지 않음 |
| 결측 | listwise. `correlation.vif()` 와 같은 정의 |

점수 산점도를 뺀 결과가 이 작업에서 제일 크게 남음. 주성분 점수는 행 단위 값이라 결과 JSON 에 담으려면 `correlations[].points` 처럼 예외 근거를 따로 세워야 했음. 빼기로 하면서 `pca` 의 모든 필드가 열 수·성분 수에 묶인 집계값이 되었고, 규약 8 이 문구가 아니라 구조로 지켜짐 ([`data-model.md §3.9`](data-model.md)).

#### 범위 밖

주성분 점수 산점도·바이플롯 · 전처리 스텝으로서의 PCA(주성분 열로 CSV 내보내기) · t-SNE·UMAP 등 비선형 축소 · 요인분석(회전).

> ~~해설 원고 신설(기존 R2 로 링크함)~~ — **해소 (2026-09-08).** 해설 P1 `principal-components` 를 발행하고 차원축소 탭의 `자세히 →` 를 그 글로 돌렸음. 해설 허브에 **차원 축소군**이 생겼고(`build_guides.mjs` 의 groups 배열에 등록), 용어집의 차원 축소 절도 이 글을 가리킴. Finding 은 T11 결정대로 신설하지 않았음.

#### 남은 것 — 브라우저 실기 검증

`npx wrangler dev --persist-to <프로젝트 밖>` (`npm run serve` 는 CSP 를 재현하지 못함):
- [ ] 탭이 8개로 뜨고 차원축소 탭의 스크리·두 표가 렌더되는지, 콘솔 오류(CSP 위반 포함) 0건인지
- [ ] 수치형 열 2개 이하 파일 → 안내 문구 경로
- [ ] 결측 많은 파일 → 사용 행·제외 행 수가 실제와 맞는지
- [ ] 수치형 31열 이상 파일 → 축소 문구
- [ ] `multicollinearity` `자세히 →` 링크가 뜨고 200 인지
- [ ] 전처리 적용 후 Before/After 에서 차원축소 탭이 새 결과로 갱신되는지
- [ ] 기존 흐름(내보내기·불러오기·이어보기·공유 링크·전처리) 회귀 없는지
- [ ] 25MB 근처 · 수치형 20열 이상 파일에서 `stats` 단계 소요 시간이 유의하게 늘지 않는지

---

## 3. 완료 이력

결정 근거와 함정은 [`work-log.md`](work-log.md)에 날짜별로 있음. 여기서는 무엇을 끝냈는지만 봄.

| 날짜 | 작업 | 비고 |
|---|---|---|
| ~2026-08-16 | 설계 문서 9종 · 코드 골격 · 계약 테스트 · 배포 설정 | |
| 2026-08-16 | `implementation-status.md` 작성 | 구현 착수 지점 확립 |
| 2026-08-16 | **입력 축** — `decode` · `parse` · `infer` + `format` | 파일 크기 상한 25MB 확정 |
| 2026-08-16 | **통계 축** — `stats` · `outlier` · `correlation` | 추정량 선택을 헤더에 고정 |
| 2026-08-16 | **판정 축** — `quality` · `finding` | Finding 19종 + 3단 문구 |
| 2026-08-16 | **Worker 파이프라인** — 결과 JSON 조립 | 순수 함수 `analyze()`로 분리 |
| 2026-08-16 | **저장소** — 캐시 3단 축소 폴백 | worker 글루 가드 결함 교정 |
| 2026-08-16 | **표현 레이어** — `chart-select` · `chart-svg` | 스키마 폐합 결함 1건 해소(산점도 `points` 신설) |
| 2026-08-17 | **app 배선** — analyze 4상태 · menu · common · contact | Phase 1 런타임 코드 완성 |
| 2026-08-17 | **통합 스모크 도입** — `tests/integration.test.js` | 조립부 결함 3건 발견·수정 |
| 2026-08-17 | **브라우저 실기 검증 (T1)** — 11항목 | 검증 서버를 `wrangler dev` 로 교체, CSS·`hidden` 결함 1건 수정 |
| 2026-08-17 | **`build_seo.mjs` (T2-1)** — 주입·sitemap·검사 게이트 | 테스트 18건 추가(206), 배포 선행 조건 해소 |
| 2026-08-17 | **첫 배포 (T3)** — `autoeda.tyoujungzz.workers.dev` | 색인 인프라 7항목 통과. 내부 링크 404 발견(T3.5) |
| 2026-08-17 | **`build_guides.mjs` + 허브 2편 발행 (T2-2·T3.5)** | 테스트 22건 추가(236). 디렉토리 인덱스 307 함정 해소, 죽은 링크 0건 |
| 2026-08-18 | **해설 10편 발행 (T4 작성 순서 1~2)** | 해설 11편 달성. 색인 14 URL, 17,249자(게이트 69%) |
| 2026-08-18 | **디자인 개편 — [`DESIGN.md`](DESIGN.md) 토큰·컴포넌트 적용** | 자체 호스팅 폰트 도입, 다크 토큰 제거, 히트맵 배색 교체. 실기 10페이지 + 도구 5탭 확인 |
| 2026-08-18 | **해설 5편 발행 (T4 작성 순서 4)** — Q3·Q4·Q6·R1·R4 | 품질군 6편 완결. **콘텐츠 게이트 충족** 17편·25,596자, 색인 19 URL. 발견 링크 3→7건 |
| 2026-08-18 | **색인 신호 회귀 복구 + 산출물 폐합 테스트** | `build:guides` 단독 실행으로 17페이지의 SEO 블록이 삭제된 상태를 복구. 테스트 3건 추가(239건)와 `npm run build` 신설로 재발을 막음 |
| 2026-08-18 | **재배포 + 배포본 검증 9항목** | 엣지에서 sitemap 19 URL 리디렉션 0회 200 · 색인 신호 전수 · 폰트 캐시 · CSP 위반 0건 · 도구 실기 전부 통과. 배포 직전까지 프로덕션이 canonical 없이 서빙되고 있었음(51건 실패 → 0건) |
| 2026-08-18 | **필수 페이지 확정 (Step 2)** | `privacy`·`terms` 시행일 확정, 광고 쿠키·맞춤 광고 해제 고지와 개인정보보호법 기재사항 5개 절 추가. `준비 중` 문구 0건 |
| 2026-08-18 | **사례 리포트 3편 + 해설 4편 발행 (Step 5)** | 24편·42,728자(게이트 171%), 색인 27 URL. 렌더러에 인라인 링크·하위 문서 해설 링크 추가, 테스트 255건 |
| 2026-08-18 | **T6 재검토 2건 — 히트맵 축 레이블 · `F-MIXED-RELATION` 폐지** | 히트맵 전용 캔버스·회전 레이블·셀 종속 폰트, 발견 19종 → 18종 + 관계 탭 고정 안내. 테스트 260건 |
| 2026-08-19 | **DESIGN.md 구조 3종 반영 — 히어로 40/60 · feature band · 플로팅 CTA** | DESIGN.md 미반영 항목 0건. 손으로 쓴 HTML 7개 + `build_guides` 템플릿 수정, `js/app/float-cta.js` 신설. 공용 스크립트 산출물 폐합 테스트 추가(262건), 색인 코퍼스 66,048자 |
| 2026-09-08 | **밀린 것 닫기 — 계약 구멍·HTTP 검증·문서 정합** | `share.js` 가 순수성 검사에서 빠져 있던 것을 등록하고 폐합 검사 신설(368건). `wrangler dev` HTTP 7항목 통과. 랜딩·README 기능 표 5→8행, 문서 8종 수치 정합 |
| 2026-09-08 | **해설 P1 `principal-components` 발행** | 차원 축소군 신설(허브 5→6그룹), 차원축소 탭·용어집 링크 전환, 상호 링크 2건. 28편·48,125자(게이트 193%), 색인 30 URL |
| 2026-09-08 | **차원축소 탭 — 주성분 분석 (T11)** | `pca.js` 신설(Jacobi 고유분해), 결과 탭 8개, schemaVersion 1.4. 점수 미탑재로 결과 JSON 이 집계값만 유지. 테스트 366건(신규 48건) |

### 이 과정에서 확인된 것

- **폐합 검사가 세 번 모두 결함을 잡음** — 규칙이 참조하는 지표가 스키마에 없는 유형. 세 번째는 산점도 점 데이터였음 ([`rules.md` §3.6](rules.md) 이력)
- **통합 스모크가 유닛 테스트의 사각을 드러냄** — 172건 전부 통과하는 상태에서 조립부 결함 3건이 나왔음. 계층을 이을 때마다 반복함
- **실기 검증은 CSS↔JS 상호작용을 드러냄** — 188건 전부 통과하고 JS 도 명세대로 동작하는데 CSS 한 줄이 `hidden` 을 이겨 메뉴가 항상 열려 있었음. Node 테스트로는 원리상 잡을 수 없는 층임
- **검증 서버가 검증 항목을 좌우함** — CSP·확장자 없는 URL 은 그것을 재현하는 서버에서만 확인됨. 검증 대상에 맞는 서버를 고르는 것이 검증의 일부임
- **307 리디렉션은 확장자를 없애도 다른 경로로 재발함** — 디렉토리 인덱스(`pages/guide/index.html`)가 트레일링 슬래시 307 을 만들었음. 회피 규칙(확장자 금지)을 지키는 것과 **결과를 실측하는 것**은 다른 일임
- **링크는 목적지까지 눌러 봐야 검증됨** — 헤더·sitemap 이 200 이어도 화면에 깔린 링크는 별개임. `grep -oh 'href="/[^"]*"'` → 전량 curl 을 배포 검증 절차에 넣음

---

## 4. Phase 2 이후

착수 전에 재검토함 — 구현 전에 폐기될 수 있으므로 상세 명세를 만들지 않음 ([`README.md` §문서를 고칠 때](README.md)). 범위의 확정본은 [`direction.md`](direction.md)임.

**Phase 2** 단계별 가이드 UI · ~~타깃 기반 EDA~~(**완료 — T7 2단계, 2026-09-02**) · AI 해석 레이어(BYO API Key) · 대용량 샘플링
**Phase 3 후보** AI 질의응답 · 데이터셋 비교 · ~~전처리 지원~~ · 시계열 분석 · 분석 이력 비교 · **PCA 외 차원축소 기법**(§5 F4)

> **전처리 지원은 T7 로 앞당겼음 (2026-08-19).** 진단만 하고 조치를 못 하면 진단의 쓸모가 반감된다는 판단이며, 같은 작업의 2단계로 Phase 2 의 타깃 기반 EDA 를 함께 처리함. 근거는 위 T7.

---

## 5. 개선 제안 후보 (2026-09-03)

사이트 개선 리뷰(애드센스/서비스/기능 관점)에서 나온 후보 6건. 나머지 5건은 **아직 착수 결정 아님** — §4 와 같은 성격으로, 우선순위·구현 방법을 사용자와 확인한 뒤 T 항목으로 승격함.

### 서비스 측면 — 재방문·바이럴 유인

| # | 항목 | 해결 방향 | 기존 결정과의 관계 |
|---|---|---|---|
| ~~S1~~ | ~~결과 요약 공유(링크)~~ | **T8 로 승격, 완료 (2026-09-06)**. 상세는 [T8](#t8-결과-요약-공유-링크-구-개선-제안-s1--완료-실기-검증-2026-09-06) | Phase 3 "결과 링크 공유"(D1 전제)와 구분되는 백엔드 0 안으로 구현함 |
| S2 | 최근 분석 이력(localStorage) | 파일명·Health Score·타임스탬프만 저장(원자료·컬럼값 아님). 도구 화면에 "최근 분석" 목록 표시. 삭제 수단은 [`direction.md §8`](direction.md) "보존" 요구사항의 기존 삭제 UI 재사용 | 신규 결정 필요 없음 — 기존 `localStorage` 저장 원칙과 충돌 없음 |
| S3 | 샘플 데이터 원클릭 체험 | 이미 발행된 사례 데이터셋(`bike-sharing`·`bank-marketing`·`air-quality`) 중 1개를 도구 화면에서 파일 선택 없이 바로 로드하는 버튼. 기존 `analyze` 파이프라인·파일 선택 경로 그대로 사용 | 사례 리포트(정적 문서)와는 별개 동선 — 도구 화면 안에서의 전환 유도. 라이선스는 이미 판정된 UCI CC BY 4.0 데이터셋 재사용이라 추가 검토 불필요 |

### 기능적 측면

| # | 항목 | 해결 방향 | 기존 결정과의 관계 |
|---|---|---|---|
| F1 | Excel 파서 우선순위 상향 | 구현이 아니라 **결정 촉진**: 순수 클라이언트사이드로 동작하는 파서 후보를 라이선스·번들 크기 기준으로 좁혀 [`tech-stack.md §9`](tech-stack.md)의 미결정을 해소 | [`direction.md §9`](direction.md) 미결정 3번과 동일 항목. 우선순위만 상향 요청 |
| F2 | 25MB 초과 시 샘플링 완화책(선행 버전) | 정식 샘플링 전략(층화 등) 대신 "상위 N행만 읽고 안내 문구 표시"하는 최소 버전. 현재 `FILE_TOO_LARGE` 완전 차단 경로([`data-model.md §5.1`](data-model.md), `js/domain/thresholds.js` `FILE_LIMIT`)를 경고 후 진행으로 변경 | [`direction.md §4`](direction.md) Phase 2 "대용량 자동 샘플링"의 **축소 선행판**. 정식 샘플링을 대체하지 않음 |
| F3 | 전처리 레시피 로컬 JSON 내보내기/불러오기 | `js/domain/recipe.js`의 정규화된 스텝 배열을 JSON 직렬화/역직렬화만 추가. 서버 전송 없음, 원본 무수정 원칙과 무관 | **T7 §"범위 밖"에서 이미 제외된 항목** — 이 제안은 그 결정을 재검토 요청하는 것임을 명시. 재승인 없이 착수하지 않음 |
| F4 | **PCA 외 차원축소 기법** | 아래 §5.1 참조 — 기법마다 성격이 달라 한 줄로 묶이지 않음 | T11 §"범위 밖"에서 제외된 항목. 차원 축소군이 1편뿐인 상태를 메우는 콘텐츠 축과도 맞물림 |

각 항목은 착수 전 우선순위·구현 범위를 다시 확인한 뒤 §2 의 T 번호를 부여함.

### 정리할 것 — 새 제안이 아니라 이미 벌어진 미결 항목

| 항목 | 상태 | 조치 |
|---|---|---|
| ~~T8 실기 검증~~ | **완료 (2026-09-06)** — 5항목 체크리스트 전부 통과, `npm test` 351건 유지 | [T8](#t8-결과-요약-공유-링크-구-개선-제안-s1--완료-실기-검증-2026-09-06) 참조 |
| **관계 탭 신규 Finding 3종의 해설 미발행** | T9(2026-09-06)에서 `finding-map.json`에 슬러그만 등록(`interaction-effects`·`partial-correlation`·`categorical-association`), 원고 없음 | `data/guide_source/`에 3편 작성 → `npm run build`. **Finding 21종 ↔ 해설 22편의 1:1 대응 원칙**([`rules.md` §3.1](rules.md))이 이 3종만 깨져 있음 |

### 개선 제안 후보 (2026-09-06 추가 — T9·T10 작업 중 확인된 것)

| # | 항목 | 해결 방향 | 근거 |
|---|---|---|---|
| S4 | 다중 컬럼 관계 계산의 대용량 실측 | `thresholds.INTERACTION`의 상한(후보 쌍 6·통제 변수 3·그룹 카디널리티 10)은 설계 시점 추정치이고 실측한 적이 없음. 25MB 근처·열 수십 개짜리 CSV로 분석 소요 시간을 재고, 필요하면 상한을 조정 | T1·T7 1단계가 이미 "메모리 실측"을 별도 항목으로 뒀던 것과 같은 이유 — 이론상 상한을 뒀다는 것과 실제로 안전하다는 것은 다름 |
| S5 | 접근성(a11y) 점검 | 키보드만으로 도구 전체(파일 선택 → 타입 변경 → 탭 전환 → 검색)를 조작할 수 있는지, 색 대비가 WCAG AA를 만족하는지 실기로 확인. 용어집 검색창·플로팅 CTA 등 최근 추가된 상호작용 요소부터 우선 점검 | 이 프로젝트가 아직 명시적으로 점검한 적이 없는 축임(T1 체크리스트에도 없음). AdSense 심사·일반 UX 품질 양쪽에 도움 |

두 항목 모두 **아직 착수 결정 아님** — S4는 실측만으로 끝날 수도, 상한 조정이 필요할 수도 있음. S5는 점검 결과에 따라 범위가 크게 달라져 사전 견적이 어려움.

### 5.1 F4 상세 — PCA 외 차원축소 기법

T11 은 **선형·비지도·전역 분산 최대화**라는 한 갈래만 구현했음. 나머지 갈래는 성격이 제각각이라 "차원축소를 더 넣는다"로 묶으면 안 되고, 갈래별로 따로 판단해야 함.

| 갈래 | 후보 | 이 프로젝트에서 걸리는 것 |
|---|---|---|
| 비선형 임베딩 | t-SNE · UMAP | **결과 JSON 에 담을 것이 점밖에 없음.** PCA 는 고윳값·로딩이라는 집계값을 내지만 t-SNE·UMAP 은 산출물이 **행 단위 좌표뿐**이라, T11 이 지킨 "행 단위 값을 담지 않는다"(→ [`data-model.md §3.9`](data-model.md))와 정면으로 부딪힘. 재현성도 없어(난수 초기화·perplexity·n_neighbors) "같은 파일이 같은 결과를 준다"는 전제가 깨짐. O(n²) 라 25MB 상한 안에서도 무거움 |
| 회전·요인 모형 | 요인분석 · Varimax 회전 | PCA 와 계산은 비슷하지만 **모형 가정이 다름**(공통요인 + 고유분산). 해석 가능성은 PCA 보다 나으나 요인 수를 먼저 정해야 하고, 그 판단이 통계가 아니라 도메인 몫임 |
| 변수 선택 | 분산 임계 · 상관 기반 제거 · VIF 반복 제거 | **새 축을 만들지 않으므로 열 이름이 살아남음.** 해석이 목적일 때 PCA 의 대안이며 계산도 가장 가벼움. 이미 있는 `correlation.vif` 와 전처리 스텝(`drop-column`)을 조합하면 되므로 **구현 부담이 가장 작은 후보** |
| 지도적 축소 | PLS · LDA | 타깃을 보고 축을 만듦. 해설 P1 이 지적한 "PCA 는 타깃을 보지 않는다"의 정확한 대응책이지만, 타깃 지정(T7 2단계)에 종속되고 누수 위험을 함께 다뤄야 함 |

**착수한다면 순서는 변수 선택 → 지도적 축소** 라고 봄. 앞의 둘은 기존 계산을 재조합하는 수준이고 산출물이 전부 집계값이라 기존 계약을 깨지 않음. 반면 t-SNE·UMAP 은 **규약 8 을 다시 열어야 하므로 기능 결정이 아니라 원칙 결정임** — 착수 전에 그 층위에서 먼저 판단해야 함.

콘텐츠 축과도 맞물림 — 지금 차원 축소군은 P1 한 편뿐이라 해설 하위 목록에 형제가 없음. 갈래를 하나 구현하면 해설도 한 편 따라붙어 군이 성립함.

