# AutoEDA

정형 데이터(CSV/Excel)의 품질 문제와 주요 통계적 특성을 자동으로 탐지하고, 분석 과정을 단계별로 안내하는 **EDA 지식 베이스 + 실습 도구** 통합 사이트.

도구가 계산을 수행하고, 지식 베이스가 그 결과의 의미를 설명함. 도구는 제품이고 사이트는 리소스임.

> **상태: Phase 1 완료, 배포됨 — <https://autoeda.tyoujungzz.workers.dev>.** CSV 읽기부터 통계·품질 점수·발견 목록·차트·화면 배선까지 구현되어 있고 테스트 236건 · 브라우저 실기 11항목 · 배포본 검증 7항목이 통과함.
> 해설 16편과 사례 허브 1편이 발행되어(색인 19 URL) 죽은 내부 링크는 0건이고, 콘텐츠 게이트(15편·25,000자)를 25,596자로 넘겼음. 남은 것은 사례 리포트 6편과 잔여 해설 6편임.
> 다음 작업은 [docs/TODO.md](docs/TODO.md), 파일별 현황은 [docs/implementation-status.md](docs/implementation-status.md) 참조.
> `AutoEDA`는 동명의 오픈소스 프로젝트가 존재하므로 서비스명 확정 전임.

## 문제 정의

데이터를 처음 받았을 때 필요한 초기 점검(결측·분포·이상치·상관·품질 문제)은 매번 반복되지만, 기존 대안에는 각각의 장벽이 있음.

| 대안 | 장벽 |
|---|---|
| 라이브러리형 (ydata-profiling, DataPrep 등) | 코드 필요. 결과가 방대하고 해석은 사용자 몫 |
| 웹 서비스 (Auto.EDA 등) | 정형 리포트에 그침. 분석 목적·순서가 반영되지 않음 |
| AI 대화형 (ChatGPT, Julius 등) | 질문을 스스로 설계해야 함. 일관성·재현성 부족, API 비용 전가 |
| 공통 | 한국어·한글 데이터 환경(CP949 등) 대응 취약 |

**자동 EDA의 계산 기능 자체는 이미 성숙 단계이므로 차별화 지점이 아님.** 차별화는 결과를 어떻게 이해시키는가에 있음.

## 접근 방식

1. **발견(Finding) 단위 결과 정리** — 통계표를 나열하지 않고 유의미한 사항을 발견 목록으로 승격. 각 항목에 `무엇 / 왜 / 어떻게` 3단 설명과 ML 관점 경고(다중공선성, 클래스 불균형 등) 부착
2. **단계별 분석 가이드** — 결과를 한꺼번에 던지지 않고 STEP 흐름으로 안내. "EDA Dashboard"가 아니라 "EDA 분석 가이드"
3. **타깃 기반 EDA** — 타깃 컬럼 지정 시 분류/회귀를 자동 판별해 목적에 맞는 분석 구성
4. **AI는 선택 레이어** — 기본 EDA는 AI 없이 완결. 사용자 API Key 입력 시에만 자연어 해석 활성화. 원본 데이터가 아닌 집계 통계만 LLM에 전달
5. **한국어 우선** — 한국어 리포트, CP949/EUC-KR 인코딩 자동 감지, 한글 컬럼명·날짜 포맷 처리
6. **지식 베이스 연동** — 모든 Finding 유형이 해설 문서와 1:1 대응하고 양방향 링크로 연결됨. 공개 데이터셋 사례 리포트는 업로드 없이 결과를 확인할 수 있는 데모를 겸함

핵심 설계 원칙: **분석 결과는 JSON, Finding은 규칙 엔진 산출물, 시각화는 표현 레이어.** 정적 HTML 리포트를 그대로 노출하지 않음.

지식 베이스는 별도 작업이 아니라 접근 방식 1의 산출물임 — Finding 해석 문구를 툴팁으로만 소비하지 않고 독립 문서로 발행하는 구조임.

## 분석 흐름

