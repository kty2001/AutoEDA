# 작업 기록

모듈 구현 중의 결정 근거와 함정을 그때그때 남김. 최신이 위.

---

## 2026-08-17 — app 배선 (analyze.page · common · menu · contact)

Phase 1 코드가 이것으로 닫힘. 남은 스텁은 빌드 스크립트 3종(콘텐츠 작업과 결부).

### 결정

- **모든 app 모듈은 `typeof document !== 'undefined'` 가드 뒤에서만 배선** — Node 테스트가 import 만으로 모듈 계약(순수 함수·상수)을 검사할 수 있게 함. 테스트가 이 가드를 회귀 검사함
- **Worker 는 매 분석마다 새로 만들고 이전 것을 terminate** — 취소·타입 수정 재계산이 모두 재기동 경로를 타므로 상태가 남지 않음([`data-model.md §5`](data-model.md)의 "부분 재계산 코드를 두지 않는다")
- **새 파일 선택 시 `typeOverrides` 초기화** — 열 이름이 우연히 겹치면 이전 파일의 수정이 엉뚱한 열에 적용됨
- **불러온 결과(UC-10)는 타입 수정 비활성** — 원본 파일 핸들이 없어 재계산이 불가능함. select 를 disabled 로 두고 이유를 title 로 노출
- **캐시 축소·실패를 결과 화면 상단에 문장으로 표시**([`screens.md §5`](screens.md) 요건) — `saveResult` 의 `degraded` 3값을 각각 다른 안내로 매핑
- **발견 목록은 15건까지 렌더 후 나머지를 `hidden`** — DOM 에는 전부 넣고 "전체 보기"가 펼침. 엔진이 자르지 않기로 한 판정 축 결정과 짝을 이룸
- **해설 링크는 `finding-map.json` 을 fetch 해 붙임** — 매핑에 없는 유형(K군)은 링크를 렌더하지 않음(UC-15 대안 흐름). `connect-src 'self'` 로 허용됨
- **차트 채색은 전부 CSS 클래스로** — chart-svg 가 인라인 style 을 쓰지 않으므로(CSP) `.chart .bar` 등 규칙을 `css/style.css` 에 추가
- **mailto 실패는 감지 불가이므로 폴백을 항상 함께 표시** — 주소·복사 버튼·본문 미리보기([`screens.md §3.6`](screens.md))

### 함정 (되풀이하지 말 것)

- **동적 텍스트 삽입 경로가 두 가지** — `insertAdjacentHTML` 은 `escapeXml` 필수, `textContent` 는 불필요. 열 이름·범주 값·문의 본문이 전부 값에서 오므로 어느 경로인지 매번 확인할 것

### 통합 스모크에서 잡은 결함 3건

app 배선 후 **현실적인 CSV 한 건으로 analyze → 캐시 왕복 → 전 차트 렌더까지 이어 보는 스모크**를 돌렸음(한글 열 이름·결측·중복행·편포·강한 상관·우편번호·자유 텍스트 혼합). 유닛 테스트가 전부 통과하는 상태에서 아래 3건이 드러남 — **조립부 결함은 픽스처가 아니라 실제에 가까운 입력에서만 보인다**는 근거.

| 결함 | 원인 | 조치 |
|---|---|---|
| `메모`(자유 텍스트)가 `id` 로 추론 → `F-ID-COL` 오탐 | 고유값 비율·길이만 봄. `비고 3, 이상 없음` 은 짧고 전부 고유함 | ID 판정에 **공백 비율** 신호 추가(`INFER.idMaxSpaceRatio`), `idMaxLength` 32→36(UUID 포함) |
| 우편번호 `06236` → 수치 `6236` (선행 0 유실) | `toNumber` 가 선행 0 을 그냥 파싱 | `hasLeadingZero` 신설 — parse 는 문자열 유지, infer 는 수치 후보에서 제외 |
| `왜도가 3로`, `VIF가 6126로` | 조사 하드코딩 | `format.ro()` 신설 — 숫자 읽기의 받침으로 `으로/로` 판정 |

