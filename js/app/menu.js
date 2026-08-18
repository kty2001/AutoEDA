// app/menu.js — 우상단 고정 전역 메뉴 (Presentation)
// 대응 화면: 전 페이지 (docs/screens.md §6)
//
// import 만으로 스스로 버튼과 패널을 만들어 body 에 붙인다 —
// 페이지마다 같은 마크업을 복사하지 않기 위한 것이며, 각 HTML 에는
// <script type="module" src="/js/app/menu.js"> 한 줄만 추가한다.
// (../BDAnalyzer/js/menu.js 패턴)
//
// 항목: 도구 / 해설 / 사례 / 용어집 / 소개 / 문의
// 동작: 버튼 클릭·바깥 클릭·Esc 로 열고 닫으며 aria-expanded 를 갱신한다.
//       현재 화면은 강조하고 aria-current="page" 를 준다.
//
// '해설' 항목에는 접이식 하위목록이 붙는다 — 해설 하위 페이지로 가는 경로가
// 허브 하나뿐이라 도구·사례 화면에서 특정 편으로 바로 갈 수 없었다.
// 목록은 build_guides.mjs 가 내는 data/guide-nav.json 이며, 펼칠 때 한 번만
// 받는다(전 페이지가 여는 메뉴이므로 열지 않은 방문자에게 요청을 만들지 않는다).

import { normalizePath } from './common.js';

/** 메뉴 항목. URL 은 확장자 없이 쓴다(307 리디렉션 회피). */
const ITEMS = [
  { href: '/pages/analyze', label: '데이터 분석' },
  { href: '/pages/guide', label: '해설' },
  { href: '/pages/case', label: '사례 리포트' },
  { href: '/pages/glossary', label: '용어집' },
  { href: '/pages/about', label: '소개' },
  { href: '/pages/contact', label: '문의' },
];

/** 하위목록이 붙는 항목. */
const GUIDE_HREF = '/pages/guide';

/** 목록 원천. build_guides.mjs 산출물이므로 해설을 발행하면 자동으로 늘어난다. */
const NAV_URL = '/data/guide-nav.json';

/**
 * guide-nav.json 의 섹션 하나를 메뉴 줄 목록으로 편다.
 * DOM 을 만들지 않는 순수 변환이라 이 함수만 단위 검사한다.
 * @param {{url: string, groups: {label: string, items: {slug: string, label: string}[]}[]}} [nav]
 * @returns {{type: 'group'|'link', label: string, href?: string}[]}
 */
function sublistEntries(nav) {
  if (!nav?.groups?.length) return [];
  const rows = [];
  for (const group of nav.groups) {
    if (!group.items?.length) continue;
    rows.push({ type: 'group', label: group.label });
    for (const item of group.items) {
      rows.push({ type: 'link', label: item.label, href: `${nav.url}/${item.slug}` });
    }
  }
  return rows;
}

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
  let sublist = null;
  let expand = null;
  let navRequest = null;

  /** 하위목록을 처음 펼칠 때 한 번만 받아 그린다. 실패해도 허브 링크는 남긴다. */
  const ensureSublist = () => {
    if (navRequest) return navRequest;
    navRequest = fetch(NAV_URL)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((data) => {
        for (const row of sublistEntries(data?.guide)) {
          if (row.type === 'group') {
            const heading = document.createElement('p');
            heading.className = 'menu-group';
            heading.textContent = row.label;
            sublist.appendChild(heading);
            continue;
          }
          const link = document.createElement('a');
          link.href = row.href;
          link.textContent = row.label;
          if (normalizePath(row.href) === current) link.setAttribute('aria-current', 'page');
          sublist.appendChild(link);
        }
        if (sublist.childElementCount === 0) {
          const fallback = document.createElement('a');
          fallback.href = GUIDE_HREF;
          fallback.textContent = '해설 전체 보기';
          sublist.appendChild(fallback);
        }
      });
    return navRequest;
  };

  const toggleSublist = (open) => {
    expand.setAttribute('aria-expanded', String(open));
    sublist.hidden = !open;
    if (open) ensureSublist();
  };

  for (const item of ITEMS) {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    if (normalizePath(item.href) === current) link.setAttribute('aria-current', 'page');

    if (item.href !== GUIDE_HREF) {
      panel.appendChild(link);
      continue;
    }

    sublist = document.createElement('div');
    sublist.className = 'menu-sublist';
    sublist.id = 'menu-sublist-guide';
    sublist.hidden = true;

    expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'menu-expand';
    expand.setAttribute('aria-expanded', 'false');
    expand.setAttribute('aria-controls', sublist.id);
    expand.setAttribute('aria-label', `${item.label} 하위 목록`);
    expand.textContent = '▾';
    expand.addEventListener('click', () => toggleSublist(sublist.hidden));

    const row = document.createElement('div');
    row.className = 'menu-row';
    row.append(link, expand);
    panel.append(row, sublist);
  }

  // 해설 하위 페이지에서 왔으면 처음 열 때 이웃 편을 바로 보여준다.
  // 접은 뒤 다시 열 때는 되살리지 않는다 — 사용자가 접은 것을 되돌리는 셈이다.
  let autoExpandPending = current.startsWith(`${GUIDE_HREF}/`);

  const toggle = (open) => {
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open && autoExpandPending && sublist) {
      autoExpandPending = false;
      toggleSublist(true);
    }
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

export { ITEMS, mount, sublistEntries };
