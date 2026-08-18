# 기술 스택

- 작성일: 2026-08-15
- 전제: [`direction.md`](./direction.md) 차별화 축, [`content-strategy.md`](./content-strategy.md) 콘텐츠·색인 정책
- 요지: **런타임·빌드타임 모두 JavaScript. 백엔드 없음.** 빌드타임 Python 은 계획했다가 쓰지 않았음 (§3)

---

## 1. 결정 요약

| 역할 | 결정 | 비용 | 선택 근거 |
|---|---|---|---|
| 호스팅·배포 | Cloudflare Workers Static Assets (`npx wrangler deploy`) | 무료 | 형제 프로젝트 3종과 동일 |
| 마크업 | 순수 HTML, MPA (페이지마다 실제 `.html`) | — | 페이지당 고유 URL이 필요한 SEO 전략과 정합 |
| 스타일 | 수기 `css/style.css` | — | TailwindCSS 미도입 (§7). 디자인 확정본은 [`DESIGN.md`](./DESIGN.md) |
| 폰트 | **자체 호스팅** Inter + Noto Sans KR (`fonts/`, 252개 슬라이스 7.7MB) | 무료 | CSP 가 `font-src 'self'` 라 Google Fonts 직접 참조 불가. `scripts/fetch_fonts.mjs` 가 `unicode-range` 슬라이스를 그대로 미러링해 방문당 전송량을 실제 사용 구간으로 제한함 |
| 스크립트 | Vanilla ES Module (프레임워크·번들러 없음) | — | React 미도입 (§7) |
| **EDA 연산** | **브라우저 JavaScript** (Web Worker) | 무료 | 무료 티어 Worker는 요청당 CPU 10ms라 서버 연산 불가 |
| 차트 | 자체 SVG 렌더링 | — | 필요한 차트가 5종뿐이라 라이브러리 불필요 |
| 외부 라이브러리 | **없음 — 전부 자체 구현** | — | CSP 예외·공급망 관리·라이선스 부담이 사라짐. CSV 파서는 RFC 4180을 직접 구현함 |
| 콘텐츠 생성 | Node 빌드 스크립트 (md → HTML) | — | JSON+JS 런타임 렌더는 색인 코퍼스를 만들지 못함 |
| 사례 리포트 생성 | **손으로 쓴 원고 → `build_guides.mjs`** | — | 원래 계획한 빌드타임 Python 을 쓰지 않았음. 수치는 브라우저와 같은 엔진(`analyze`)을 Node 에서 돌려 뽑음 (§3 주석) |
| 상태 저장 | `localStorage` | — | 백엔드 없음 |
| 백엔드 | **없음** (MVP) | 0 | 결과 공유가 실제로 필요해지면 Cloudflare D1 재검토 (§9) |
| 자동화 | GitHub Actions | 무료 | CI (사례 리포트는 원고 기반이라 재생성 대상이 아님) |
| 로컬 확인 | `python -m http.server`, `npx wrangler dev` | 무료 | ES Module은 `file://`로 열리지 않음 |

## 2. 제약 조건 — 왜 이 스택인지

형제 프로젝트(`anime-semantle` / `BDAnalyzer` / `weareants`)와 `project_process.md`(저장소 밖 개인 문서, 현재 경로 미확인)에서 확인한 실측 제약임. 이 표가 §1 결정의 근거 전부임.

| 제약 | 내용 | 스택에 준 영향 |
|---|---|---|
| Worker CPU | 무료 티어 **요청당 10ms** | 서버측 EDA 연산 불가 → 연산을 브라우저로 |
| 자산 한도 | 버전당 20,000 파일, **파일당 25 MiB** | 대용량 WASM 자체 호스팅에 상한 |
| CSP | `weareants`가 `script-src 'self'` 적용 | 외부 CDN·인라인 스크립트 전부 차단. **인라인 핸들러 금지.** `style-src`·`font-src` 도 `'self'` 라 인라인 `style=` 와 외부 웹폰트가 함께 막힘 |
| 초기 로드 | `anime-semantle` 34MB → 이탈 구조. 0.18MB 개선 후에야 홍보 가능 판단 | Pyodide(~30MB) 배제의 결정적 근거 |
| 배포 설정 | 루트 `wrangler.jsonc` 없으면 배포 차단 (2026-07-08 실제 장애) | 필수 파일로 취급 |
| 자산 스캔 | `.gitignore`는 자산 스캔에 영향 없음. `.git/` pack(30MB)이 스캔돼 배포 실패 | `.assetsignore` 필수 |
| URL 정규화 | `html_handling` 기본값이 `.html`을 **307 리디렉션** → GSC 색인 실패 | **모든 내부 URL을 확장자 없이 통일**. `weareants`가 지금 이 문제로 막혀 있음 |
| 색인 코퍼스 | 심사자는 사이트가 아니라 색인된 코퍼스를 본다 | 콘텐츠는 빌드 시점 HTML로 생성 |
| 렌더 텍스트 | `BDAnalyzer` 8페이지 합계 **716자** (전량 JSON+JS 렌더) | 같은 구조를 반복하지 않음 |

