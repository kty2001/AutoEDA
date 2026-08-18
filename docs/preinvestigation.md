# 사전조사: 자동 EDA 서비스 현황

- 작성일: 2026-08-15
- 조사 목적: 정형 데이터 업로드 → 자동 EDA → 결과 제공 서비스의 기존 대안을 파악하고, 본 프로젝트의 포지셔닝을 정의함
- 조사 범위: 오픈소스 라이브러리, 웹 서비스·플랫폼, AI 대화형 분석 서비스
- 비고: 요금·용량·기능 수치는 조사 시점(2026-08) 공개 정보 기준이며, 인용 전 재확인 필요함
- 결론 요약: **자동 EDA의 계산 기능 자체는 이미 성숙 단계이므로 차별화 지점이 아님. 차별화는 "결과를 어떻게 이해시키는가"에 있음**

---

## 1. 시장 구분

자동 EDA 영역은 세 계층으로 나뉨.

| 계층 | 정의 | 대표 사례 | 주 사용자 |
|---|---|---|---|
| A. 라이브러리형 | 코드 한두 줄로 리포트 생성 | ydata-profiling, Sweetviz, DataPrep.EDA, AutoViz, klib | 데이터 분석가·개발자 |
| B. 웹 서비스·플랫폼형 | 브라우저에서 업로드 후 조작 | YData Fabric, Auto.EDA, AutoEDA(OSS), D-Tale, Mito | 준전문가, 실무자 |
| C. AI 대화형 | 자연어 질의 → 코드 실행 → 해석 제공 | ChatGPT 데이터 분석, Julius AI, Powerdrill, Colab Data Science Agent | 비전문가 ~ 전문가 |

본 프로젝트는 **B 계층을 기반으로 A의 리포트 완결성과 C의 해석 능력을 결합하는 위치**를 목표로 함.

### 유사도 평가

| 서비스 | 형태 | 자동화 수준 | 본 프로젝트와 유사도 | 참고 가치 |
|---|---|---:|---:|---|
| **ydata-profiling** | 라이브러리 | ★★★★★ | ★★★★★ | EDA 항목 구성·데이터 품질 경고의 **핵심 벤치마크** |
| **YData Fabric** | 웹 플랫폼 | ★★★★★ | ★★★★☆ | 업로드→프로파일링 파이프라인 UX. 단 기업용으로 범위 과대 |
| **DataPrep.EDA** | 라이브러리 | ★★★★☆ | ★★★★☆ | **기능 구성·메뉴 구조 벤치마크**, 대용량 처리 참고 |
| **Auto.EDA** | 웹 서비스 | ★★★★★ | ★★★★★ | **웹 UX 벤치마크**. 업로드→AI 요약→자동 시각화 흐름 |
| **AutoEDA (OSS)** | 웹 앱 | ★★★★☆ | ★★★★★ | EDA + 전처리 확장 방향 참고 |
| **D-Tale** | 로컬 웹 UI | ★★★☆☆ | ★★★☆☆ | 인터랙티브 탐색 조작 방식 참고 |
| **Sweetviz** | 라이브러리 | ★★★★☆ | ★★★☆☆ | 타깃 변수 기준 분석, 데이터셋 비교 방식 참고 |

> **명칭 충돌 주의**: `AutoEDA`는 기존 오픈소스 프로젝트명과 동일함. 서비스명 확정 전 검토 필요함.

---

## 2. 계층 A: 라이브러리형

### 2.1 ydata-profiling — 핵심 벤치마크