선행 0 처리의 방향 판단: **기본값을 안전한 쪽(문자열 유지)에 두고 오버라이드로 되돌리게 함.** 수치 변환은 비가역이라 반대 방향(수치 기본 + 사용자가 눈치채고 복구)은 데이터 손상을 사용자 주의력에 맡기는 셈임. 부수 효과로 우편번호가 상관·VIF 대상에서 빠져 무의미한 다중공선성 Finding 2건도 사라짐.

### 함정 (되풀이하지 말 것)

- **동적 텍스트 삽입 경로가 두 가지** — `insertAdjacentHTML` 은 `escapeXml` 필수, `textContent` 는 불필요. 열 이름·범주 값·문의 본문이 전부 값에서 오므로 어느 경로인지 매번 확인할 것
- **`percent()` 결과에 `ro()` 를 쓰지 말 것** — `100.0%` 는 "백 퍼센트"로 읽혀 받침이 없으므로 항상 `로` 임. 숫자만 보고 판정하면 `100.0%으로` 가 나옴. 단위 기호가 붙은 표기 전반(`bytes()` 포함)이 같음
- **개선이 기존 테스트의 전제를 무효화할 수 있음** — "우편번호가 수치로 잡히므로 오버라이드가 필요하다"를 전제한 테스트 2건이 실패했는데 회귀가 아니라 전제 소멸이었음. 실패를 회귀로 단정하기 전에 테스트가 무엇을 가정했는지 볼 것

### 검증

`npm test` 188건 통과 (계약 21 + 동작 167). 스모크는 일회성으로 끝내지 않고 `tests/integration.test.js` 로 남겨 회귀 검사에 포함시킴 — 규약을 문서에만 적으면 실행 수단이 사라짐.
**DOM 배선 자체는 Node 테스트 범위 밖이므로 브라우저 실기 확인이 남아 있음** — [`implementation-status.md §4`](implementation-status.md) 9번 항목.

---

## 2026-08-16 — 표현 레이어 구현 (chart-select · chart-svg) + 스키마 폐합 결함 해소

### 폐합 결함 (3번째 발견 — rules.md §3.6 이력에 이어)

**산점도(UC-08, rules.md §4 "6쌍")를 그릴 점 데이터가 스키마 어디에도 없었음.** 결과 JSON 은 원본 행을 담지 않으므로(§3.2) 집계만으로는 산점도가 계산 불가능함 — "규칙은 그럴듯하지만 계산이 불가능한" 유형의 재발. 문서 절차대로 스키마를 먼저 늘림:
- `correlations[].points` 신설([`data-model.md §3.6`](data-model.md)) — 상관 절댓값 상위 6쌍에만, 쌍당 200점 균등 다운샘플(`DISPLAY_LIMIT.scatterPoints`, [`rules.md §4`](rules.md) 행 추가)
- worker 가 조립, storage 용량 폴백 2단계에서 제거(§4 갱신)

### 결정

- **ChartSpec 은 자기완결** — chart-svg 가 stats·correlations 를 역참조하지 않도록 선택 단계에서 필요한 값을 전부 담음(DAG 유지 계약)
- **points 없는 쌍은 산점도에서 제외** — 축소된 캐시 복원 시 빈 차트 대신 조용히 생략
- **히트맵 축소 후에도 원본 열 순서 유지** — 분산 순으로 자르되 표시는 열 순서. 실행마다 축이 바뀌면 비교 불가
- **`selectForFinding` 은 열 범위만** — pair·dataset 발견의 시각화는 관계 탭이 담당. 편포군 → 히스토그램+왜도 방향 주석, 이상치군 → 박스플롯+IQR 경계 점선(outlier.js 와 같은 `OUTLIER.iqrMultiplier`)
- **SVG 는 인라인 style 금지 준수** — presentation attribute(fill·stroke·stroke-dasharray·font-size)와 class 만 사용. 히트맵 발산색도 fill 속성으로 계산
- **값 유래 문자열은 렌더 직전 일괄 이스케이프** — 축 제목(열 이름)·범주 레이블·툴팁. 테스트가 `<script>` 주입으로 회귀 검사