## 3. 런타임 / 빌드타임 이원 구조

두 층을 분리하면 위 제약을 모두 회피함. **양쪽 다 JavaScript 임** — 원래는 빌드타임을 Python 으로 두려 했으나 쓰지 않게 되었고(아래 주석), 그 결과 언어가 하나로 줄었음.

```text
┌─ 런타임 — 브라우저, JavaScript ────────────────────────────┐
│  사용자 CSV (파일 선택, 업로드 없음)                        │
│      ↓  Web Worker                                         │
│  인코딩 감지 → 파싱 → 타입 추론 → 통계 → Finding → SVG 차트 │
│      ↓                                                      │
│  결과 화면 (noindex) · localStorage · 결과 JSON 내보내기    │
└─────────────────────────────────────────────────────────────┘

┌─ 빌드타임 — 로컬 / GitHub Actions ─────────────────────────┐
│  해설·사례·용어집 원자료 md                                 │
│    └─[build_guides.mjs]─→ 정적 HTML 24편                    │
│  PAGES 목록 ────[build_seo.mjs]────→ canonical·OG·sitemap   │
│      ↓                                                      │
│  전부 정적 파일로 커밋 → 색인 코퍼스                        │
└─────────────────────────────────────────────────────────────┘
```

**런타임을 브라우저에 둔 부수 효과 3가지**

1. **원본 데이터가 외부로 나가지 않음** — `direction.md` 축 4와 개인정보처리방침의 근거가 수사가 아니라 실제 사실이 됨
2. **업로드 대기 시간이 사라짐** — 성능 목표(10만 행 × 30열 30초)에 오히려 유리
3. **서버 비용 0** — 방치해도 부담이 없는 구조 유지

**빌드타임 Python은 쓰지 않았음**: 사례 리포트도 `build_guides.mjs` 의 원고 경로로 발행함. "자체 데이터에서 실측을 캐고 그 위에 해설을 쓴다"(`project_process.md` §3 유효 패턴)는 그대로 지키되, 실측을 pandas 로 다시 계산하지 않고 **브라우저와 같은 엔진**(`js/worker/analyze.worker.js` 의 `analyze`)을 Node 에서 돌려 뽑았음 — 임계값 단일 원천이 갈라지지 않게 하기 위함. 대가는 빌드타임 인라인 SVG 차트이며 결정 경위는 [`work-log.md` 2026-08-18](./work-log.md).

## 4. 지표별 구현 수단

| 지표 | 수단 | 비고 |
|---|---|---|
| CSV 파싱 | **자체 구현** (RFC 4180) | 인용부호 이스케이프·인용 내 개행·CRLF 혼재·BOM만 처리하면 됨. 의존성 0을 얻는 대신 **엣지케이스 버그를 직접 책임지므로 파서 테스트를 두텁게 씀** |
| **인코딩 감지 (CP949/EUC-KR)** | `TextDecoder('utf-8', {fatal:true})` 실패 시 `TextDecoder('euc-kr')` | 브라우저 내장. euc-kr은 WHATWG 인코딩 표준에 포함되어 CP949를 덮음 — **축 5가 라이브러리 없이 성립** |
| 기술통계·분위수 | **자체 구현** | 평균·표준편차·분위수·적률은 구현이 단순함. 분위수 보간 방식을 문서화해 테스트 기준값과 어긋나지 않게 함 |
| 왜도·첨도 | 자체 구현 (적률 계산) | |
| Pearson·Spearman | 자체 구현 (순위 변환 후 상관) | |
| IQR·z-score 이상치 | 자체 구현 | |
| VIF (다중공선성) | 자체 구현 (회귀 R²의 역수) | 열 수가 적어 정규방정식으로 충분 |
| 열 저장 | `Float64Array` 컬럼 + 문자열 배열 | 10만 × 30 = 300만 값 ≈ 24MB. 브라우저 메모리 내 |
| 차트 | 자체 SVG 렌더링 | 히스토그램·박스플롯·막대·산점도·히트맵 5종 |
| ML | Phase 3에서 필요 시점에 재검토 | Phase 1~2에 ML 요구 없음. "AI는 계산이 아닌 해석"(사전조사 §9.4) 원칙과 정합 |