[공식 문서](https://docs.profiling.ydata.ai/)

Pandas DataFrame을 입력하면 `ProfileReport()` 한 번의 호출로 프로파일링 리포트를 생성함.

**자동 산출 항목**

| 구분 | 항목 |
|---|---|
| 데이터셋 | 크기, 변수 개수, 데이터 타입, 중복 데이터, 메모리 사용량 |
| 변수별 | 결측치, 고유값 개수, 평균·중앙값·최솟값·최댓값, 분산·표준편차, 분위수 |
| 분포 | 변수별 분포, 범주형 변수 빈도 |
| 관계 | 상관관계, 변수 간 상호작용(Interactions) |
| 품질 | 데이터 품질 경고(Alerts) |

리포트 섹션 구조:

```text
Dataset
 ├─ Overview
 ├─ Variables
 ├─ Interactions
 ├─ Correlations
 ├─ Missing values
 ├─ Sample
 └─ Alerts
```

**핵심 관찰 2건**

1. 단순 `describe()` 수준이 아니라 데이터 품질 문제를 자동 탐지해 **Alert** 형태로 제시함(결측, 중복, 높은 카디널리티, 높은 상관 등) → 본 프로젝트도 "통계값을 보여주는 사이트"보다 **"확인해야 할 문제를 알려주는 사이트"** 방향이 맞음
2. 산출 지표를 **JSON 형태로 소비 가능** → 계산 엔진으로 채택하고 표현 레이어를 자체 구현하는 전략이 성립함

**한계**: 대용량에서 급격히 느려짐. 정적 HTML 산출물. 커스터마이즈 난이도 높음. 정보량이 과다해 입문자에게 부담.

### 2.2 DataPrep.EDA — 기능 구성 벤치마크

[공식 문서](https://docs.dataprep.ai/user_guide/eda/introduction.html) · [GitHub](https://github.com/sfu-db/dataprep)

EDA 기능을 목적별 API로 명확히 분리함.

| API | 기능 |
|---|---|
| `plot()` | 변수 분포 분석 |
| `plot_correlation()` | 변수 간 상관관계 분석 |
| `plot_missing()` | 결측값 분석 |
| `plot_diff()` | 두 DataFrame 차이 비교 |
| `create_report()` | 전체 프로파일 리포트 생성 |

이 분리 구조는 서비스 메뉴 구성에 직접 차용 가능함.

```text
EDA
├── Dataset Overview
├── Numerical Analysis
├── Categorical Analysis
├── Missing Values
├── Outliers
├── Correlation
├── Visualization
└── Summary Report
```

Dask 기반으로 Pandas 기반 프로파일링 도구보다 빠른 처리와 인터랙티브 시각화를 강조함. [House Price 사례](https://docs.dataprep.ai/user_guide/eda/house_price.html)에서는 타깃과 각 피처의 관계·상관을 확인하는 방식으로 분석을 진행함.

**한계**: 리포트 항목 범위가 ydata-profiling보다 좁음. 데이터 품질 경고 기능 약함.

### 2.3 기타 라이브러리

| 도구 | 강점 | 한계 |
|---|---|---|
| **Sweetviz** | 데이터셋 간 비교(train/test), 타깃 변수 기준 분석 특화 | 단일 데이터셋 심층 분석은 상대적으로 얕음 |
| **AutoViz** | CSV/TXT/JSON 직접 입력, Bokeh 인터랙티브, 클리닝 제안 | 통계 리포트보다 시각화 중심 |
| **klib** | 결측·상관 시각화 및 정제 유틸리티 간결 | 리포트 도구가 아닌 유틸리티 성격 |

### 2.4 계층 A 시사점

- 통계 계산·플롯 생성 로직은 성숙함 → **직접 재구현 불필요. 엔진은 채택하고 차별화는 상위 레이어에서 추구**
- 공통 한계: "리포트는 나오지만 해석은 사용자 몫"
- ydata-profiling을 1차 기준선으로 삼고, 성능 이슈 발생 시 DataPrep 계열로 대체 검토

---

## 3. 계층 B: 웹 서비스·플랫폼형

### 3.1 YData Fabric

[공식 사이트](https://ydata.ai/products/platform.html)

ydata-profiling의 플랫폼 확장판. 데이터 소스를 연결하면 자동 프로파일링·데이터 품질 분석·데이터 준비를 웹 환경에서 수행함. **"5 clicks → 데이터 프로파일링"** 이라는 UX를 전면에 내세움.

참고할 파이프라인 구조:

```text
사용자 → CSV/Excel 업로드 → 데이터 분석 → EDA 결과 자동 생성 → Dashboard
```

**한계(본 프로젝트 기준)**: 기업용 데이터 품질·AI 데이터 관리 플랫폼이므로 범위가 훨씬 넓음. 개인 사용자의 단발성 분석에는 과대함.

### 3.2 Auto.EDA — 웹 UX 벤치마크

[서비스](https://autoeda.kabillanta.me/)

서비스 형태가 본 프로젝트와 가장 유사함.

```text
Upload Dataset → AI Summary → Automatic Visualization → Correlation Matrix
```

**주목 기능 2건**

1. **AI Summary** — `평균 = 73.2` 를 제시하는 대신, 데이터의 특징을 자연어로 설명함
2. **데이터 타입 기반 자동 차트 선택** — 타입을 판단해 적절한 차트를 자동 생성함

```text
age       → numerical    → histogram
gender    → categorical  → bar chart
income    → numerical    → distribution
gender ↔ income          → relationship chart
```

두 기능 모두 본 프로젝트가 반드시 확보해야 하는 기준선에 해당함(이미 존재하므로 이것만으로는 차별화 불가).

### 3.3 AutoEDA (오픈소스)

[GitHub](https://github.com/Devang-C/AutoEDA)

웹 기반 오픈소스 Auto EDA 프로젝트. EDA에서 **전처리까지 확장**하는 방향임.

- EDA: Dataset Overview, 데이터 구조, 결측치, 변수별 탐색, Histogram, Scatter plot, Correlation heatmap
- 전처리: 이상치 처리, Encoding, Scaling

본 프로젝트의 후속 확장 방향(전처리 지원) 참고 대상임.

### 3.4 기타

| 도구 | 특성 | 한계 |
|---|---|---|
| **D-Tale** | Pandas 연산을 GUI로 노코드 수행. 완전한 인터랙티브 탐색 환경 | 로컬 실행 전제, 공유 기능 약함, 학습 곡선 존재 |
| **Mito** | 스프레드시트 UX + 조작 내역을 Python 코드로 자동 생성 | EDA 리포트가 아닌 데이터 조작 도구 |
| **ILoveCSV 등** | 업로드만으로 리포트 다운로드. 무설치·무코드 | 리포트가 정형적, 도메인 맥락 반영 불가 |
| **오픈소스 EDA 웹앱 다수** | 대부분 Streamlit + ydata-profiling 조합 | 기능 차별화 없음, 확장성 부족 |

### 3.5 계층 B 시사점

- "업로드 → 리포트"는 이미 진입 장벽이 아님. 이 기능만으로는 차별화 불가
- 차별화 지점은 **결과의 구조화·해석·재사용성(공유·이력·재현)**

---

## 4. 계층 C: AI 대화형

| 서비스 | 특성 | 한계 |
|---|---|---|
| **ChatGPT 데이터 분석** | 대용량 업로드 지원, 실제 Python 실행, 범용성 최고 | 세션 종료 시 데이터 소실, DB 연결 불가, 반복 분석 부적합 |
| **Julius AI** | 데이터 분석 전용 설계, 데이터셋 영속화, 시각화 기본값 우수 | 유료 구간 분석 횟수 제한, 비용 부담 |
| **Powerdrill** | 대화형 분석 + 데이터셋 영속화, 상대적 저가 | 심층 통계 리포트보다 Q&A 중심 |
| **Colab Data Science Agent** | 분석 목표 입력 → 로딩·EDA·시각화 포함 노트북 전체 생성, 무료 | 노트북 산출물이라 비개발자 접근성 낮음, 재현·공유는 사용자 책임 |

**시사점**

- 대화형은 **탐색 유연성** 우위, **일관성·재현성** 열위(같은 질문에 다른 결과)
- 라이브러리형은 그 반대
- → **결정론적 자동 리포트를 골격으로 하고 대화형 질의를 보조 레이어로 얹는 구조**가 두 약점을 동시에 회피함

---

## 5. 기능 비교 매트릭스

○ 충실 제공 / △ 부분 제공 / × 미제공

| 기능 | ydata | DataPrep | Auto.EDA | AutoEDA(OSS) | AI 대화형 | 본 프로젝트(목표) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| CSV 업로드 | ○ | △ | ○ | ○ | ○ | ○ |
| Excel 지원 | △ | △ | △ | △ | ○ | △ ※2 |
| 데이터 미리보기 | ○ | ○ | ○ | ○ | △ | ○ |
| 데이터 타입 분석 | ○ | ○ | ○ | ○ | ○ | ○ |
| 기초통계 | ○ | ○ | ○ | ○ | ○ | ○ |
| 결측치 분석 | ○ | ○ | ○ | ○ | ○ | ○ |
| 중복 분석 | ○ | △ | △ | △ | △ | ○ |
| 이상치 탐지 | ○ | △ | △ | ○ | △ | ○ |
| 단변량 분석 | ○ | ○ | ○ | ○ | ○ | ○ |
| 상관관계 | ○ | ○ | ○ | ○ | ○ | ○ |
| 자동 시각화 | ○ | ○ | ○ | ○ | ○ | ○ |
| 데이터 품질 경고 | **○** | △ | △ | △ | × | **○** |
| 자연어 해석 | △ | × | **○** | × | **○** | **○** |
| 웹 UI | ○ | × | **○** | **○** | ○ | **○** |
| 결과 다운로드 | ○ | ○ | △ | △ | △ | ○ |
| 결과 영속화·링크 공유 | × | × | △ | × | △ | △ ※1 |
| 단계별 분석 가이드 | × | × | × | × | × | **◎** |
| 타깃 기반 EDA | △ | △ | × | × | △ | **◎** |
| 데이터 품질 점수 | △ | × | × | × | × | **○** |
| 한국어 리포트 | × | × | × | × | △ | **○** |
| 전처리 | △ | ○ | △ | ○ | ○ | 추후 |

> **※1** 백엔드를 두지 않기로 결정해(`tech-stack.md`) 결과 **재현**은 JSON 내보내기/불러오기로 충족하되 **링크 공유**는 Phase 3(Cloudflare D1 도입 전제)으로 밀렸음. 조사 시점의 목표(○)와 확정된 범위가 다르므로 △로 정정함.
> **※2** Excel 파서 라이선스 확인 결과에 따라 Phase 1에서 빠질 수 있음(`tech-stack.md §9`).

**핵심 판단**: 기본 EDA 기능은 경쟁 서비스가 이미 충실히 제공함. "CSV 올리면 히스토그램 보여줌" 수준으로는 차별성이 없음. 표 하단의 굵은 항목 5개가 실질적 차별화 후보임.

---

## 6. 공통 EDA 워크플로 (업계 표준 구조)

조사 대상 대부분이 다음 단계로 수렴함.

```text
                    Dataset
                       │
                       ▼
              ┌──────────────────┐
              │ Dataset Overview │
              └────────┬─────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      Numerical    Categorical    Quality
      Analysis      Analysis      Analysis
          │            │            │
          └────────────┼────────────┘
                       ▼
                  Relationships
                       │
              ┌────────┴────────┐
              ▼                 ▼
         Correlation       Visualization
              │                 │
              └────────┬────────┘
                       ▼
                 Insight / Report
```

이 구조는 사실상 표준이므로 그대로 채택하고, 차별화는 **각 단계를 사용자에게 제시하는 방식**에서 확보함.

## 7. 필수 구현 기준선

조사 대상 대부분이 제공하는 항목으로, 미제공 시 경쟁력 상실.

1. 데이터 개요: 행·열 수, 데이터 타입, 메모리 사용량, 중복행
2. 변수별 기술통계: 수치형(평균·중위·표준편차·분위), 범주형(고유값·최빈값·빈도)
3. 결측치: 변수별 비율, 결측 패턴 시각화
4. 분포 시각화: 히스토그램, 박스플롯, 막대그래프
5. 상관관계: 상관행렬 히트맵 (Pearson/Spearman)
6. 이상치 탐지: IQR 또는 z-score 기반
7. 데이터 품질 경고: 중복행, 상수 컬럼, 고카디널리티, 심한 편포, 높은 상관 쌍
8. 데이터 타입 기반 자동 차트 선택
9. 산출물 내보내기: HTML/PDF 다운로드

---

## 8. 갭 분석 — 기존 서비스가 채우지 못한 지점

| # | 갭 | 근거 | 대응 방향 |
|---|---|---|---|
| G1 | **해석 부재** | 라이브러리형·웹형 모두 수치와 플롯만 제공. "그래서 무엇을 의미하는지"는 사용자 몫 | 발견 사항마다 자연어 해석 및 후속 조치 제안 부착 |
| G2 | **정보 과부하** | 50개 컬럼 업로드 시 히스토그램 50개 + 박스플롯 50개 + 상관행렬을 일괄 제시. 정보량이 많을수록 이해도는 오히려 하락 | 통계적 특성으로 중요 변수·관계를 선별해 대표 시각화만 제시 |
| G3 | **분석 목적 부재** | 모든 컬럼에 통계를 균등 배분함. 사용자의 분석 목표가 결과 구성에 반영되지 않음 | 타깃 변수 지정 → 문제 유형 자동 판별 → 목적에 맞는 EDA 구성 |
| G4 | **탐색 순서 부재** | 결과를 한꺼번에 제시함. 입문자는 어디서 시작해 어떻게 진행할지 판단 불가 | 단계별 분석 가이드(STEP 흐름) |
| G5 | **대용량 성능** | ydata-profiling 등은 수십만 행 이상에서 급격히 느려짐 | 샘플링·컬럼 선택·비동기 작업 큐 |
| G6 | **정적 산출물** | HTML 리포트는 생성 후 상호작용·필터링 불가 | 웹 네이티브 결과 뷰 + 변수별 드릴다운 |
| G7 | **재현·이력·공유 부재** | 세션 단위 소비. 재분석 이력 관리 없음. 파일 첨부 외 공유 수단 없음 | 결과 영속화, 링크 기반 공유 |
| G8 | **한국어 지원 취약** | 대부분 영문 리포트. 한글 컬럼명·인코딩(CP949/EUC-KR) 처리 불안정 | 한국어 리포트 및 인코딩 자동 감지를 1급 요구사항으로 취급 |
| G9 | **AI 의존 구조** | AI 대화형은 API 비용·지연·일관성 문제를 사용자에게 전가함 | AI 없이도 완전한 EDA 제공, AI는 선택 레이어 |

## 9. 차별화 후보 평가

◎ 핵심 차별점 / ○ 유효 / △ 제한적 / ❌ 불가

| 요소 | 차별화 가능성 | 판단 근거 |
|---|:---:|---|
| CSV 업로드 | ❌ | 이미 보편적 |
| 결측치·이상치 분석 | ❌ | 기본 기능 |
| 히스토그램·상관행렬 | ❌ | 기본 기능 |
| 자동 차트 선택 | △ | Auto.EDA 등에 이미 존재 |
| 데이터 품질 점수 | ○ | 유사 개념 존재하나 웹 UX 핵심 화면으로 만들면 유효 |
| AI 자연어 해석 | △ | AI 대화형 서비스에 이미 존재 |
| AI Q&A | △ | 구현 가능하나 차별화 약함 |
| **EDA 결과를 "발견" 단위로 정리** | ◎ | 서비스의 핵심 UX가 될 수 있음 |
| **EDA 결과 + ML 관점 해석** | ◎ | 다중공선성·누수·불균형 등 후속 모델링 관점 경고 |
| **EDA 단계별 가이드** | ○ | UX 차별화 유효, 입문자 타깃과 정합 |
| **타깃 기반 EDA** | ○ | 분석 목적을 명확히 함 |
| **AI 없이도 완전한 EDA** | ○ | API Key 의존성 회피 |
| **한국어·한국 데이터 환경 대응** | ○ | 조사 대상 전체가 취약 |

### 9.1 "발견 단위 정리"의 구체 형태

기존 도구:

```text
Correlation Matrix
             Age   Income  Score
Age          1.0   0.72    0.31
Income       0.72  1.0     0.64
Score        0.31  0.64    1.0
```

→ 사용자가 직접 해석해야 함.

본 프로젝트:

```text
🔍 주요 발견

1. Age ↔ Income      강한 양의 상관관계 (r = 0.72)
2. Income ↔ Score    중간 정도의 양의 상관관계 (r = 0.64)
3. Age               결측치 없음 / 이상치 2.1% / 오른쪽으로 치우친 분포
```

각 항목 클릭 시:

```text
왜 중요한가?

Age와 Income 사이에 강한 상관관계가 있습니다.
두 변수를 동시에 머신러닝 모델에 사용할 경우
다중공선성 문제를 확인할 필요가 있습니다.
```

**그래프 → 발견 → 설명** 구조가 핵심임.

### 9.2 데이터 품질 점수

임의 점수 부여가 아니라 아래 항목을 정량화해 한 화면으로 집약함.

```text
┌────────────────────────────┐
│     Dataset Health         │
│          82 / 100          │
│  ✓ Missing values          │
│  ⚠ Outliers                │
│  ✓ Duplicates              │
│  ⚠ High cardinality        │
│  ✓ Constant columns        │
└────────────────────────────┘
```

산정 대상: 결측, 중복, 상수 컬럼, 고카디널리티, 이상치, 유효하지 않은 값.

### 9.3 타깃 기반 EDA

```text
Target 지정 → Target type 자동 판단 → Classification / Regression → 적절한 EDA 자동 구성
```

예: `target = Survived` → 이진 분류 EDA / `target = SalePrice` → 회귀 EDA

타깃 지정 시 제시 형태:

```text
Target Analysis
────────────────────
SalePrice
  평균     180,921
  중앙값   163,000
  결측치   0%

가장 높은 상관관계
  OverallQual   0.88
  GrLivArea     0.71
  GarageCars    0.64
```

### 9.4 AI의 위치 — 계산이 아닌 해석

통계 계산을 LLM에 맡길 이유가 없음. 역할을 분리함.

```text
[기본 EDA — AI 불필요]
CSV → Pandas/NumPy/SciPy → EDA Engine → JSON → Frontend

[AI 분석 — 선택]
EDA Engine → 구조화된 EDA 결과 → (사용자 API Key) → LLM → 자연어 인사이트
```

LLM에 원본 데이터 전체를 보내지 않고 집계된 통계만 전달함.

```json
{
  "column": "income",
  "missing_rate": 0.032,
  "skewness": 2.41,
  "outlier_rate": 0.018,
  "correlations": { "age": 0.71, "education": 0.52 }
}
```

→ `income은 강한 양의 왜도를 보이며 일부 고소득 관측치가 분포에 영향을 주고 있습니다. 또한 age와 높은 양의 상관관계를 보입니다.`

이 구조의 이점: 토큰 사용량·비용 감소, 처리 속도 향상, 원본 데이터 외부 전송 최소화, API Key 없는 사용자도 서비스 완전 이용 가능.

---

## 10. 종합 시사점

1. **엔진 재구현 금지.** 통계·플롯은 검증된 라이브러리로 해결하고, 자원은 결과 표현과 해석에 투입함. "ydata-profiling보다 EDA 계산을 잘한다"는 방향은 승산 없음
2. **결정론적 파이프라인이 기본, AI는 선택 레이어.** AI를 핵심 경로에 두면 일관성·비용·지연이 모두 악화되고 API Key 의존성이 생김
3. **차별화 축 4개.** (a) 발견 단위 결과 정리 + ML 관점 해석, (b) 단계별 분석 가이드, (c) 타깃 기반 EDA, (d) 한국어·한국 데이터 환경 대응
4. **정보량 관리가 기능만큼 중요.** 모두 보여주는 것이 아니라 선별해 보여주는 것이 서비스의 가치임
5. **성능은 기능이 아니라 전제.** 업로드 후 대기 시간이 UX를 결정하므로 비동기 처리와 샘플링 전략을 초기 설계에 포함해야 함

### 벤치마크 지정

| 대상 | 역할 |
|---|---|
| ydata-profiling | EDA 항목 구성 및 데이터 품질 경고의 기준선 |
| DataPrep.EDA | 기능 구성·메뉴 구조, 대용량 처리 |
| Auto.EDA | 웹 서비스 UX, 자동 차트 선택 |
| AutoEDA (OSS) | 전처리 확장 방향 |

### 포지셔닝

| 평가 | 문구 |
|---|---|
| ❌ 약함 | AI 기반 자동 EDA 웹 서비스 — AI를 핵심으로 잡으면 API Key 의존성 때문에 애매해짐 |
| △ 평범 | 정형 데이터 자동 EDA 웹 서비스 — ydata/DataPrep과 기능적으로 겹침 |
| ◎ 채택 | **정형 데이터의 품질 문제와 주요 통계적 특성을 자동으로 탐지하고, 분석 과정을 단계별로 안내하는 인터랙티브 EDA 플랫폼** (+ 선택적 AI 기반 해석·질의응답) |

기술적으로 새로운 EDA 알고리즘을 만드는 것보다, **기존 EDA 엔진 위에 사용자가 분석하기 좋은 워크플로를 구축하는 것**이 현실적인 차별화임.

서비스 흐름:

```text
데이터 업로드 → 데이터 품질 진단 → 주요 발견 → 변수 분석 → Target 분석 → EDA Summary → (선택) AI 해석
```

→ 상세 대응 계획은 [`direction.md`](./direction.md) 참조.

---

## 11. 수익화 타당성 검토 (AdSense)

사이트에 Google AdSense를 게재하는 것을 전제로 심사 통과 가능성을 검토함.

### 11.1 승인 요건

| 구분 | 요건 |
|---|---|
| 콘텐츠 분량 | 실질 문서 15~20편 이상, 편당 800~1,200자 이상. 편수보다 깊이가 우선 |
| 필수 페이지 | 소개(운영 주체·전문성), 문의(동작하는 연락 수단), 개인정보처리방침(쿠키·개인화 광고 고지). 비협상 요건 |
| 평가 기준 | Google Search의 Helpful Content 신호와 동일 계열. 전문성·독자 가치·**information gain**(다른 곳에서 쉽게 얻을 수 없는 정보)을 봄 |
| 완성도 | 미완성 페이지·깨진 내비게이션 없음 |
| 크롤러 접근성 | 심사 시점에 크롤러가 평가할 콘텐츠가 실제로 존재해야 함 |

### 11.2 도구 사이트의 특수 리스크

도구·유틸리티 사이트는 AdSense 거절 빈도가 가장 높은 유형에 속함. 사이트가 입력·버튼·결과 박스로만 구성되면 심사자가 "누구를 위한 것인가 / 신뢰할 수 있는가 / 원본인가 / 유사 도구보다 나은가"를 판단할 근거가 없음. 오픈소스 라이브러리를 그대로 감싼 도구 사이트는 기존 오가닉 권위가 없으면 자동 거절률이 극히 높다고 보고됨.

주요 거절 사유 6종:

1. 실질 원본 텍스트 부재 — 도구 인터페이스만으로는 퍼블리셔 품질 입증 불가
2. 클론 용이성 — 중복·템플릿 패턴으로 판정
3. 프로그램 생성 페이지 대량 발행 — scaled content farming으로 판정
4. YMYL 도구(금융·건강) — 면책·출처 요구
5. 신뢰 인프라 부재 — 소개·문의·개인정보처리방침 누락
6. UX 결함 — 깨진 내비게이션, 미완성 페이지

### 11.3 현 설계 기준 판정 — **통과 가능성 낮음**

| 리스크 | 내용 | 심각도 |
|---|---|---|
| Low value content | "업로드 폼 + 결과 박스" 구조에 평가 대상 편집 콘텐츠가 없음 | 치명 |
| 크롤러 평가 대상 부재 | 분석 결과는 사용자 업로드 시점에 생성됨. 심사 시점에 접근 가능한 실질 콘텐츠가 0 | 치명 |
| UGC 정책 책임 | 결과 페이지는 사용자 제출 데이터 기반. 퍼블리셔가 정책 준수 책임을 짐 | 중 |
| 필수 페이지 미계획 | 소개·문의·개인정보처리방침이 설계에 없음 | 높음 |
| 렌더링 방식 | 클라이언트 렌더링만이면 심사·SEO 양쪽에서 불리 | 높음 → **해소**: 빌드 시점 HTML 생성으로 확정 ([`tech-stack.md`](./tech-stack.md)) |
| 클론 용이성 | Streamlit + ydata-profiling 조합은 이미 흔한 패턴임 | 중 |

**유리한 점**: YMYL 영역이 아니므로 면책·출처 관련 추가 심사 부담은 없음.

> **같은 인프라의 실측 근거**: 형제 프로젝트 `anime-semantle`이 동일 심사에서 **1~4차 전부 "가치가 별로 없는 콘텐츠"로 거절**됐고, 그 과정에서 확인된 수치가 `project_process.md`(저장소 밖 개인 문서, 현재 경로 미확인)에 정리되어 있음. 위 §11.1의 "15~20편" 같은 일반론보다 이 실측이 우선함 — 병목은 편수가 아니라 **독자용 콘텐츠 절대량(4차 거절 5,385자 → 5차 준비 23,958자)** 과 **색인 코퍼스**였음. 상세 대응은 [`content-strategy.md §7·§10`](./content-strategy.md) 참조.

### 11.4 도구 사이트 승인 패턴

승인 사례가 공통으로 취하는 구조는 다음과 같음.

- **레이어링**: `도구 + 의미 설명 + 한계 + 예시 + 면책`. 도구 페이지 자체에도 설명·FAQ·주의사항을 배치하고, 텍스트를 블로그 영역에만 격리하지 않음
- **hub-and-spoke**: 핵심 개념 허브 문서 1편이 주변 해설 문서를 링크하는 구조
- **성격 전환**: "도구는 제품이고, 사이트는 리소스가 됨" — 도구를 지식 플랫폼 내부의 기능으로 위치시킴

본 프로젝트는 이 패턴을 낮은 비용으로 충족할 수 있음. 차별화 축 1(Finding 해석)과 축 2(단계별 가이드)를 구현하려면 각 발견 유형의 설명을 **어차피 작성해야 하므로**, 이를 독립 문서로 발행하면 해설 20여 편이 자연 발생함. 억지 블로그 부착이 아니라 기존 산출물의 재배치임. 상세 계획은 [`content-strategy.md`](./content-strategy.md) 참조.

### 11.5 수익 기대치

- 도구 사이트의 AdSense RPM은 일반적으로 낮음
- 수익 규모는 도구 사용량이 아니라 **콘텐츠 검색 유입량**이 결정함
- 분석 결과 페이지에는 광고를 게재하지 않는 것이 정책·UX 양면에서 타당하므로, 광고 노출 지면은 콘텐츠 페이지로 한정됨
- 따라서 수익화를 프로젝트의 성공 기준으로 삼지 않음. 콘텐츠 레이어의 1차 목적은 사용자 획득과 제품 완성도임

---

## 12. 참고 자료

**벤치마크 대상**
- [ydata-profiling 공식 문서](https://docs.profiling.ydata.ai/) · [Concepts](https://docs.profiling.ydata.ai/latest/getting-started/concepts/)
- [YData Fabric Platform](https://ydata.ai/products/platform.html)
- [DataPrep EDA 문서](https://docs.dataprep.ai/user_guide/eda/introduction.html) · [출력 커스터마이즈](https://docs.dataprep.ai/user_guide/eda/how_to_guide.html) · [House Price 사례](https://docs.dataprep.ai/user_guide/eda/house_price.html) · [GitHub](https://github.com/sfu-db/dataprep)
- [Auto EDA](https://autoeda.kabillanta.me/)
- [AutoEDA (Devang-C) GitHub](https://github.com/Devang-C/AutoEDA)

**시장 조사**
- [Python AutoEDA 2026: Top 4 Tools Compared](https://pythondatabench.com/article/automated-eda-python-ydata-profiling-sweetviz-dataprep-dtale-compared)
- [8 Automated EDA Tools That Reduce Plenty of Manual EDA Hard Work](https://blog.dailydoseofds.com/p/8-automated-eda-tools-that-reduce)
- [Comparing the Five Most Popular EDA Tools — Towards Data Science](https://towardsdatascience.com/comparing-five-most-popular-eda-tools-dccdef05aa4c/)
- [Top Python Scripts to Automate EDA in 2026](https://www.analyticsinsight.net/programming/top-python-scripts-to-automate-exploratory-data-analysis-in-2026)
- [4 Ways to Automate EDA in Python — Built In](https://builtin.com/data-science/EDA-python)
- [Automated EDA Report for CSV Files — ILoveCSV](https://ilovecsv.net/blog/en/how-to-eda-report-in-csv/)
- [Data Science Agent in Colab with Gemini — Google Developers Blog](https://developers.googleblog.com/en/data-science-agent-in-colab-with-gemini/)
- [Top 5 AI Data Analysis Tools of 2026](https://guptadeepak.com/tools/top-5-ai-data-analysis-tools-2026/)
- [AI Data Analysis Tools: Julius AI vs ChatGPT vs Hex vs Rows](https://gudz.ai/posts/ai-data-analysis-tools-2026)

**AdSense 정책·심사**
- [AdSense 프로그램 정책](https://support.google.com/adsense/answer/48182)
- [사용자 제작 콘텐츠 개요](https://support.google.com/adsense/answer/1355699)
- [UGC 정책 문제 해결](https://support.google.com/adsense/troubleshooter/11418986)
- [로그인 보호 페이지 광고 게재](https://support.google.com/adsense/answer/161351)
- [동적 생성 페이지의 AdSense 코드](https://support.google.com/adsense/answer/2806011)
- [AdSense for Tool & Utility Websites (2026)](https://adsenseaudit.net/adSense-tool-websites)
- [Low Value Content 거절 원인과 대응](https://adsenseaudit.net/guides/low-value-content-adsense)
- [AdSense 필수 페이지 (2026)](https://www.adsensechecker.in/blog/mandatory-pages-for-adsense-approval)

## 13. 후속 조사 필요 항목

1. Auto.EDA 실사용 검증 — AI Summary 품질, 지원 파일 크기, 무료 여부
2. ydata-profiling JSON 출력 스키마 상세 확인 — 표현 레이어 자체 구현 가능 여부 판단
3. 각 도구의 실측 성능 비교 — 동일 데이터셋(10만 행 × 30열) 기준 처리 시간
4. 한국어 EDA 서비스 존재 여부 — 국내 유사 서비스 미조사 상태
5. 국내 EDA 해설 콘텐츠 경쟁도 — 타깃 키워드별 상위 노출 문서의 품질·깊이
6. 타깃 키워드 검색량 — 특히 §11.4 전제인 "다중공선성", "CP949 인코딩 오류", "왜도 변환" 등 실수요 확인