```text
CSV 파일 선택  (업로드 없음 — 파일이 브라우저를 벗어나지 않음)
  ↓
Web Worker: 인코딩 감지 → 파싱 → 타입 추론
  ↓
EDA Engine (JavaScript) → 통계 JSON
  ↓
규칙 엔진 → Finding 목록 + 한국어 해석
  ↓
웹 결과 뷰 (STEP 가이드) ──[자세히]──▶ 해설 문서
  ↓                                      │
(선택) 집계 통계만 → 사용자 API Key       │
       → LLM → 자연어 인사이트            │
                                          ▼
                        [내 데이터로 확인하기] → 도구 화면
```

## 분석 항목 (Phase 1)

| 섹션 | 내용 |
|---|---|
| 개요 | 행·열 수, 데이터 타입 분포, 메모리 사용량, 중복행 |
| 품질 | Dataset Health Score — 결측·중복·상수 컬럼·고카디널리티·이상치 정량화 |
| 발견 | 유의미한 통계적 특징·품질 문제 목록 + 해석·조치 제안 |
| 변수별 | 수치형 기술통계(평균·중위·표준편차·분위), 범주형 고유값·최빈값·빈도, 타입별 자동 차트 |
| 관계 | 상관행렬(Pearson/Spearman), 중요 관계 선별 시각화 |

정보 과부하 방지를 위해 모든 그래프를 생성하지 않고, 통계적 특성으로 선별한 대표 시각화만 제시함.

## 기술 스택

| 역할 | 결정 |
|---|---|
| 배포 | Cloudflare Workers Static Assets (`npx wrangler deploy`) |
| 프론트엔드 | 순수 HTML + 수기 CSS + Vanilla ES Module, MPA. 프레임워크·번들러 없음 |
| **EDA 연산** | **브라우저 JavaScript** (Web Worker). 무료 티어 Worker CPU가 요청당 10ms라 서버 연산이 불가함 |
| 차트 | 자체 SVG 렌더링 (5종) |
| 콘텐츠 생성 | Node 빌드 스크립트 (md → HTML) |
| 사례 리포트 생성 | **빌드타임 Python** (pandas, ydata-profiling) → 정적 HTML 커밋 |
| 백엔드 | **없음.** localStorage + 결과 JSON 내보내기 |

**런타임은 JavaScript, Python은 빌드타임 전용**이라는 이원 구조임. 연산을 브라우저에 두면 서버 비용이 0이고, 파일이 외부로 나가지 않으므로 프라이버시 주장이 수사가 아니라 실제 사실이 됨. 상세와 배제한 대안은 [docs/tech-stack.md](docs/tech-stack.md) 참조.

## 로드맵

- **Phase 1 (MVP)** — CSV 처리·타입 추론·필수 분석 항목·Health Score·Finding 목록·웹 결과 뷰, 필수 페이지 4종, 빌드 시점 HTML 생성 + MPA 구조 · **완료·배포됨**
- **Phase 1.5** — 해설 문서 11편 이상 및 사례 리포트 3편 발행, Finding ↔ 해설 링크 연결, sitemap·색인 · *진행 중 — **해설 16편 완료**, Finding 13종에 해설 연결, 사례는 데이터셋 판정 대기*
- **Phase 2** — 단계별 가이드 UI, 타깃 기반 EDA, AI 해석 레이어(BYO API Key), 비동기 처리, 대용량 샘플링, 내보내기·공유
- **Phase 3 (후보)** — AI 질의응답, 데이터셋 비교, 전처리 지원, 시계열 분석, 분석 이력 비교, 콘텐츠 확장

## 벤치마크

| 대상 | 역할 |
|---|---|
| ydata-profiling | EDA 항목 커버리지 기준선, 데이터 품질 경고 |
| DataPrep.EDA | 기능 구성·메뉴 구조, 대용량 처리 |
| Auto.EDA | 웹 UX, 자동 차트 선택 |
| AutoEDA (OSS) | 전처리 확장 방향 |

