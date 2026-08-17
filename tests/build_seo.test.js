// tests/build_seo.test.js — SEO 빌드 스크립트 동작 테스트
//
// 이 스크립트의 실패는 조용하다 — 잘못 주입해도 화면은 멀쩡하고 몇 주 뒤 GSC 에서만
// 드러난다. 그래서 검사 게이트(색인 정책 폐합)와 멱등성을 기계로 고정한다.
// → docs/content-strategy.md §4·§6, docs/implementation-status.md §2 규약 7
//
// 실행: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PAGES,
  buildBlock,
  buildSitemap,
  extractFaq,
  inject,
  validate,
} from '../scripts/build_seo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '<!-- canonical · OG · JSON-LD 는 scripts/build_seo.mjs 가 주입한다 -->';

const META = { title: '데이터 분석 — AutoEDA', description: '설명', robots: null };
const PAGE = { url: '/pages/analyze', file: 'pages/analyze.html', sitemap: true };

// ─── PAGES 목록 자체의 규칙 ─────────────────────────────────

test('PAGES — URL 에 확장자가 없다 (307 리디렉션 회피)', () => {
  for (const page of PAGES) {
    assert.ok(!page.url.endsWith('.html'), `${page.url} 에 확장자가 있음`);
    assert.ok(page.url.startsWith('/'), `${page.url} 이 / 로 시작하지 않음`);
  }
});

test('PAGES — URL 이 중복되지 않는다', () => {
  const urls = PAGES.map((p) => p.url);
  assert.equal(new Set(urls).size, urls.length);
});

test('PAGES — 정책 4종은 sitemap 에서 빠진다 (content-strategy.md §4)', () => {
  const excluded = PAGES.filter((p) => !p.sitemap).map((p) => p.url).sort();
  assert.deepEqual(excluded, ['/pages/about', '/pages/contact', '/pages/privacy', '/pages/terms']);
});

// ─── 검사 게이트 ────────────────────────────────────────────

test('검사 — sitemap 대상이 noindex 면 실패한다', () => {
  assert.throws(() => validate(PAGE, { ...META, robots: 'noindex, follow' }), /noindex/);
});

test('검사 — sitemap 제외 대상에 noindex 가 없으면 실패한다', () => {
  const policy = { url: '/pages/about', file: 'pages/about.html', sitemap: false };
  assert.throws(() => validate(policy, META), /noindex 가 없다/);
  assert.doesNotThrow(() => validate(policy, { ...META, robots: 'noindex, follow' }));
});

test('검사 — URL 에 확장자가 있으면 실패한다', () => {
  assert.throws(() => validate({ ...PAGE, url: '/pages/analyze.html' }, META), /확장자/);
});

// ─── 주입 ───────────────────────────────────────────────────

test('주입 — 자리 표시 주석이 없으면 실패한다 (조용한 누락 금지)', () => {
  assert.throws(() => inject('<head></head>', 'BLOCK', 'x.html'), /자리 표시 주석/);
});

test('주입 — 두 번 돌려도 블록이 하나다 (멱등)', () => {
  const html = `<head>\n${MARKER}\n</head>`;
  const block = buildBlock(PAGE, META, '');
  const once = inject(html, block, PAGE.file);
  const twice = inject(once, block, PAGE.file);
  assert.equal(twice, once);
  assert.equal(twice.match(/build:seo:begin/g).length, 1);
});

test('주입 — canonical 과 og:url 이 페이지 URL 과 일치한다', () => {
  const block = buildBlock(PAGE, META, '');
  assert.match(block, /<link rel="canonical" href="https:\/\/[^"]+\/pages\/analyze">/);
  assert.match(block, /<meta property="og:url" content="https:\/\/[^"]+\/pages\/analyze">/);
  assert.ok(!/\.html/.test(block), '주입 블록에 확장자 URL 이 있음');
});

test('주입 — 홈은 WebSite·Organization, 하위는 BreadcrumbList', () => {
  const home = buildBlock({ url: '/', file: 'index.html', sitemap: true }, META, '');
  assert.match(home, /"@type":"WebSite"/);
  assert.match(home, /"@type":"Organization"/);
  assert.ok(!/BreadcrumbList/.test(home));
  assert.ok(!/sameAs/.test(home), '계정이 없는데 sameAs 를 냄 — 허위 신호');

  const guide = buildBlock(
    { url: '/pages/guide/skewness', file: 'pages/guide/skewness.html', kind: 'guide', sitemap: true },
    META,
    ''
  );
  assert.match(guide, /"@type":"BreadcrumbList"/);
  assert.match(guide, /"@type":"Article"/);
  assert.match(guide, /<meta property="og:type" content="article">/);
});

