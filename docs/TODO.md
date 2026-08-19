# 작업 목록

**무엇을 했고, 지금 어디이며, 다음에 무엇을 하는지의 단일 원천임.** 작업을 시작하거나 중단할 때 이 문서를 갱신함.

| 찾는 것 | 문서 |
|---|---|
| 파일별 구현 현황 · 구현 규약 · 실행·검증 명령 | [`implementation-status.md`](implementation-status.md) |
| 결정 근거 · 되풀이하지 말 함정 | [`work-log.md`](work-log.md) |
| 임계값 · 스키마 · 정책 수치 | 각 확정본 ([`README.md` 단일 원천 지도](README.md)) |

여기에는 **작업 항목만** 둠. 수치·규칙·현황 표를 옮겨 적지 않고 링크함.

최종 갱신: 2026-08-19

---

## 1. 지금 어디인가

**Phase 1 완료. Phase 1.5 콘텐츠 작업 완료 — 해설 20편·사례 3편·용어집 발행. 필수 페이지 4종 확정.**

도구·빌드 파이프라인이 닫혔고 해설 20편(K1 인덱스 + 하위 19편)·사례 4편(허브 1 + 리포트 3)이 발행됨. [`content-strategy.md` §8](content-strategy.md) 작성 순서 1~4 완료. **콘텐츠 축은 게이트를 크게 넘겼으므로 남은 관문은 인프라임** — 커스텀 도메인 취득, 광고 배치·`ads.txt`, GSC 등록. 셋 다 콘텐츠가 아니라 사용자 결정·대기에 묶여 있음.

| 지표 | 값 |
|---|---|
| 런타임 코드 | `js/` 18개 모듈 (스텁 0) |
| 빌드 스크립트 | `build_seo` · `build_guides` 완료 / `build_cases` **미구현 — 쓰지 않기로 함**([`work-log.md` 2026-08-18](work-log.md)) |
| 테스트 | 262건 통과 + 실기 11 + 배포본 9 |
| 색인 대상 | **27 URL** — 전수가 리디렉션 0회로 200 |
| 발행 콘텐츠 | **24편 · 42,728자** / 게이트 목표 15편 · 25,000자 — **충족(171%)** |
| 미발행 콘텐츠 | 해설 2편(T2·T3 — Phase 2 타깃 기능 전까지 발화 안 함) · 사례 3편(데이터셋 미선정) |
| 필수 페이지 | **4종 확정** — 시행일·광고 쿠키 고지 기재 완료 |
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
- [ ] GSC 속성 등록 · **sitemap 재제출**(27 URL) · 신규 콘텐츠 URL 색인 요청 ([`content-strategy.md` §7](content-strategy.md) 게이트) — **Google 계정 필요, 직접 수행할 사항.** 커스텀 도메인으로 옮길 예정이면 도메인 확정 뒤에 등록할 것

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

**1단계(전처리) 완료 (2026-08-19).** 2단계(타깃 기반 EDA) 미착수.

**문제.** 도구가 데이터 상태를 알려주기만 하고 아무것도 바꾸지 못함. Finding 의 "무엇을 하면 되는지"가 문장으로만 존재해 사용자는 조치를 하려면 사이트를 떠나 코드를 써야 함. 이상치 제거·스케일링이 사이트에서 바로 되지 않으면 진단 자체의 쓸모가 반감됨.

**동시에 확인된 것** — 축 3(타깃 기반 EDA)의 규칙 엔진은 **이미 구현돼 있는데 죽어 있음**:
- `js/domain/finding.js:213-270` 의 `F-LEAKAGE`·`F-CLASS-IMBALANCE`·`F-TARGET-SKEW`·`F-SCALE-DIFF` 가 `target` 인자에 걸려 있으나 **타깃을 지정할 UI 가 없음**
- `classDistribution`(`js/domain/stats.js:104`)은 계산 함수만 있고 열에 부착되지 않아 `F-CLASS-IMBALANCE` 는 조건 자체에 도달하지 못함
- 해설 `target-distribution`·`scaling` 은 `data/finding-map.json` 이 가리키는데 **미발행**이라 "자세히" 링크가 뜨지 않음

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

#### 2단계 — 타깃 기반 EDA — **다음 차례**

- **타깃 지정 UI** — 개요 탭 상단 "타깃 열" select → `start { file, target }` 재계산. `analyze()` 는 이미 `target` 을 `buildFindings` 로 넘김
- **`classDistribution` 부착** — `columnStats` 이후 **타깃 열에만** 붙임. 이것이 없어 `F-CLASS-IMBALANCE` 가 죽어 있음 ([`data-model.md §3.3`](data-model.md) 이 이미 "타깃 열에만 산출"로 규정)
- **타깃 탭(7번째)** — 타깃 유형 판정 후 분기
  - 회귀(수치): 타깃 분포·왜도 + **피처별 |Pearson| 순위** — `result.correlations` 재사용, 새 통계 없음
  - 분류(범주·불리언): 클래스 분포 막대 + **클래스별 수치형 요약표**(평균·표준편차) — η²·Cramér's V 는 범위 밖이므로 기존 통계만으로 구성
- **해설 2편 발행** — `data/guide_source/target-distribution.md`·`scaling.md` → `npm run build`. `finding-map.json` 이 이미 가리키므로 발행만 하면 링크가 살아남(`published.json` 게이트)
- `F-SCALE-DIFF` 가 `addTargetFindings` 안에 있어 타깃 없이는 발화하지 않음. 스케일 차이는 타깃과 무관하므로 **밖으로 꺼낼지 판단**하고 [`rules.md §3.5`](rules.md) 와 함께 정리

#### 범위 밖 (이번에 넣지 않음)

재현 코드(pandas/sklearn) 생성 · 레시피 JSON 내보내기/불러오기 · 범주형 연관 지표(η²·Cramér's V) · 결측 패턴 분석 · AI 해석 레이어. 관계 탭의 범주형 안내 문구(`renderMixedRelationNote`)는 그대로 둠.

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

**Phase 2** 단계별 가이드 UI · 타깃 기반 EDA(UC-21, T군 Finding 3종이 이미 대기 중) · AI 해석 레이어(BYO API Key) · 대용량 샘플링
**Phase 3 후보** AI 질의응답 · 데이터셋 비교 · ~~전처리 지원~~ · 시계열 분석 · 분석 이력 비교

> **전처리 지원은 T7 로 앞당겼음 (2026-08-19).** 진단만 하고 조치를 못 하면 진단의 쓸모가 반감된다는 판단이며, 같은 작업의 2단계로 Phase 2 의 타깃 기반 EDA 를 함께 처리함. 근거는 위 T7.