"기존 엔진보다 EDA 계산을 잘한다"는 방향은 채택하지 않음. **성숙한 엔진의 산출물을 사용자가 실제 분석 과정에서 이해하고 활용하도록 재구성하는 것**이 목표임.

## 문서

진입점과 단일 원천 지도는 [docs/README.md](docs/README.md) 참조.

| 문서 | 내용 |
|---|---|
| [docs/preinvestigation.md](docs/preinvestigation.md) | 유사 서비스 사전조사, 기능 비교 매트릭스, 갭 분석(G1~G9), 차별화 후보 평가, 수익화 타당성 검토 |
| [docs/direction.md](docs/direction.md) | 제품 정의, 타깃, 차별화 6축, 단계별 범위, 데이터 흐름, 기술 방향 |
| [docs/content-strategy.md](docs/content-strategy.md) | 콘텐츠 인벤토리 28편, 도구↔콘텐츠 연결 구조, 광고·색인 정책, 작성 순서, 안티패턴 |
| [docs/tech-stack.md](docs/tech-stack.md) | 확정 스택, 인프라 제약, 지표별 구현 수단, 디렉토리·배포 구성, 배제한 대안 |
| [docs/use-cases.md](docs/use-cases.md) | 액터 4종, 유스케이스 28건(Phase 1·1.5 상세), 추적 매트릭스 |
| [docs/screens.md](docs/screens.md) | 페이지 12종, 페이지별 기능 명세, 도구 화면 4상태, 상태 저장, 공통 요소 |
| [docs/data-model.md](docs/data-model.md) | 개념 엔티티 다이어그램, 결과 JSON 스키마, 저장소 키, Worker 메시지 프로토콜, 모듈 의존 그래프 |
| [docs/rules.md](docs/rules.md) | Health Score 감점 규칙, Finding 19종 카탈로그, 표시 개수 상한, 문구 템플릿 규칙 |
| [docs/data-sources.md](docs/data-sources.md) | 사례 리포트용 데이터셋 이용 조건 판정 기준·절차, 표시 요건 |

작업 문서 3종 — 코드를 만지기 전에 읽음.

| 문서 | 내용 |
|---|---|
| [docs/TODO.md](docs/TODO.md) | **작업 시작점.** 지금 어디인지, 다음 작업, 완료 이력, 재검토 대기 항목 |
| [docs/implementation-status.md](docs/implementation-status.md) | 파일별 구현 현황, 구현 규약 9건, 실행·검증 명령 |
| [docs/work-log.md](docs/work-log.md) | 구현 중 결정 근거와 되풀이하지 말 함정 |

## 개발

```bash
npm test            # 전체 테스트 236건 (계약·동작·통합·빌드)
npm run serve       # 로컬 서빙 → http://localhost:8000
npm run build:guides # 해설·사례 md → HTML + 섹션 인덱스
npm run build:seo   # canonical·OG·JSON-LD 주입 + sitemap.xml (배포 직전)
npx wrangler deploy
```

연산은 전부 브라우저에서 일어나므로 개발 서버는 정적 서빙만 함. 다만 `npm run serve`는 `_headers`의 CSP도 확장자 없는 URL도 재현하지 못하므로, **그 둘을 확인할 때는 `npx wrangler dev`를 씀.** 상세는 [docs/implementation-status.md §3](docs/implementation-status.md) 참조.

## 비타깃 범위

실시간 스트리밍 데이터, 비정형 데이터(이미지·텍스트·로그), 대규모 DW 연동, 범용 BI 대시보드 구축.

## 미결정 항목

기술 스택은 확정됨. 남은 항목은 아래 4건 (상세와 판단 시점: [direction.md §9](docs/direction.md), [TODO.md T5](docs/TODO.md)).

- 서비스명 (명칭 충돌 해소)
- 커스텀 도메인 취득 시점 (`workers.dev`에서는 `ads.txt` 루트 소유 불가)
- Excel 파서 선정 (미해결 시 Phase 1은 CSV 전용)
- 콘텐츠 작성 분량·주체 (전체 28편 감당 가능 여부)
