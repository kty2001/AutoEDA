// tests/build_guides.test.js — 해설·사례 산문 빌드 동작 테스트
//
// 이 스크립트의 실패 방식은 두 가지다. (1) 서식을 조용히 흘려보내 내용이 사라짐,
// (2) 원자료 텍스트가 이스케이프 없이 HTML 에 들어감. 둘 다 화면을 봐도 알아채기
// 어려우므로 기계로 고정한다. → docs/content-strategy.md §6, 규약 7
//
// 실행: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MIN_CHARS, SECTIONS, inline, parseSource, renderBlocks } from '../scripts/build_guides.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FM = '---\ntitle: 제목\nsummary: 한 줄 요약\n---\n';

// ─── 프론트매터 ─────────────────────────────────────────────

test('프론트매터 — 없으면 실패한다', () => {
  assert.throws(() => parseSource('본문만 있음\n', 'x.md'), /프론트매터/);
});

test('프론트매터 — 닫히지 않으면 실패한다', () => {
  assert.throws(() => parseSource('---\ntitle: 제목\n', 'x.md'), /닫히지 않았다/);
});

test('프론트매터 — title·summary 는 필수다', () => {
  assert.throws(() => parseSource('---\ntitle: 제목\n---\n본문\n', 'x.md'), /summary/);
  assert.throws(() => parseSource('---\nsummary: 요약\n---\n본문\n', 'x.md'), /title/);
});

test('프론트매터 — 오타 키를 잡는다 (조용히 무시하지 않음)', () => {
  assert.throws(
    () => parseSource('---\ntitle: 제목\nsummary: 요약\nsummry: 오타\n---\n본문\n', 'x.md'),
    /알 수 없는 키 "summry"/
  );
});

test('프론트매터 — index: true 를 불리언으로 읽는다', () => {
  const { meta } = parseSource('---\ntitle: 제목\nsummary: 요약\nindex: true\n---\n본문\n', 'x.md');
  assert.equal(meta.index, true);
});

// ─── 블록 파싱 ──────────────────────────────────────────────

test('블록 — 지원 서식을 전부 파싱한다', () => {
  const md = `${FM}
문단 하나.

## 절

### 소절

- 항목 1
- 항목 2

1. 첫째
2. 둘째

> 인용문

| 머리 | 말 |
|---|---|
| 셀1 | 셀2 |
`;
  const kinds = parseSource(md, 'x.md').blocks.map((b) => b.type);
  assert.deepEqual(kinds, ['p', 'h2', 'h3', 'ul', 'ol', 'quote', 'table']);
});

test('블록 — 제목의 {#앵커} 를 id 로 떼어낸다', () => {
  const { blocks } = parseSource(`${FM}\n## 군 {#group}\n\n### 왜도 {#skewness}\n`, 'x.md');
  assert.deepEqual(blocks, [
    { type: 'h2', text: '군', id: 'group' },
    { type: 'h3', text: '왜도', id: 'skewness' },
  ]);
});

test('블록 — 앵커가 중복이거나 형식이 어긋나면 실패한다', () => {
  assert.throws(() => parseSource(`${FM}\n### 가 {#dup}\n\n### 나 {#dup}\n`, 'x.md'), /앵커가 중복/);
  assert.throws(() => parseSource(`${FM}\n### 가 {#왜도}\n`, 'x.md'), /앵커는 소문자/);
});

test('블록 — 해설: 줄은 슬러그만 받는다', () => {
  const { blocks } = parseSource(`${FM}\n해설: skewness\n`, 'x.md');
  assert.deepEqual(blocks, [{ type: 'guide-link', slug: 'skewness' }]);
  assert.throws(() => parseSource(`${FM}\n해설: 왜도 해석\n`, 'x.md'), /슬러그만/);
});

test('블록 — 문단은 빈 줄까지 이어 붙인다', () => {
  const { blocks } = parseSource(`${FM}\n첫 줄\n둘째 줄\n\n다른 문단\n`, 'x.md');
  assert.deepEqual(blocks.map((b) => b.text), ['첫 줄 둘째 줄', '다른 문단']);
});

test('블록 — 문단이 **굵게** 로 시작해도 문단이다', () => {
  const { blocks } = parseSource(`${FM}\n**강조된 시작** 뒤에 문장.\n`, 'x.md');
  assert.equal(blocks[0].type, 'p');
});