### 검증

`npm test` 168건 통과 (계약 21 + 동작 147).

---

## 2026-08-16 — storage 구현 (local) + worker 가드 교정

### 결정

- **축소 단계는 입력을 변형하지 않음** — `saveResult` 의 1·2단계는 얕은 복제로 새 객체를 만듦. 화면이 들고 있는 결과에서 histogram 이 사라지면 캐시 폴백이 화면 버그로 둔갑함
- **2단계 상관 축소 기준 = 규칙 임계값 재사용** — |Pearson| ≥ `F-CORR-CAUSAL`(0.7, 가장 낮은 상관 임계) 또는 VIF ≥ `F-MULTICOLLINEAR`(10). 자의적 수치를 새로 만들지 않고 Finding 근거 쌍이 보존되는 최소선을 택함
- **3단계 포기 시 이전 캐시도 삭제** — 남겨 두면 해설에서 복귀했을 때 다른 파일의 옛 결과가 보임
- **깨진 캐시·major 불일치는 읽는 시점에 삭제** — 복귀할 때마다 같은 실패를 반복하지 않음. minor 차이는 허용([`data-model.md §4`](data-model.md) 버전 정책)
- **스키마 major 를 `RESULT_SCHEMA_MAJOR` 로 별도 보유** — worker 모듈을 import 하면 엔진 전체가 페이지 번들에 끌려옴. 대신 worker 산출물의 major 와 일치하는지를 테스트가 대조해 드리프트를 막음
- **prefs 는 병합 저장(patch)** — 화면 조각들이 각자 자기 키만 갱신해도 서로를 지우지 않음

### 함정 (되풀이하지 말 것)

- **worker 글루 가드로 `typeof self` 를 쓰지 말 것** — 일반 페이지의 `window.self` 도 참이라 window 의 `message` 이벤트(타 출처 postMessage 포함)에 파이프라인이 배선됨. `self instanceof WorkerGlobalScope` 로 판정해야 함
- **Node 테스트에서 Web Storage 는 전역 주입으로 흉내냄** — `globalThis.sessionStorage = new FakeStorage()`. 모듈이 전역을 호출 시점에 참조하므로 import 순서 제약이 없음

### 검증

`npm test` 150건 통과 (계약 21 + 동작 129).

---

## 2026-08-16 — worker 파이프라인 조립 (analyze.worker)

### 결정

- **파이프라인을 순수 함수 `analyze(buffer, options)` 로 분리** — Worker 전역(self·postMessage) 없이 node --test 로 결과 JSON 조립을 검증. 메시지 글루는 `typeof self !== 'undefined'` 가드 안에서만 배선
- **취소·진행률은 콜백 주입**(`isCancelled`·`onProgress`) — analyze 가 메시징을 모르게 유지. 취소 시 null 반환으로 부분 결과 금지([`data-model.md §5.2`](data-model.md)) 준수
- **`FILE_TOO_LARGE` 는 buffer.byteLength 기준** — File 객체가 아닌 바이트를 받으므로 테스트 가능. 오류 detail 에 실제 크기와 상한을 `format.bytes` 표기로 담음
- **중복 행 키는 NUL(`\u0000`) 결합** — 공백 등 값에 등장할 수 있는 문자로 이으면 값 경계가 섞여 오탐
- **결측 처리의 이원성 준수**: stats·outlier 에는 결측 제외 압축 배열, correlation 에는 행 정렬 유지 전체 배열(결측=NaN) — 통계 축 작업 기록의 주의점을 그대로 배선
- **`classDistribution` 은 조립하지 않음** — 타깃 지정(UC-21)은 Phase 2. `analyze` 의 `target` 파라미터는 인터페이스만 열어 둠(F-CLASS-IMBALANCE 는 분포 부재 시 조용히 미평가)
- **`start` 수신 시 취소 플래그 리셋** — 이전 분석을 취소한 뒤 재시작하면 플래그가 남아 즉시 중단되는 버그를 예방

### 함정 (되풀이하지 말 것)

