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
//
// ⚠️ 서식 오류를 발견하면 아무 파일도 쓰지 않고 종료 코드 1 로 끝낸다
//    (docs/implementation-status.md §2 규약 7). 검사 → 조립 → 쓰기의 3단이며
//    쓰기는 전 페이지가 통과한 뒤에만 시작한다. 절반만 주입된 상태를 만들지 않는다.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 절대 URL 의 원천. 커스텀 도메인 취득 시 여기만 고친다
 * (미결 사항: docs/direction.md §9). robots.txt 의 Sitemap 줄과 일치해야 한다.
 */
const ORIGIN = 'https://autoeda.tyoujungzz.workers.dev';

/** 서비스명 — 명칭 충돌 미해소 상태다(docs/direction.md §9). 확정되면 여기만 고친다. */
const SITE_NAME = 'AutoEDA';

/** 주입 블록의 경계. 재실행 시 이 사이를 걷어내고 다시 넣으므로 멱등하다. */
const MARKER = '<!-- canonical · OG · JSON-LD 는 scripts/build_seo.mjs 가 주입한다 -->';
const BEGIN = '<!-- build:seo:begin -->';
const END = '<!-- build:seo:end -->';

/** 사이트의 모든 색인 대상 페이지. docs/screens.md §2 와 일치해야 한다. */
export const PAGES = [
  { url: '/', file: 'index.html', title: 'AutoEDA — 정형 데이터 자동 EDA', sitemap: true },
  { url: '/pages/analyze', file: 'pages/analyze.html', title: '데이터 분석', sitemap: true },
  // 섹션 인덱스는 디렉토리 인덱스(`pages/guide/index.html`)로 두지 않는다 —
  // 그렇게 하면 `/pages/guide` 가 트레일링 슬래시로 307 된다. → build_guides.mjs 주석
  { url: '/pages/guide', file: 'pages/guide.html', title: '해설', sitemap: true, generated: true },
  { url: '/pages/case', file: 'pages/case.html', title: '사례 리포트', sitemap: true, generated: true },
  // 해설·사례 하위 페이지는 build_guides / build_cases 산출물을 스캔해 추가한다

  // 정책 4종 — noindex, sitemap 제외
  { url: '/pages/about', file: 'pages/about.html', title: '소개', sitemap: false },
  { url: '/pages/contact', file: 'pages/contact.html', title: '문의', sitemap: false },
  { url: '/pages/privacy', file: 'pages/privacy.html', title: '개인정보처리방침', sitemap: false },
  { url: '/pages/terms', file: 'pages/terms.html', title: '이용약관', sitemap: false },
];

// ─── 목록 구성 ──────────────────────────────────────────────

/**
 * 해설·사례 하위 페이지를 산출물 디렉토리에서 스캔한다.
 * 목록을 수기로 관리하면 발행과 sitemap 이 어긋나므로 파일 시스템을 원천으로 삼는다.
 * @param {string} dir 저장소 기준 상대 경로 (예: 'pages/guide')
 * @returns {{url: string, file: string, kind: string, generated: true, sitemap: true}[]}
 */
export function scanGenerated(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .sort()
    .map((name) => ({
      url: `/${dir}/${name.slice(0, -'.html'.length)}`,
      file: `${dir}/${name}`,
      kind: dir === 'pages/guide' ? 'guide' : 'case',
      generated: true,
      sitemap: true,
    }));
}

/** PAGES + 스캔 결과. 미생성 빌드 산출물은 경고 후 제외한다. */
function collectPages(warnings) {
  const all = [...PAGES, ...scanGenerated('pages/guide'), ...scanGenerated('pages/case')];
  return all.filter((page) => {
    if (existsSync(join(ROOT, page.file))) return true;
    if (page.generated) {
      // 콘텐츠 미발행 단계에서는 정상이다. 없는 URL 을 sitemap 에 넣으면
      // GSC 가 sitemap 전체를 오류로 남기므로 목록에서 뺀다.
      warnings.push(`건너뜀 — 아직 생성되지 않음: ${page.file} (${page.url})`);
      return false;
    }
    throw new BuildError(`${page.file} 이(가) 없다. PAGES 목록과 저장소가 어긋났다`);
  });
}

// ─── HTML 읽기 ──────────────────────────────────────────────

class BuildError extends Error {}

const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const DESC_RE = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/i;
const ROBOTS_RE = /<meta\s+name="robots"\s+content="([^"]*)"\s*\/?>/i;

