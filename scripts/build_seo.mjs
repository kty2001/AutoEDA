// scripts/build_seo.mjs — canonical · OG · JSON-LD · sitemap.xml 생성
// 대응 유스케이스: UC-19 (docs/use-cases.md)
//
// PAGES 가 URL 의 단일 원천이다. 수기 관리하면 페이지마다 어긋나므로 여기서 주입한다.
//
// ⚠️ 모든 URL 을 확장자 없이 출력한다. .html 을 가리키면 호스트가 307 리디렉션하고
//    GSC 가 "리디렉션 오류" 로 색인을 거부한다 — 형제 프로젝트가 지금 이 문제로
//    sitemap 전량이 무효인 상태다. → docs/tech-stack.md §6
//
// ⚠️ sitemap 에서 제외: 정책 페이지 4종(noindex), 404.
//    <changefreq> 에 표준에 없는 값을 쓰면 오류로 잔존해 재수집이 막힌다.
//    → docs/content-strategy.md §6

/** 사이트의 모든 색인 대상 페이지. docs/screens.md §2 와 일치해야 한다. */
export const PAGES = [
  { url: '/', file: 'index.html', title: 'AutoEDA — 정형 데이터 자동 EDA', sitemap: true },
  { url: '/pages/analyze', file: 'pages/analyze.html', title: '데이터 분석', sitemap: true },
  { url: '/pages/guide', file: 'pages/guide/index.html', title: '해설', sitemap: true },
  { url: '/pages/case', file: 'pages/case/index.html', title: '사례 리포트', sitemap: true },
  // 해설·사례 하위 페이지는 build_guides / build_cases 산출물을 스캔해 추가한다

  // 정책 4종 — noindex, sitemap 제외
  { url: '/pages/about', file: 'pages/about.html', title: '소개', sitemap: false },
  { url: '/pages/contact', file: 'pages/contact.html', title: '문의', sitemap: false },
  { url: '/pages/privacy', file: 'pages/privacy.html', title: '개인정보처리방침', sitemap: false },
  { url: '/pages/terms', file: 'pages/terms.html', title: '이용약관', sitemap: false },
];

// TODO
// 1) PAGES + 해설·사례 산출물 스캔으로 전체 목록 구성
// 2) 각 HTML 에 canonical · OG · JSON-LD 주입 (자리 표시 주석을 찾아 교체)
//    구조화 데이터: 홈에 WebSite+Organization, 해설에 Article, 하위에 BreadcrumbList
//    FAQPage 는 화면 텍스트와 100% 일치할 때만. 계정이 없으면 sameAs 는 생략(허위 신호 방지)
// 3) sitemap.xml 생성 — sitemap:true 만, 확장자 없는 URL

throw new Error('not implemented');