test('블록 — 지원하지 않는 서식은 줄 번호와 함께 실패한다', () => {
  for (const bad of ['`코드`', '_기울임_', '<div>', '![이미지](/x)']) {
    assert.throws(() => parseSource(`${FM}\n${bad}\n`, 'x.md'), /지원하지 않는 서식/, `통과됨: ${bad}`);
  }
});

test('블록 — 본문 h1 은 실패한다 (제목은 프론트매터)', () => {
  assert.throws(() => parseSource(`${FM}\n# 제목\n`, 'x.md'), /h1/);
});

test('블록 — 표의 칸 수가 어긋나면 실패한다', () => {
  const md = `${FM}\n| a | b |\n|---|---|\n| 1 | 2 | 3 |\n`;
  assert.throws(() => parseSource(md, 'x.md'), /칸 수가 헤더\(2\)와 다르다 \(3\)/);
});

test('블록 — 표에 구분선이 없으면 실패한다', () => {
  const md = `${FM}\n| a | b |\n| 1 | 2 |\n| 3 | 4 |\n`;
  assert.throws(() => parseSource(md, 'x.md'), /구분선/);
});

test('블록 — ** 짝이 맞지 않으면 실패한다', () => {
  assert.throws(() => parseSource(`${FM}\n**닫히지 않은 강조\n`, 'x.md'), /\*\* 의 짝/);
});

test('블록 — 단일 * 는 실패한다', () => {
  assert.throws(() => parseSource(`${FM}\n별표 * 하나\n`, 'x.md'), /단일 \*/);
});

test('블록 — 문장 중간의 백틱을 잡는다 (화면에 기호가 그대로 남는 실측 결함)', () => {
  assert.throws(() => parseSource(`${FM}\n값 \`06236\` 은 코드다\n`, 'x.md'), /백틱/);
  const md = `${FM}\n| 머리 | 말 |\n|---|---|\n| \`a\` | b |\n`;
  assert.throws(() => parseSource(md, 'x.md'), /백틱/);
});

test('블록 — 문장 중간의 인라인 링크는 문단으로 통과한다', () => {
  const { blocks } = parseSource(`${FM}\n자세히는 [여기](/pages/guide) 참고\n`, 'x.md');
  assert.equal(blocks[0].type, 'p');
});

test('블록 — 링크 형태가 아닌 대괄호는 줄 번호와 함께 실패한다', () => {
  // 태그가 되지 않고 화면에 기호가 그대로 남는 것을 막는다
  assert.throws(() => parseSource(`${FM}\n대괄호 [주석] 표기\n`, 'x.md'), /x\.md:\d+ — 대괄호/);
});

test('원자료 — 실제 원고에 백틱이 없다', () => {
  for (const section of Object.values(SECTIONS)) {
    const dir = join(ROOT, section.source);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      assert.ok(!text.includes('`'), `${section.source}/${file} 에 백틱이 있음`);
    }
  }
});

// ─── 렌더 ───────────────────────────────────────────────────