**포기하는 것**: scipy 계열 고급 검정(ANOVA, Box-Cox 등). 필요해지면 자체 구현함 — 사례 리포트도 같은 엔진을 쓰므로 Python 우회로는 남아 있지 않음.

## 5. 디렉토리 구조

`BDAnalyzer`의 MPA 규약 + `weareants`의 계층 분리를 따름.

```text
AutoEDA/
├── index.html                  # 랜딩 — 도구 진입 + 콘텐츠 허브
├── 404.html  robots.txt  favicon.svg
├── sitemap.xml  ads.txt        # sitemap 은 build_seo.mjs 생성, ads.txt 는 커스텀 도메인 확보 후
├── wrangler.jsonc  .assetsignore  .gitignore  _headers  _redirects
├── package.json                # private, type:module (ESM 테스트에 필요), scripts
├── pages/
│   ├── analyze.html            # 도구 — 4상태 단일 페이지 (색인 ○ / 광고 ×)
│   ├── guide.html  case.html  glossary.html   # 섹션 인덱스 — 디렉토리 index 로 두지 않음(307 회피)
│   ├── guide/*.html            # 해설 19편 — build_guides.mjs 생성
│   ├── case/*.html             # 사례 리포트 3편 — build_guides.mjs 생성
│   └── about.html  contact.html  privacy.html  terms.html   # noindex, follow
├── css/style.css               # 수기 (토큰 → 리셋 → 레이아웃 → 컴포넌트)
├── js/
│   ├── app/                    # Presentation — common.js · menu.js · analyze.page.js · contact.page.js
│   ├── domain/                 # 순수 로직 (DOM·IO 없음)
│   │   ├── thresholds.js       # 판정 임계값 단일 집약 (rules.md §1 규약)
│   │   ├── decode.js  parse.js  infer.js
│   │   ├── stats.js  correlation.js  outlier.js
│   │   ├── quality.js          # Dataset Health Score
│   │   ├── finding.js          # 규칙 엔진 → Finding 목록
│   │   └── chart-select.js  chart-svg.js
│   ├── worker/analyze.worker.js
│   ├── storage/local.js
│   └── lib/format.js           # 표시용 포맷 (여러 화면이 같은 수치를 같게 적도록)
├── data/
│   ├── guide_source/*.md       # 해설 원자료 (사람이 작성, .assetsignore 로 배포 제외)
│   ├── case_source/*.md        # 사례 원고 (index.md 가 허브 본문)
│   ├── glossary_source/*.md    # 용어집 원자료
│   ├── published.json  guide-nav.json   # build_guides 산출 — 발행 슬러그·전역 메뉴
│   └── finding-map.json        # Finding 유형 ↔ 해설 URL 매핑 (스키마: data-model.md §7)
├── scripts/
│   ├── build_guides.mjs        # md → HTML (해설·사례·용어집)
│   ├── build_cases.py          # 미구현·미사용 (§3 주석)
│   └── build_seo.mjs           # canonical·OG·JSON-LD·sitemap (PAGES 가 URL 단일 원천)
├── tests/contracts.test.js     # node --test — 모듈 계약 + 임계값↔문서 대조
└── docs/
```

**외부 라이브러리 디렉토리가 없음**: 전부 자체 구현이므로 `js/vendor/`를 두지 않음. CSP 예외·공급망·라이선스 관리 부담이 사라지는 대신 CSV 엣지케이스를 직접 책임짐(§9).

