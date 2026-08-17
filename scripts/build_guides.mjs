// scripts/build_guides.mjs — 해설 원자료(md) → 정적 HTML
// 대응 유스케이스: UC-17 (docs/use-cases.md)
// 입력: data/guide_source/*.md   출력: pages/guide/*.html + pages/guide/index.html
//
// 런타임에 JSON 을 fetch 해 그리지 않고 빌드 시점에 HTML 을 만드는 이유:
// 그 구조는 HTML 에 "불러오는 중" 만 남아 색인 코퍼스를 만들지 못한다
// (형제 프로젝트 실측: 8페이지 합계 716자). → docs/content-strategy.md §6
//
// ⚠️ 서식 오류를 발견하면 파일을 쓰지 않고 종료 코드 1 로 끝낸다.
//    어긋난 줄을 조용히 흘려보내면 내용이 통째로 사라지고 눈으로 알아채기 어렵다
//    (../BDAnalyzer/scripts/build_notes.py 정책).
//
// ⚠️ 인덱스(pages/guide/index.html)에는 K1(EDA 진행 순서 체크리스트) 본문을 싣는다.
//    목록만 있는 인덱스는 thin content 가 되어 안티패턴 #3 에 걸린다. → docs/screens.md §2

// TODO
// 1) data/guide_source/*.md 읽기
// 2) 서식 검증 — 실패 시 process.exit(1), 어느 파일 몇 번째 줄인지 출력
// 3) 블록 파싱 → HTML 생성 (인라인 서식은 **굵게** 하나만 허용, escapeHtml 먼저 적용)
// 4) 각 해설에 공통 헤더·푸터·브레드크럼·CTA(내 데이터로 확인하기) 삽입
// 5) 인덱스 생성 — K1 본문 + 군별 21편 목록 + 각 항목 한 줄 요약(원자료 첫 문장 추출)
// 6) 렌더 텍스트 분량 집계 출력 — 편당 800자 미달은 경고, 누적을 목표 25,000자와 함께 표시
//    → docs/content-strategy.md §7 게이트

throw new Error('not implemented');