/** 페이지의 title·description·robots 를 읽는다. 값의 원천은 HTML 자신이다. */
function readMeta(html, file) {
  const title = TITLE_RE.exec(html)?.[1]?.trim();
  const description = DESC_RE.exec(html)?.[1]?.trim();
  if (!title) throw new BuildError(`${file}: <title> 이 없다`);
  if (!description) throw new BuildError(`${file}: <meta name="description"> 가 없다`);
  return { title, description, robots: ROBOTS_RE.exec(html)?.[1]?.trim() ?? null };
}

/**
 * 화면에 실제로 그려진 FAQ 를 그대로 뽑는다.
 * 별도 원고에서 만들면 화면 텍스트와 어긋나 구조화 데이터 위반이 되므로
 * 반드시 페이지 HTML 자신에서 추출한다. → docs/content-strategy.md §6
 * @returns {{q: string, a: string}[]}
 */
export function extractFaq(html) {
  const heading = '<h2>자주 묻는 질문</h2>';
  const start = html.indexOf(heading);
  if (start === -1) return [];
  // 다음 <h2> 직전까지가 FAQ 구획이다 — 뒤 절의 h3 를 끌어오지 않게 자른다.
  const rest = html.slice(start + heading.length);
  const next = rest.search(/<h2[\s>]/i);
  const body = next === -1 ? rest : rest.slice(0, next);
  const items = [];
  const re = /<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    items.push({ q: stripTags(m[1]), a: stripTags(m[2]) });
  }
  return items;
}

/** 태그를 걷고 엔티티를 되돌려 화면에 보이는 문자열로 만든다. */
function stripTags(fragment) {
  return fragment
    .replace(/<[^>]*>/g, '')
    .replace(/&ldquo;/g, '\u201c')
    .replace(/&rdquo;/g, '\u201d')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── 주입 블록 조립 ─────────────────────────────────────────

function attr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * JSON-LD 직렬화. `</script>` 로 블록이 조기 종료되지 않도록 `<` 를 이스케이프한다.
 * CSP 는 이 블록을 막지 않는다 — application/ld+json 은 실행 스크립트가 아니다.
 */
function ldJson(objects) {
  return objects
    .map(
      (obj) =>
        `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003C')}</script>`
    )
    .join('\n');
}

/** 브레드크럼 — 홈 아래 모든 페이지에 붙인다. 섹션이 있으면 3단, 없으면 2단. */
function breadcrumb(page, meta) {
  const items = [{ name: '홈', url: `${ORIGIN}/` }];
  const section = { guide: ['해설', '/pages/guide'], case: ['사례 리포트', '/pages/case'] }[page.kind];
  if (section) items.push({ name: section[0], url: `${ORIGIN}${section[1]}` });
  items.push({ name: meta.title.split(' — ')[0], url: `${ORIGIN}${page.url}` });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** 페이지 유형별 구조화 데이터. → docs/content-strategy.md §6 */
function structuredData(page, meta, html) {
  const objects = [];
  const canonical = `${ORIGIN}${page.url}`;

  if (page.url === '/') {
    objects.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${ORIGIN}/`,
      description: meta.description,
      inLanguage: 'ko',
    });
    // sameAs 는 넣지 않는다 — 실제 계정이 없는 상태의 허위 신호다.
    objects.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${ORIGIN}/`,
    });
  } else {
    objects.push(breadcrumb(page, meta));
  }

  if (page.kind === 'guide' || page.kind === 'case') {
    objects.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: meta.title.split(' — ')[0],
      description: meta.description,
      inLanguage: 'ko',
      mainEntityOfPage: canonical,
      publisher: { '@type': 'Organization', name: SITE_NAME },
    });
  }

  // FAQPage 는 화면에 실제로 있는 문답에서만 만든다(§6 "화면 텍스트와 100% 일치").
  const faq = extractFaq(html);
  if (faq.length > 0) {
    objects.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }

  return objects;
}

/** canonical · OG · JSON-LD 를 한 덩어리로 만든다. */
export function buildBlock(page, meta, html) {
  const canonical = `${ORIGIN}${page.url}`;
  const ogType = page.kind === 'guide' || page.kind === 'case' ? 'article' : 'website';
  const lines = [
    BEGIN,
    `<link rel="canonical" href="${attr(canonical)}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:url" content="${attr(canonical)}">`,
    `<meta property="og:site_name" content="${attr(SITE_NAME)}">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta property="og:title" content="${attr(meta.title)}">`,
    `<meta property="og:description" content="${attr(meta.description)}">`,
    `<meta name="twitter:card" content="summary">`,
    ldJson(structuredData(page, meta, html)),
    END,
  ];
  return lines.join('\n');
}