- **소스에 리터럴 NUL 문자를 넣지 말 것** — 구분자를 리터럴로 넣었더니 grep 이 파일을 바이너리로 취급하고 Edit 도구의 문자열 매칭이 깨짐. `'\u0000'` 이스케이프로 표기할 것

### 검증

`npm test` 139건 통과 (계약 21 + 동작 118). 브라우저에서의 Worker 기동·메시지 왕복은 app 배선 후 실기 확인 필요.

---

## 2026-08-16 — 판정 축 구현 (quality · finding)

### 결정

- **penalty 는 항목별 반올림 후 합산** — `items[].penalty` 가 int([`data-model.md §3.4`](data-model.md))이므로 반올림 지점을 항목 단위로 고정. 합산 후 반올림하면 항목 합계와 총점이 어긋나 보임
- **verdict 의 ok 경계**: `비율 === 0 이거나 < ok` 면 ok — duplicate·invalid 의 ok 경계가 0 이라 "0 → ok" 문면([`rules.md §2.1`](rules.md))과 `< 경계` 규칙을 하나의 식으로 합침
- **cardinality 판정에 `F-HIGH-CARD` 임계값을 재사용** — §2.1 에 별도 수치가 없고 대상이 같은 "고카디널리티 범주형"이므로 기준을 이원화하지 않음
- **evidence 의 열 목록은 최악 5개로 절단** — 근거 노출이 목적이지 전체 나열이 목적이 아님
- **묶음 항목(`collapseByType`)의 형태**: 대표 5건 유지 + `{type}#more` id·`collapsed: true`·targets 에 묶인 열 전부를 담은 합성 항목 1건을 대표 바로 뒤에 삽입. 별도 필드에 숨기면 표현 레이어가 목록 렌더링 외의 특수 경로를 갖게 됨
- **기본 표시 15건 상한은 여기서 자르지 않음** — 자르면 "전체 보기" 펼침(UC-05)이 불가능함. 정렬을 여기서 확정하고 화면이 앞 15건만 보여주는 분담
- **F-KURTOSIS 는 상방만** — 조건이 "초과첨도 ≥ 7"이지 절댓값이 아님. 음의 첨도(평평한 분포)는 잡지 않음
- **문구는 lib/format 의 percent·stat·count 로 주입** — 화면 표기와 Finding 문구의 수치 표기가 갈리면 안 됨(format.js 존재 이유)

### 함정 (되풀이하지 말 것)

- **id 문자열 정렬은 `#10` 이 `#2` 앞에 온다** — 정렬 동률 기준을 id 문자열로 두면 대표 5건 선정이 열 순서와 어긋남. 유형 → 순번(숫자 비교)으로 고정함
- **F-BIN-SENSITIVE(고유값 ≤ 20)는 작은 테스트 픽스처에서 항상 발화** — finding 테스트의 기본 열은 uniqueCount 를 20 초과로 둘 것

### 검증

`npm test` 130건 통과 (계약 21 + 동작 109).

---

## 2026-08-16 — 통계 축 구현 (stats · outlier · correlation)

### 결정

- **추정량 선택을 `stats.js` 헤더에 고정** — 표본 std(n-1, pandas 기본과 동일), 분위수는 R-7 선형 보간(numpy 기본), 왜도·첨도는 모집단 적률 기반 g1·g2(초과첨도). 테스트 기준값이 이 선택에 결부되므로 바꾸면 테스트도 함께 바꿔야 함
- **상수 열의 왜도·첨도는 0 반환** — 수학적으로 정의 불가(m2=0)지만 NaN 은 JSON 직렬화에서 깨지고, 0 은 "편포 신호 없음"으로 Finding 판정(≥ 비교)과 정합
- **상관의 결측 처리**: pearson·spearman 은 쌍별 제거(pairwise), VIF 는 전행 완전 케이스(listwise). 열 배열은 행 정렬을 유지한 전체 길이(결측=NaN)로 받음 — `stats`·`outlier`가 결측 제외 배열을 받는 것과 다르므로 worker 조립 시 주의
- **완전 공선(R²≈1)·특이 행렬의 VIF 는 null** — 무한대는 JSON 으로 나갈 수 없고, 그 경우 Pearson |1| 이 이미 `F-MULTICOLLINEAR`(OR 조건)를 성립시키므로 정보 손실 없음
- **히스토그램 기본 빈 수는 Sturges 규칙**(⌈log2 n⌉+1, 최대 50). 등폭 구간, 최댓값은 마지막 구간에 포함
- **`topValues` 동률은 등장 순서 유지** — 정렬 불안정으로 실행마다 결과가 흔들리면 재현성이 깨짐

