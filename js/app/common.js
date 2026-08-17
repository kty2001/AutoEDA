// app/common.js — 모든 페이지 공용 (Presentation)
// 대응 화면: 전 페이지 (docs/screens.md §6 공통 요소)
//
// 헤더·푸터 마크업은 빌드 도구가 없어 페이지마다 복사한다. 이 파일은 마크업을 만들지 않고
// 현재 경로 강조·연도 갱신처럼 페이지 간 공통 동작만 담당한다.
//
// ⚠️ 인라인 핸들러 금지 — CSP script-src 'self' 가 인라인 스크립트를 차단하고
//    ES Module 은 전역에 함수를 노출하지 않는다. 이벤트는 전부 addEventListener 로 연결한다.

/** 현재 경로를 확장자·꼬리 슬래시 없이 정규화한다 — 링크 href 표기와 맞추기 위함. */
export function normalizePath(pathname) {
  const p = pathname.replace(/\.html$/, '').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** 네비게이션에서 현재 페이지를 강조하고 aria-current 를 준다. */
export function markCurrentNav() {
  const current = normalizePath(location.pathname);
  for (const link of document.querySelectorAll('.site-nav a, .site-footer a')) {
    if (normalizePath(link.getAttribute('href') ?? '') === current) {
      link.setAttribute('aria-current', 'page');
    }
  }
}

/** 푸터의 연도 표기를 갱신한다. */
export function updateFooterYear() {
  for (const el of document.querySelectorAll('[data-footer-year]')) {
    el.textContent = String(new Date().getFullYear());
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    markCurrentNav();
    updateFooterYear();
  });
}