**핵심 계약**: `js/domain/*`는 DOM·`fetch`·`localStorage`를 참조하지 않음. 순수 함수만 두어 `node --test`로 검증하고, 통계 로직이 표현 레이어 변경에 영향받지 않게 함 — `direction.md §6`의 3층 분리(통계 JSON / 규칙 엔진 / 표현) 원칙의 구현임.

**도구가 단일 페이지인 이유**: 백엔드가 없어 파싱 결과가 메모리에만 존재하므로 페이지를 이동하면 소실됨. 4상태(파일 선택 / 진행 / 결과 / 오류)를 한 페이지에서 전환하고 통계 JSON을 sessionStorage에 캐시함 — 상세는 [`screens.md §4·§5`](./screens.md) 참조. 페이지·화면 구성의 확정본은 `screens.md`이며 이 문서는 디렉토리만 다룸.

**인라인 핸들러 금지**: ES Module은 전역에 함수를 노출하지 않고, CSP가 인라인 스크립트를 차단함. 이벤트는 전부 `addEventListener`로 연결함.

## 6. 배포 구성

```jsonc
// wrangler.jsonc — 루트 필수. 없으면 배포 때마다 임시 config가 생성되어 배포가 막힘
{
  "name": "autoeda",
  "compatibility_date": "2026-08-15",
  "assets": {
    "directory": "./",
    "not_found_handling": "404-page"
  }
}
```

| 파일 | 내용 |
|---|---|
| `.assetsignore` | `.git/`, `.github/`, `scripts/`, `tests/`, `docs/`, `data/guide_source/`, `README.md` |
| `_headers` | 보안 헤더 5종(`X-Content-Type-Options`·`Referrer-Policy`·`X-Frame-Options`·`Permissions-Policy`·HSTS) + 엄격 CSP. 외부 라이브러리가 없으므로 `script-src`에 예외가 불필요하고 `worker-src 'self'`·`form-action 'none'`까지 좁힘 |
| `robots.txt` | `Allow: /` + sitemap 위치. **결과 화면 경로를 `Disallow` 하지 않음** — 크롤이 막히면 Googlebot이 `noindex` 메타를 읽지 못함 |
| `404.html` | `not_found_handling`이 참조 |
| `ads.txt` | 커스텀 도메인 확보 후. `workers.dev` 서브도메인에서는 루트를 소유할 수 없음 |

**URL 규칙 (중요)**: 내부 링크·canonical·sitemap·네비게이션을 **전부 확장자 없이** 씀 (`/pages/guide/multicollinearity`). `.html`을 가리키면 307 리디렉션이 걸려 GSC가 색인하지 못함. `html_handling: "none"`으로 끄는 것은 해법이 아님 — 확장자 없는 URL이 404가 됨.

### CSP가 부과하는 구현 제약 2건

1. **인라인 style 금지** — `style-src 'self'`이므로 `style=` 속성이 차단됨. 자체 SVG 차트는 `fill`·`stroke`·`stroke-width` 같은 **presentation attribute와 class만** 사용함. SVG에서는 이것으로 충분하므로 `'unsafe-inline'`을 열지 않음
2. **인라인 스크립트·핸들러 금지** — `onclick=` 류를 쓸 수 없고 ES Module도 전역에 함수를 노출하지 않으므로 이벤트는 전부 `addEventListener`로 연결함

**AdSense 도입 시**에는 `script-src`·`frame-src`·`img-src`·`connect-src`에 광고 도메인을 추가해야 함. `../weareants/_headers`가 그 목록을 이미 갖고 있어 그때 참조하며, **광고를 실제로 붙이기 전까지는 열지 않음.**

## 7. 채택하지 않은 대안