/** 마커를 앵커로 삼아 블록을 넣거나 갈아 끼운다(멱등). */
export function inject(html, block, file) {
  if (!html.includes(MARKER)) {
    throw new BuildError(`${file}: 주입 자리 표시 주석이 없다 — head 에 다음 줄을 넣을 것\n  ${MARKER}`);
  }
  const stripped = html.replace(
    new RegExp(`\\n?${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`, 'g'),
    ''
  );
  return stripped.replace(MARKER, `${MARKER}\n${block}`);
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── sitemap ────────────────────────────────────────────────

/**
 * sitemap:true 만, 확장자 없는 URL 로 출력한다.
 * <changefreq>·<priority> 는 넣지 않는다 — 표준에 없는 값이 들어가면 오류로 잔존해
 * 재수집이 막히고, 구글은 두 값을 무시한다. → docs/content-strategy.md §6
 */
export function buildSitemap(pages, lastmod) {
  const urls = pages
    .filter((page) => page.sitemap)
    .map((page) => `  <url>\n    <loc>${ORIGIN}${page.url}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// ─── 검사 ───────────────────────────────────────────────────

/** 색인 정책과 URL 규칙의 폐합 검사. → docs/content-strategy.md §4·§6 */
export function validate(page, meta) {
  const noindex = /noindex/i.test(meta.robots ?? '');
  if (page.sitemap && noindex) {
    throw new BuildError(`${page.file}: sitemap 대상인데 noindex 다 (${meta.robots})`);
  }
  if (!page.sitemap && !noindex) {
    throw new BuildError(`${page.file}: sitemap 제외 대상인데 noindex 가 없다 — 색인 코퍼스에 들어간다`);
  }
  if (page.url.endsWith('.html')) {
    throw new BuildError(`${page.file}: URL 에 확장자가 있다 (${page.url}) — 307 리디렉션으로 색인이 깨진다`);
  }
  if (!page.url.startsWith('/')) {
    throw new BuildError(`${page.file}: URL 이 / 로 시작하지 않는다 (${page.url})`);
  }
}

// ─── 실행 ───────────────────────────────────────────────────

function main() {
  const warnings = [];
  const pages = collectPages(warnings);

  const seen = new Map();
  for (const page of pages) {
    if (seen.has(page.url)) throw new BuildError(`URL 중복: ${page.url} (${seen.get(page.url)}, ${page.file})`);
    seen.set(page.url, page.file);
  }

  // 1단계 — 전 페이지를 검사하고 결과물을 메모리에 모은다. 여기서 실패하면 아무것도 쓰지 않는다.
  const pending = [];
  for (const page of pages) {
    const path = join(ROOT, page.file);
    const html = readFileSync(path, 'utf-8');
    const meta = readMeta(html, page.file);
    validate(page, meta);
    // 정책 4종은 noindex 라 canonical·OG·구조화 데이터를 넣지 않는다 — 색인 대상이
    // 아닌 페이지에 색인 신호를 붙일 이유가 없다. 검사(noindex 유무)는 그대로 받는다.
    const next = page.sitemap ? inject(html, buildBlock(page, meta, html), page.file) : html;
    pending.push({ page, path, next, meta });
  }

  const lastmod = new Date().toISOString().slice(0, 10);
  const sitemap = buildSitemap(pages, lastmod);

  // 2단계 — 전부 통과했으므로 쓴다.
  let changed = 0;
  for (const item of pending) {
    const before = readFileSync(item.path, 'utf-8');
    if (before === item.next) continue;
    writeFileSync(item.path, item.next);
    changed += 1;
  }
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

  const indexed = pages.filter((p) => p.sitemap).length;
  for (const warning of warnings) console.warn(`  ! ${warning}`);
  console.log(`페이지 ${pages.length}개 검사 · ${changed}개 갱신 · sitemap ${indexed}개 URL (lastmod ${lastmod})`);
  for (const item of pending) {
    const faq = extractFaq(readFileSync(item.path, 'utf-8')).length;
    console.log(`  ${item.page.sitemap ? '○' : '×'} ${item.page.url}${faq ? `  FAQ ${faq}문항` : ''}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('build_seo.mjs')) {
  try {
    main();
  } catch (error) {
    if (error instanceof BuildError) {
      console.error(`서식 오류 — 아무 파일도 쓰지 않았다.\n  ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
