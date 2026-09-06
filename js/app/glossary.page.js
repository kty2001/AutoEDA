// app/glossary.page.js — 용어집 검색 (Presentation)
// 대응 화면: /pages/glossary
//
// 용어 40여 개가 한 페이지에 나열돼 있어 원하는 항목을 찾으려면 스크롤이나 브라우저
// 자체 검색(Ctrl+F)에 기대야 했다. 검색창을 넣어 용어명·본문 텍스트로 실시간 필터링한다.
// 백엔드가 없으므로 클라이언트에서 대소문자 무시 부분 문자열 검색만 한다 —
// 형태소 분석·초성 검색 등은 하지 않는다.
//
// scripts/build_guides.mjs 의 renderBlocks 는 h2(군)·h3(용어)·본문을 래퍼 없이
// 형제 요소로 평평하게 렌더한다(다른 섹션과 공유하는 렌더러라 용어집만 감싸지 않음).
// 그래서 여기서는 h3 다음부터 다음 h2·h3·hr·section 직전까지를 그 용어의 본문으로 본다.

/**
 * 텍스트가 검색어를 포함하는지 판정한다. 대소문자를 무시한다.
 * @param {string} text
 * @param {string} query
 * @returns {boolean} query 가 빈 문자열(공백만 포함)이면 항상 true — 검색 전 전체 표시
 */
export function matchesQuery(text, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return text.toLowerCase().includes(q);
}

const TERM_BOUNDARY = new Set(['H2', 'H3', 'HR', 'SECTION']);

/** heading 다음부터 다음 경계 직전까지의 형제 요소를 모은다. */
function collectContent(heading) {
  const content = [];
  let sib = heading.nextElementSibling;
  while (sib && !TERM_BOUNDARY.has(sib.tagName)) {
    content.push(sib);
    sib = sib.nextElementSibling;
  }
  return content;
}

function textOf(heading, content) {
  return [heading.textContent, ...content.map((c) => c.textContent)].join(' ');
}

/**
 * 컨테이너 안의 h2(군)·h3(용어) 구조를 훑어 용어 목록을 만든다.
 * 용어(h3)가 하나도 없는 군(예: 용어집 말미의 해설성 절 "임계값을 그대로 믿지 않는 법")은
 * 군 제목 자체를 독립된 용어처럼 다룬다 — 그렇지 않으면 검색과 무관하게 항상 남아
 * "일치하는 용어가 없습니다" 안내와 모순되는 내용이 화면에 그대로 보인다.
 * @param {HTMLElement} root
 * @returns {Array<{ heading: HTMLElement, group: HTMLElement|null, content: HTMLElement[], text: string }>}
 */
export function collectTerms(root) {
  const terms = [];
  let currentGroup = null;
  let currentGroupHasTerm = false;

  const flushOrphanGroup = () => {
    if (currentGroup && !currentGroupHasTerm) {
      const content = collectContent(currentGroup);
      terms.push({ heading: currentGroup, group: null, content, text: textOf(currentGroup, content) });
    }
  };

  for (const el of Array.from(root.children)) {
    if (el.tagName === 'H2' && el.id) {
      flushOrphanGroup();
      currentGroup = el;
      currentGroupHasTerm = false;
      continue;
    }
    if (el.tagName !== 'H3' || !el.id) continue;

    currentGroupHasTerm = true;
    const content = collectContent(el);
    terms.push({ heading: el, group: currentGroup, content, text: textOf(el, content) });
  }
  flushOrphanGroup();
  return terms;
}

/**
 * 검색어에 맞춰 용어 표시를 갱신한다. 한 용어도 남지 않은 군(h2)은 함께 숨긴다.
 * @param {ReturnType<typeof collectTerms>} terms
 * @param {string} query
 * @returns {number} 일치한 용어 수
 */
export function applyFilter(terms, query) {
  const visibleGroups = new Set();
  let matchCount = 0;
  for (const term of terms) {
    const visible = matchesQuery(term.text, query);
    term.heading.hidden = !visible;
    for (const el of term.content) el.hidden = !visible;
    if (visible) {
      matchCount++;
      if (term.group) visibleGroups.add(term.group);
    }
  }
  for (const group of new Set(terms.map((t) => t.group).filter(Boolean))) {
    group.hidden = !visibleGroups.has(group);
  }
  return matchCount;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('glossary-search-input');
    const main = document.querySelector('main.container');
    if (!input || !main) return;

    const terms = collectTerms(main);
    if (terms.length === 0) return;

    const empty = document.getElementById('glossary-search-empty');
    const nav = main.querySelector('.term-index');

    input.addEventListener('input', () => {
      const query = input.value;
      const count = applyFilter(terms, query);
      const searching = query.trim() !== '';
      if (empty) empty.hidden = !searching || count > 0;
      if (nav) nav.hidden = searching;
    });
  });
}