| 대안 | 배제 이유 |
|---|---|
| **Pyodide** (pandas·scipy·scikit-learn) | 초기 다운로드 ~30MB. `anime-semantle`이 34MB 초기 로드로 이탈 구조였고 0.18MB로 개선한 뒤에야 홍보 가능 판단이 나온 전례가 있음. 이미 비용을 치른 실패의 재현 |
| **DuckDB-WASM** | ~6MB에 SQL 집계 성능이 뛰어나지만 `wasm-unsafe-eval` CSP 완화가 필요하고, 목표 규모(10만 행)에서 JS 대비 이득이 명확하지 않음. 대용량 요구가 실증되면 지연 로드로 재검토 |
| **TailwindCSS** | Play CDN은 CSP `script-src 'self'`에 차단되고, CLI 빌드는 형제 프로젝트 3종의 무빌드 규약에서 이탈함. 도구 사이트 분량에서 수기 CSS로 충분 |
| **React** | 번들러 또는 CSP 예외가 필요하고, 페이지당 고유 URL이 필요한 MPA 전략과 맞지 않음. 결과 화면은 어차피 `noindex`라 SPA로 얻는 SEO 이득도 없음 |
| **FastAPI 등 서버 백엔드** | 무료 티어 Worker CPU 10ms 제약. 별도 호스팅은 서버 비용 0원 원칙 위반 |
| **Firebase Spark** | 업로드 데이터를 서버에 두지 않는 편이 이 프로젝트의 차별화 매재임. 개인정보 국외 이전 고지 부담도 생김. `weareants`도 같은 이유로 해당 계층을 휴면 상태로 둔 상태 |
| **Cloudflare D1** | 결과 링크 공유가 실제로 필요해질 때 도입 검토. MVP에는 불필요 |

## 8. 검증 방법

1. **도메인 로직** — `node --test`로 `js/domain/*` 검증. 손계산한 소형 데이터셋과 대조하고 결측·전체 동일값·단일 행 등 경계 입력 포함
2. **성능** — 10만 행 × 30열 합성 CSV로 30초 내 완료 및 UI 무정지 확인
3. **인코딩** — CP949로 저장한 한글 컬럼명 CSV 자동 감지, UTF-8 BOM 파일 미손상 확인
4. **DOM** — jsdom으로 결과 뷰 렌더링 검증 (`BDAnalyzer` 선례). 태그 짝·이스케이프·`undefined` 미노출
5. **빌드 스크립트** — 산출 HTML의 렌더 텍스트 분량을 집계해 **독자용 25,000자 목표 대비 실측**. 서식 오류는 무시가 아니라 종료 코드 1로 실패 처리 (`BDAnalyzer` `build_notes.py` 정책)
6. **로컬** — `python -m http.server`로 기능, `npx wrangler dev`로 `_headers`·404 동작 확인
7. **배포 후** — CSP 위반 콘솔 오류 0건, 확장자 없는 URL이 307 없이 200 응답, GSC sitemap 제출 후 URL 검사로 색인 확인

## 9. 미해결 리스크

| 리스크 | 대응 |
|---|---|
| **CSV 엣지케이스를 직접 책임짐** | 의존성 0을 택한 대가임. 인용부호 이스케이프·인용 내 개행·CRLF 혼재·마지막 줄 개행 없음·빈 필드를 파서 테스트로 덮어야 함. 실사용에서 깨지면 도구 신뢰가 즉시 무너지는 지점 |
| **Excel 지원 미정** | 자체 구현 방침에서 xlsx는 압축·XML 파싱이 필요해 CSV와 부담이 다름. Phase 1은 **CSV 전용**으로 두고, Excel은 수요 확인 후 라이브러리 도입 여부와 함께 재검토 |
| **AI 레이어 CORS** | 브라우저에서 LLM API를 직접 호출할 때 제공자별 CORS 정책이 다름(일부는 전용 헤더 요구). Phase 2 착수 전 대상 API 확정 및 실측 필요 |
| **`ads.txt` 루트 부재** | `workers.dev` 서브도메인에서는 불가. AdSense 신청 전 커스텀 도메인 취득 필요 (Cloudflare Registrar 연 ~2만원) |
| **자체 SVG 차트 공수** | 축·눈금·툴팁을 직접 구현해야 함. 5종으로 한정하고 공통 축·스케일 모듈을 먼저 만듦 |
| **결과 공유 부재** | 백엔드 0의 귀결. 결과 JSON 내보내기/불러오기로 대체하며, 링크 공유는 Phase 3에서 D1 도입과 함께 재검토 |
| ~~**콘텐츠 분량**~~ | **해소 (2026-08-18)** — 24편·42,728자로 게이트의 171% |
| **인코딩 지원 범위** | `decode.js` 가 UTF-8·EUC-KR 두 가지만 지원함. 서유럽 인코딩 파일을 열지 못해 사례 후보 하나가 보류됐음([`data-sources.md §4`](./data-sources.md)). 오류 화면의 수동 인코딩 선택에 후보를 늘릴지 판단 필요 |
