// app/float-cta.js — 우하단 고정 도구 진입점 (Presentation)
// 대응 화면: 도구를 제외한 전 페이지 (docs/screens.md §6 공통 요소)
//
// import 만으로 스스로 링크를 만들어 body 에 붙인다 — 페이지마다 같은 마크업을
// 복사하지 않기 위한 것이며, 각 HTML 에는
// <script type="module" src="/js/app/float-cta.js"> 한 줄만 추가한다.
// (js/app/menu.js 와 같은 패턴)
//
// 도구 화면(/pages/analyze)에서는 자기 자신을 가리키므로 붙이지 않는다.
//
// ⚠️ 인라인 핸들러 금지 — CSP script-src 'self' 가 인라인 스크립트를 차단한다.

import { normalizePath } from './common.js';

/** 도구 화면. URL 은 확장자 없이 쓴다(307 리디렉션 회피). */
const TARGET = '/pages/analyze';

const LABEL = '분석';
const TITLE = '내 데이터 분석하기';

/**
 * 이 경로에 플로팅 CTA 를 붙일지 판정한다.
 * DOM 을 만들지 않는 순수 함수라 이 함수만 단위 검사한다.
 * @param {string} pathname
 * @returns {boolean}
 */
function shouldMount(pathname) {
  return normalizePath(pathname) !== TARGET;
}

/** 링크를 생성해 body 에 붙인다. 도구 화면에서는 아무것도 하지 않는다. */
function mount() {
  if (!shouldMount(location.pathname)) return;
  const link = document.createElement('a');
  link.className = 'float-cta';
  link.href = TARGET;
  link.textContent = LABEL;
  // 원 안의 두 글자만으로는 목적지가 전달되지 않는다.
  link.setAttribute('aria-label', TITLE);
  link.title = TITLE;
  document.body.append(link);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', mount);
}

export { TARGET, mount, shouldMount };
