// app/menu.js — 우상단 고정 전역 메뉴 (Presentation)
// 대응 화면: 전 페이지 (docs/screens.md §6)
//
// import 만으로 스스로 버튼과 패널을 만들어 body 에 붙인다 —
// 페이지마다 같은 마크업을 복사하지 않기 위한 것이며, 각 HTML 에는
// <script type="module" src="/js/app/menu.js"> 한 줄만 추가한다.
// (../BDAnalyzer/js/menu.js 패턴)
//
// 항목: 도구 / 해설 / 사례 / 소개 / 문의
// 동작: 버튼 클릭·바깥 클릭·Esc 로 열고 닫으며 aria-expanded 를 갱신한다.
//       현재 화면은 강조하고 aria-current="page" 를 준다.

import { normalizePath } from './common.js';

/** 메뉴 항목. URL 은 확장자 없이 쓴다(307 리디렉션 회피). */
const ITEMS = [
  { href: '/pages/analyze', label: '데이터 분석' },
  { href: '/pages/guide', label: '해설' },
  { href: '/pages/case', label: '사례 리포트' },
  { href: '/pages/about', label: '소개' },
  { href: '/pages/contact', label: '문의' },
];

/** 버튼·패널을 생성해 body 에 붙인다. */
function mount() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu-button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', '전체 메뉴');
  button.textContent = '☰';

  const panel = document.createElement('nav');
  panel.className = 'menu-panel';
  panel.setAttribute('aria-label', '전체 메뉴');
  panel.hidden = true;

  const current = normalizePath(location.pathname);
  for (const item of ITEMS) {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    if (normalizePath(item.href) === current) link.setAttribute('aria-current', 'page');
    panel.appendChild(link);
  }

  const toggle = (open) => {
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  };
  button.addEventListener('click', () => toggle(panel.hidden));
  document.addEventListener('click', (event) => {
    if (!panel.hidden && event.target !== button && !panel.contains(event.target)) toggle(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      toggle(false);
      button.focus();
    }
  });

  document.body.append(button, panel);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', mount);
}

export { ITEMS, mount };