test('렌더 — escapeHtml 이 **굵게** 변환보다 먼저다', () => {
  assert.equal(inline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(inline('**굵게**'), '<strong>굵게</strong>');
  // 원자료에 태그를 써도 태그가 되지 않는다
  assert.equal(inline('**<b>x</b>**'), '<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
});

test('렌더 — [텍스트](url) 이 링크가 된다 (사례 리포트의 출처·라이선스 표기)', () => {
  // 외부 링크에는 rel="noopener" 를 붙이고, 사이트 내부 경로에는 붙이지 않는다
  assert.equal(
    inline('[출처](https://example.org/data)'),
    '<a href="https://example.org/data" rel="noopener">출처</a>'
  );
  assert.equal(inline('[해설](/pages/guide/skewness)'), '<a href="/pages/guide/skewness">해설</a>');
  // escapeHtml 이 먼저이므로 원자료의 태그가 링크 안에서도 태그가 되지 않는다
  assert.equal(
    inline('[<b>x</b>](https://example.org/)'),
    '<a href="https://example.org/" rel="noopener">&lt;b&gt;x&lt;/b&gt;</a>'
  );
  // 굵게와 함께 쓸 수 있다
  assert.match(inline('[**굵게**](https://example.org/)'), /<a href="[^"]+" rel="noopener"><strong>/);
});

test('파싱 — 링크 URL 스킴을 검사한다 (줄 번호와 함께 실패)', () => {
  // javascript: 같은 스킴이 href 에 들어가면 안 된다
  assert.throws(() => parseSource(`${FM}\n[누르기](javascript:alert(1))\n`, 'x.md'), /x\.md:\d+ — 링크 URL/);
  assert.throws(() => parseSource(`${FM}\n[상대경로](pages/guide)\n`, 'x.md'), /링크 URL/);
  // 허용되는 두 형태는 통과한다
  assert.doesNotThrow(() => parseSource(`${FM}\n[외부](https://example.org/a?b=1)\n`, 'x.md'));
  assert.doesNotThrow(() => parseSource(`${FM}\n[내부](/pages/guide)\n`, 'x.md'));
});

test('렌더 — 표는 가로 스크롤 래퍼를 쓴다 (본문이 스크롤되지 않게)', () => {
  const { blocks } = parseSource(`${FM}\n| a | b |\n|---|---|\n| 1 | 2 |\n`, 'x.md');
  const html = renderBlocks(blocks);
  assert.match(html, /<div class="table-wrap"><table>/);
  assert.match(html, /<thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead>/);
});

test('렌더 — 목록·인용이 의도한 태그로 나온다', () => {
  const { blocks } = parseSource(`${FM}\n- 하나\n\n1. 첫째\n\n> 인용\n`, 'x.md');
  const html = renderBlocks(blocks);
  assert.match(html, /<ul>\s*<li>하나<\/li>\s*<\/ul>/);
  assert.match(html, /<ol>\s*<li>첫째<\/li>\s*<\/ol>/);
  assert.match(html, /<blockquote><p>인용<\/p><\/blockquote>/);
});

test('렌더 — 제목 앵커와 해설 링크', () => {
  const { blocks } = parseSource(`${FM}\n### 왜도 {#skewness}\n\n해설: skewness\n`, 'x.md');
  const html = renderBlocks(blocks, '  ', (slug) => ({ url: `/pages/guide/${slug}`, title: '왜도 해석' }));
  assert.match(html, /<h3 id="skewness">왜도<\/h3>/);
  // 링크 문구는 원고가 아니라 해설 제목에서 온다 — 제목이 바뀌어도 어긋나지 않는다
  assert.match(html, /<p class="term-guide"><a href="\/pages\/guide\/skewness">해설: 왜도 해석<\/a><\/p>/);
});

test('렌더 — 해설 해석기가 없는 자리에서는 해설: 줄이 실패한다', () => {
  const { blocks } = parseSource(`${FM}\n해설: skewness\n`, 'x.md');
  assert.throws(() => renderBlocks(blocks), /해설: 줄을 쓸 수 없는 자리/);
});

// ─── 분량 집계 ──────────────────────────────────────────────

test('분량 — 링크 URL 은 렌더 텍스트가 아니므로 뺀다', () => {
  const plain = parseSource(`${FM}\n출처 표기\n`, 'x.md').charCount;
  const linked = parseSource(`${FM}\n[출처](https://example.org/very/long/path) 표기\n`, 'x.md').charCount;
  assert.equal(linked, plain);
});

test('분량 — 서식 기호와 공백을 빼고 센다', () => {
  const { charCount } = parseSource(`${FM}\n**가나다** 라마\n`, 'x.md');
  assert.equal(charCount, 5);
});

// ─── 산출물 ─────────────────────────────────────────────────

test('산출물 — 섹션 인덱스가 전부 생성되어 있다', () => {
  for (const section of Object.values(SECTIONS)) {
    const path = join(ROOT, section.indexFile);
    assert.ok(existsSync(path), `${section.indexFile} 이 없음 — npm run build:guides 필요`);
  }
});

test('산출물 — build_seo 자리 표시 주석이 있다 (없으면 build:seo 가 exit 1)', () => {
  for (const section of Object.values(SECTIONS)) {
    const html = readFileSync(join(ROOT, section.indexFile), 'utf8');
    assert.match(html, /scripts\/build_seo\.mjs 가 주입한다/);
  }
});

test('산출물 — 내부 링크가 확장자 없는 절대경로다', () => {
  for (const section of Object.values(SECTIONS)) {
    const html = readFileSync(join(ROOT, section.indexFile), 'utf8');
    for (const href of [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
      // canonical 은 build_seo 가 넣는 절대 URL 이고, 자산은 확장자가 있어야 한다.
      // 용어집의 #앵커는 같은 페이지 안의 이동이라 이 규칙 대상이 아니다.
      if (href.startsWith('http') || href.startsWith('/css/') || href.startsWith('/favicon') || href.startsWith('#')) continue;
      assert.ok(href.startsWith('/'), `상대경로 링크: ${href}`);
      assert.ok(!href.endsWith('.html'), `확장자 링크: ${href}`);
    }
  }
});

test('산출물 — h1 이 하나뿐이고 CTA·푸터가 있다', () => {
  for (const section of Object.values(SECTIONS)) {
    const html = readFileSync(join(ROOT, section.indexFile), 'utf8');
    assert.equal((html.match(/<h1>/g) ?? []).length, 1, `${section.out}: h1 이 하나가 아님`);
    assert.match(html, /내 데이터로 확인하기/);
    assert.match(html, /site-footer/);
  }
});

test('산출물 — 사례 허브의 목록이 발행 상태와 일치한다 (안티패턴 #5)', () => {
  // 0편이면 빈 목록 절을 내지 않고, 발행되어 있으면 전편이 목록에 있어야 한다.
  // 어느 쪽이든 "준비 중" 류의 약점 공표 문구는 두지 않는다.
  const html = readFileSync(join(ROOT, SECTIONS.case.indexFile), 'utf8');
  const dir = join(ROOT, SECTIONS.case.source);
  const slugs = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => f.replace(/\.md$/, ''));

  if (slugs.length === 0) {
    assert.ok(!html.includes('doc-list'), '발행된 사례가 없는데 목록 절을 냈음');
  } else {
    assert.ok(html.includes('doc-list'), '발행된 사례가 있는데 목록 절이 없음');
    for (const slug of slugs) {
      assert.ok(html.includes(`${SECTIONS.case.url}/${slug}`), `허브 목록에 없음: ${slug}`);
    }
  }
  for (const phrase of ['준비 중', '아직 없습니다', '곧 공개', 'coming soon']) {
    assert.ok(!html.includes(phrase), `약점 공표 문구가 있음: ${phrase}`);
  }
});

test('산출물 — 섹션 인덱스를 디렉토리 index.html 로 내지 않는다 (307 회피)', () => {
  // pages/guide/index.html 이면 /pages/guide 가 트레일링 슬래시로 307 된다 — 실측 확인.
  for (const section of Object.values(SECTIONS)) {
    assert.ok(!section.indexFile.endsWith('/index.html'), `${section.indexFile} 이 디렉토리 인덱스임`);
    assert.ok(!existsSync(join(ROOT, section.out, 'index.html')), `${section.out}/index.html 이 남아 있음`);
  }
});

test('산출물 — published.json 이 발행된 슬러그만 담는다', () => {
  const published = JSON.parse(readFileSync(join(ROOT, 'data/published.json'), 'utf8'));
  for (const [name, section] of Object.entries(SECTIONS)) {
    assert.ok(Array.isArray(published[name]), `published.json 에 ${name} 배열이 없음`);
    for (const slug of published[name]) {
      assert.ok(
        existsSync(join(ROOT, section.out, `${slug}.html`)),
        `published.json 이 없는 파일을 가리킴: ${section.out}/${slug}.html`
      );
    }
  }
});

test('게이트 — 도구 화면이 published.json 으로 해설 링크를 거른다', () => {
  // 이 파일명으로 두 파일이 결합되어 있다. 한쪽만 고치면 링크가 404 로 돌아간다.
  const src = readFileSync(join(ROOT, 'js/app/analyze.page.js'), 'utf8');
  assert.match(src, /\/data\/published\.json/);
  assert.match(src, /published\.has\(/);
});

test('산출물 — guide-nav.json 이 발행된 편을 이름과 함께 담는다', () => {
  const nav = JSON.parse(readFileSync(join(ROOT, 'data/guide-nav.json'), 'utf8'));
  const published = JSON.parse(readFileSync(join(ROOT, 'data/published.json'), 'utf8'));

  for (const [name, entry] of Object.entries(nav)) {
    assert.equal(entry.url, SECTIONS[name].url);
    const slugs = entry.groups.flatMap((group) => {
      assert.ok(group.label, `${name}: 군 이름이 없음`);
      assert.ok(group.items.length > 0, `${name}/${group.label}: 빈 군을 냈음`);
      return group.items.map((item) => {
        assert.ok(item.label, `${name}/${item.slug}: 메뉴 이름이 없음`);
        return item.slug;
      });
    });
    // 메뉴에 없는 편이 생기면(또는 지운 편이 남으면) 하위목록과 실제 발행분이 어긋난다.
    assert.deepEqual([...slugs].sort(), [...published[name]].sort());
  }
  // 발행분이 0편인 섹션은 키 자체를 내지 않는다 — 빈 하위목록을 만들지 않기 위함.
  for (const [name, slugs] of Object.entries(published)) {
    assert.equal(name in nav, slugs.length > 0, `${name}: guide-nav.json 키가 발행 여부와 어긋남`);
  }
});

test('산출물 — 하위 페이지에 같은 군의 다른 편 링크가 있다', () => {
  const nav = JSON.parse(readFileSync(join(ROOT, 'data/guide-nav.json'), 'utf8'));

  for (const [name, entry] of Object.entries(nav)) {
    for (const group of entry.groups) {
      for (const item of group.items) {
        const html = readFileSync(join(ROOT, SECTIONS[name].out, `${item.slug}.html`), 'utf8');
        const related = /<nav class="related"[\s\S]*?<\/nav>/.exec(html);
        assert.ok(related, `${item.slug}: 관련 해설 절이 없음`);

        const linked = [...related[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        for (const href of linked) {
          assert.ok(href.startsWith('/') && !href.endsWith('.html'), `${item.slug}: 확장자·상대경로 링크 ${href}`);
        }
        assert.ok(linked.includes(entry.url), `${item.slug}: 허브 링크가 없음`);
        assert.ok(!linked.includes(`${entry.url}/${item.slug}`), `${item.slug}: 자기 자신을 링크함`);
        for (const sibling of group.items) {
          if (sibling.slug === item.slug) continue;
          assert.ok(linked.includes(`${entry.url}/${sibling.slug}`), `${item.slug}: ${sibling.slug} 링크가 없음`);
        }
      }
    }
  }
});

test('산출물 — 용어집의 앵커와 빠른 이동이 1:1 이다', () => {
  const html = readFileSync(join(ROOT, SECTIONS.glossary.indexFile), 'utf8');

  const ids = [...html.matchAll(/<h([23]) id="([^"]+)"/g)].map((m) => m[2]);
  assert.equal(new Set(ids).size, ids.length, '앵커가 중복임');

  const index = /<nav class="term-index"[\s\S]*?<\/nav>/.exec(html);
  assert.ok(index, '빠른 이동 절이 없음');
  for (const href of [...index[0].matchAll(/href="#([^"]+)"/g)].map((m) => m[1])) {
    assert.ok(ids.includes(href), `빠른 이동이 없는 앵커를 가리킴: #${href}`);
  }
  // 용어(h3)는 모두 색인에 올라와야 한다 — 목록을 자동 생성하는 이유가 이것이다.
  const terms = [...html.matchAll(/<h3 id="([^"]+)"/g)].map((m) => m[1]);
  for (const term of terms) {
    assert.ok(index[0].includes(`href="#${term}"`), `빠른 이동에서 빠진 용어: #${term}`);
  }
});

test('산출물 — 용어집의 해설 링크가 실제 해설을 가리킨다', () => {
  const html = readFileSync(join(ROOT, SECTIONS.glossary.indexFile), 'utf8');
  const links = [...html.matchAll(/<p class="term-guide"><a href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length > 0, '해설 링크가 하나도 없음');
  for (const href of links) {
    const slug = href.split('/').pop();
    assert.ok(
      existsSync(join(ROOT, SECTIONS.guide.out, `${slug}.html`)),
      `없는 해설을 가리킴: ${href}`
    );
  }
});

test('네비 — 모든 페이지의 상단 메뉴가 같다 (수기 복사 규약의 실패 지점)', () => {
  const pages = ['index.html', '404.html', 'pages/analyze.html', 'pages/about.html', 'pages/contact.html',
    'pages/privacy.html', 'pages/terms.html', SECTIONS.guide.indexFile, SECTIONS.case.indexFile,
    SECTIONS.glossary.indexFile, join(SECTIONS.guide.out, 'skewness.html')];
  const expected = ['/pages/analyze', '/pages/guide', '/pages/case', '/pages/glossary'];
  for (const file of pages) {
    const html = readFileSync(join(ROOT, file), 'utf8');
    const nav = /<nav class="site-nav"[\s\S]*?<\/nav>/.exec(html);
    assert.ok(nav, `${file}: site-nav 가 없음`);
    assert.deepEqual([...nav[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]), expected, `${file}: 상단 메뉴가 다름`);
  }
});

test('산출물 — 편당 분량이 하한을 넘는다', () => {
  for (const section of Object.values(SECTIONS)) {
    const html = readFileSync(join(ROOT, section.indexFile), 'utf8');
    const main = /<main[\s\S]*?<\/main>/.exec(html)[0];
    const text = main.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    assert.ok(text.length >= MIN_CHARS, `${section.out}: ${text.length}자 — ${MIN_CHARS}자 미달`);
  }
});