### 함정 (되풀이하지 말 것)

- **`const F = Float64Array.from` 처럼 정적 메서드를 변수로 떼어내면 `this` 바인딩이 끊겨 TypeError** — 테스트 헬퍼에서 전 케이스가 일괄 실패했음. 화살표 함수로 감쌀 것

### 검증

`npm test` 98건 통과 (계약 21 + 동작 77).

---

## 2026-08-16 — 입력 축 구현 (decode · parse · infer) + format

### 결정

- **파일 크기 상한 25MB 확정** — 근거와 상수 위치는 [`direction.md §9`](direction.md) 결정된 사항 참조
- **결측 = trim 후 빈 문자열만.** `NA`·`미상` 같은 표기는 값이 있는 것이므로 `invalidCount`로 셈 — [`data-model.md §3.3`](data-model.md)의 결측/불일치 구분과 정합. 결측 토큰 목록(`NA`, `null` 등) 도입은 실데이터에서 필요가 확인되면 검토
- **`PARSE_FAILED` 임계 = 1건.** 필드 수가 어긋난 행이 하나라도 있으면 즉시 실패 — 어긋난 행을 조용히 버리거나 메우면 통계가 왜곡되고 사용자가 알아챌 수 없음. 완화(비율 허용)는 실데이터 불만이 쌓이면 검토
- **0/1 은 boolean 으로 잡지 않음** — 수치 이진 변수와 구분 불가. boolean 토큰은 true/false·yes/no·y/n·t/f
- **`modeRate` 분모 = 비결측 수** — 결측이 많은 열에서도 관측값의 상수성을 판정해야 `F-CONST-COL`이 성립
- **전결측 열은 `text` 타입** — 타입을 단정할 근거가 없고 통계를 산출하지 않는 타입이 안전함
- **빈 헤더는 `col_N`, 동명 헤더는 `name_2` 부여** — 이름 참조 유일성([`data-model.md §3.3`](data-model.md))
- **타입 추론 임계값 4종을 `thresholds.INFER`로 신설** — [`rules.md §6.2`](rules.md)에 행 추가로 폐합 유지

### 함정 (되풀이하지 말 것)

- **수치로 보이는 열의 Float64Array 변환은 비가역** — `06236` → `6236`으로 선행 0이 유실됨. 우편번호를 범주형으로 오버라이드하는 UC-02 경로가 깨지므로 `parseCsv`에 `keepAsString` 옵션을 추가함. Worker 재계산(start 재호출) 시 비수치 오버라이드 열 이름을 넘겨야 함
- **단일 열 CSV의 빈 줄은 결측값** — 다열 파일에서는 빈 줄을 스킵해도 되지만 단일 열에서는 데이터임. 파일 끝 잔여 빈 행만 걷어냄
- **Node/브라우저의 EUC-KR 디코더는 fatal 모드에서도 관대함** — 0x80 단독 바이트를 통과시킴(ICU). "둘 다 실패" 케이스는 0xFF 0xFF 같은 열로만 재현됨. 인코딩 감지의 실질 판별력은 UTF-8 fatal 실패 여부에서 나옴
- **`Date`는 2023-02-31을 조용히 3월로 이월** — `parseDate`는 성분 역검증으로 거부함

### 검증

`npm test` 67건 통과 (계약 21 + decode 6 + parse 15 + infer 16 + format 5 + 기타). 브라우저 실행 검증은 worker·app 배선 후에 가능함.
