// tests/app.test.js — app 모듈의 비 DOM 로직 테스트
// DOM 배선 자체는 브라우저 실기 확인 대상이고, 여기서는 순수 부분과
// "Node 환경에서 import 만으로 부작용이 없다"는 계약을 지킨다
// (모든 app 모듈은 document 부재 시 아무것도 실행하지 않아야 한다).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 배포되는 HTML 전부. 루트와 pages/ 아래를 훑는다. */
function deployedPages(dir = ROOT) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === ROOT && entry.name !== 'pages') continue;
      out.push(...deployedPages(full));
    } else if (entry.name.endsWith('.html')) {
      out.push(relative(ROOT, full).split(sep).join('/'));
    }
  }
  return out;
}

test('app 모듈 5종 — document 없이 import 가능 (부작용 가드)', async () => {
  await assert.doesNotReject(async () => {
    await import('../js/app/common.js');
    await import('../js/app/menu.js');
    await import('../js/app/float-cta.js');
    await import('../js/app/contact.page.js');
    await import('../js/app/analyze.page.js');
  });
});

test('normalizePath — 확장자·꼬리 슬래시 제거', async () => {
  const { normalizePath } = await import('../js/app/common.js');
  assert.equal(normalizePath('/pages/analyze.html'), '/pages/analyze');
  assert.equal(normalizePath('/pages/analyze/'), '/pages/analyze');
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath(''), '/');
});

test('menu.ITEMS — 확장자 없는 URL (307 리디렉션 회피)', async () => {
  const { ITEMS } = await import('../js/app/menu.js');
  assert.equal(ITEMS.length, 6);
  for (const item of ITEMS) {
    assert.ok(!item.href.endsWith('.html'), `${item.href} 가 확장자를 포함함`);
    assert.ok(item.href.startsWith('/'), '루트 기준 절대경로여야 함');
  }
});

test('menu.sublistEntries — 군 제목과 해설 링크를 순서대로 편다', async () => {
  const { sublistEntries } = await import('../js/app/menu.js');
  const rows = sublistEntries({
    url: '/pages/guide',
    groups: [
      { label: '데이터 품질', items: [{ slug: 'missing-types', label: '결측치 유형과 판별 방법' }] },
      { label: '분포', items: [{ slug: 'skewness', label: '왜도 해석' }] },
    ],
  });
  assert.deepEqual(rows, [
    { type: 'group', label: '데이터 품질' },
    { type: 'link', label: '결측치 유형과 판별 방법', href: '/pages/guide/missing-types' },
    { type: 'group', label: '분포' },
    { type: 'link', label: '왜도 해석', href: '/pages/guide/skewness' },
  ]);
});

test('menu.sublistEntries — 목록이 없거나 비면 빈 배열 (하위목록을 만들지 않음)', async () => {
  const { sublistEntries } = await import('../js/app/menu.js');
  assert.deepEqual(sublistEntries(undefined), []);
  assert.deepEqual(sublistEntries({ url: '/pages/case', groups: [] }), []);
});

test('floatCta.shouldMount — 도구 화면에서만 붙지 않는다', async () => {
  const { shouldMount, TARGET } = await import('../js/app/float-cta.js');
  // 확장자·꼬리 슬래시로 들어와도 같은 화면이다 (common.normalizePath 재사용)
  assert.equal(shouldMount('/pages/analyze'), false);
  assert.equal(shouldMount('/pages/analyze.html'), false);
  assert.equal(shouldMount('/pages/analyze/'), false);
  for (const path of ['/', '/pages/guide', '/pages/guide/skewness', '/pages/case/air-quality', '/pages/privacy']) {
    assert.equal(shouldMount(path), true, `${path} 에는 붙어야 함`);
  }
  assert.ok(!TARGET.endsWith('.html'), '확장자 없는 URL 이어야 함 (307 리디렉션 회피)');
});

test('buildMailto — 제목 접두사·본문 인코딩', async () => {
  const { buildMailto } = await import('../js/app/contact.page.js');
  const url = buildMailto('bug', '1행에서 오류 & 중단');
  assert.ok(url.startsWith('mailto:'));
  assert.ok(url.includes(encodeURIComponent('[AutoEDA] 오류·버그 신고')));
  assert.ok(url.includes(encodeURIComponent('1행에서 오류 & 중단')));
  // 모르는 유형은 '기타'로
  assert.ok(buildMailto('ghost', 'x').includes(encodeURIComponent('기타')));
});

test('analyze.page 의 data-guide-slug 안내 링크가 발행된 해설을 가리킨다', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/app/analyze.page.js', import.meta.url), 'utf8');
  const published = JSON.parse(readFileSync(new URL('../data/published.json', import.meta.url), 'utf8'));
  const slugs = [...src.matchAll(/data-guide-slug="([a-z][a-z-]*)"/g)].map((m) => m[1]);
  assert.ok(slugs.length > 0, '관계 탭 안내의 해설 슬러그가 사라짐');
  for (const slug of slugs) {
    assert.ok(published.guide.includes(slug), `${slug} 가 미발행이라 링크가 렌더되지 않음`);
  }
});

// 고정 UI 는 스크립트 한 줄로만 붙는다 — 페이지를 새로 만들 때 그 줄을 빠뜨리면
// 화면에서만 조용히 사라진다. 산출물을 실제로 훑어 폐합을 기계로 고정한다.
// (build_guides 템플릿을 고치고 npm run build 를 잊은 경우도 여기서 걸린다.)
test('산출물 — 배포되는 모든 HTML 이 공용 스크립트 3종을 싣는다', () => {
  const pages = deployedPages();
  assert.ok(pages.length >= 30, `HTML 을 ${pages.length}개만 찾음 — 스캔 범위가 어긋남`);
  const missing = [];
  for (const file of pages) {
    const html = readFileSync(join(ROOT, file), 'utf8');
    for (const src of ['/js/app/common.js', '/js/app/float-cta.js']) {
      if (!html.includes(`src="${src}"`)) missing.push(`${file} ← ${src}`);
    }
    // 404 는 전역 메뉴를 두지 않는다 (docs/screens.md §3.8)
    if (file !== '404.html' && !html.includes('src="/js/app/menu.js"')) {
      missing.push(`${file} ← /js/app/menu.js`);
    }
  }
  assert.deepEqual(missing, [], '공용 스크립트 줄이 빠진 페이지가 있다');
});
