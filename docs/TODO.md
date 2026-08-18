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
| 테스트 | 260건 통과 + 실기 11 + 배포본 9 |
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

- ~~**상관 히트맵에 열(x축) 이름이 없음**~~ — **해소 (2026-08-18).** 히트맵만 정사각 캔버스(420×420)로 키우고 열 이름을 −45° 회전해 그림. 폰트를 셀 크기에 종속시켜 겹침을 치수로 막았고, 표시 상한 20열은 그대로 둠. 경위는 [`work-log.md` 2026-08-18](work-log.md)
- ~~**`F-MIXED-RELATION` 존치 여부**~~ — **폐지 (2026-08-18).** 발견에서 걷어내고 같은 안내를 관계 탭 상단 고정 문구로 옮김(해설 R4 링크 유지). Finding 19종 → **18종**. 근거는 [`rules.md` §6.3](rules.md)·[`work-log.md`](work-log.md)
- **자체 판단 임계값 재보정** — 결측 20%·상수 95%·왜도 2 등 ([`rules.md` §6.2](rules.md)). 실데이터에서 너무 자주/드물게 발화하면 조정
- **준상수 열의 `F-CONST-COL` 문구** — 완전 상수와 준상수를 같은 문구로 다룰지 ([`rules.md` §6.3](rules.md))
- **`data-model.md` §8 미해결** — `classDistribution` 크기 상한(고카디널리티 타깃). Phase 2 타깃 기능 착수 시
- **[`DESIGN.md`](DESIGN.md) 구조 항목 미반영** — 히어로 40/60 분할, 페이지 중간 feature band, 플로팅 CTA. 이번 개편은 토큰·컴포넌트까지만 했음. 구조는 손으로 쓴 HTML 9개 + `build_guides` 템플릿을 함께 고쳐야 하므로 별건으로 둠

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
**Phase 3 후보** AI 질의응답 · 데이터셋 비교 · 전처리 지원 · 시계열 분석 · 분석 이력 비교