test('주입 — JSON-LD 가 </script> 로 조기 종료되지 않는다', () => {
  // description 이 JSON-LD 본문에 들어가는 페이지(홈: WebSite.description)로 확인한다.
  const evil = { ...META, description: '</script><img src=x>' };
  const block = buildBlock({ url: '/', file: 'index.html', sitemap: true }, evil, '');
  const ld = block.slice(block.indexOf('<script type="application/ld+json">'));
  assert.ok(!ld.includes('</script><img'), 'JSON-LD 안의 < 가 이스케이프되지 않음');
  assert.match(block, /\\u003C/);
  assert.match(block, /content="&lt;\/script&gt;/); // OG 속성 쪽도 함께 막힌다
});

// ─── FAQ 추출 ───────────────────────────────────────────────

test('FAQ — 화면 텍스트를 그대로 뽑고 다음 절을 넘지 않는다', () => {
  const html = `
    <h2>자주 묻는 질문</h2>
    <h3>질문 하나?</h3>
    <p>답 <strong>하나</strong>입니다.</p>
    <h2>다른 절</h2>
    <h3>여기 h3 는 FAQ 가 아님</h3>
    <p>끌어오면 안 됨</p>`;
  assert.deepEqual(extractFaq(html), [{ q: '질문 하나?', a: '답 하나입니다.' }]);
});

test('FAQ — 엔티티를 화면에 보이는 문자로 되돌린다', () => {
  const html = '<h2>자주 묻는 질문</h2><h3>&ldquo;따옴표&rdquo;는?</h3><p>a &amp; b</p>';
  assert.deepEqual(extractFaq(html), [{ q: '“따옴표”는?', a: 'a & b' }]);
});

test('FAQ — FAQ 절이 없으면 빈 배열이다 (FAQPage 를 만들지 않음)', () => {
  assert.deepEqual(extractFaq('<h2>한계</h2><h3>x</h3><p>y</p>'), []);
});

test('FAQ — 실제 페이지의 문답 수가 화면과 일치한다', () => {
  for (const file of ['index.html', 'pages/analyze.html']) {
    const html = readFileSync(join(ROOT, file), 'utf8');
    const faq = extractFaq(html);
    assert.ok(faq.length > 0, `${file} 에서 FAQ 를 뽑지 못함`);
    for (const item of faq) {
      assert.ok(item.q.length > 0 && item.a.length > 0, `${file} 에 빈 문답이 있음`);
      assert.ok(!/[<>]/.test(item.q + item.a), `${file} 문답에 태그가 남음`);
    }
  }
});

// ─── sitemap ────────────────────────────────────────────────

test('sitemap — sitemap:true 만 담고 확장자 없는 절대 URL 을 쓴다', () => {
  const xml = buildSitemap(PAGES, '2026-08-17');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.ok(!xml.includes('.html'), 'sitemap 에 확장자 URL 이 있음');
  assert.ok(!xml.includes('/pages/privacy'), 'noindex 페이지가 sitemap 에 있음');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, PAGES.filter((p) => p.sitemap).length);
  for (const loc of locs) assert.match(loc, /^https:\/\//);
});

test('sitemap — 표준에 없는 값이 들어가지 않는다 (재수집 차단 회피)', () => {
  const xml = buildSitemap(PAGES, '2026-08-17');
  assert.ok(!xml.includes('<changefreq>'), 'changefreq 는 넣지 않기로 함');
  assert.ok(!xml.includes('<priority>'), 'priority 는 넣지 않기로 함');
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test('sitemap — robots.txt 의 Sitemap 줄과 같은 오리진을 쓴다', () => {
  const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  const declared = /Sitemap:\s*(\S+)/.exec(robots)?.[1];
  assert.ok(declared, 'robots.txt 에 Sitemap 줄이 없음');
  const origin = new URL(declared).origin;
  const xml = buildSitemap(PAGES, '2026-08-17');
  for (const loc of [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    assert.equal(new URL(loc).origin, origin, 'sitemap 과 robots.txt 의 오리진이 어긋남');
  }
});
