// scripts/build_guides.mjs — 해설 원자료(md) → 정적 HTML
// 대응 유스케이스: UC-17 (docs/use-cases.md)
// 입력: data/guide_source/*.md   출력: pages/guide/*.html + pages/guide/index.html
//
// 런타임에 JSON 을 fetch 해 그리지 않고 빌드 시점에 HTML 을 만드는 이유:
// 그 구조는 HTML 에 "불러오는 중" 만 남아 색인 코퍼스를 만들지 못한다
// (형제 프로젝트 실측: 8페이지 합계 716자). → docs/content-strategy.md §6
//
// ⚠️ 서식 오류를 발견하면 파일을 쓰지 않고 종료 코드 1 로 끝낸다.
//    어긋난 줄을 조용히 흘려보내면 내용이 통째로 사라지고 눈으로 알아채기 어렵다
//    (../BDAnalyzer/scripts/build_notes.py 정책).
//
// ⚠️ 인덱스(pages/guide/index.html)에는 K1(EDA 진행 순서 체크리스트) 본문을 싣는다.
//    목록만 있는 인덱스는 thin content 가 되어 안티패턴 #3 에 걸린다. → docs/screens.md §2
//
// ⚠️ 산출물 <head> 에 build_seo 자리 표시 주석을 넣는다 — 없으면 build_seo.mjs 가
//    exit 1 한다(색인 신호 누락을 조용히 넘기지 않기 위한 게이트).
//
// 【범위 경계】이 스크립트는 **산문 페이지와 섹션 인덱스**를 만든다. 사례 허브
// (pages/case/index.html)도 데이터셋과 무관한 산문이므로 여기서 만든다.
// build_cases.py 는 **데이터셋에서 파생되는 사례 리포트 본문**(pages/case/{slug}.html)
// 만 만들고, 그 산출물은 이 스크립트가 다시 스캔해 인덱스 목록에 반영한다.
// → docs/screens.md §2 설계 결정 2

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** build_seo.mjs 가 찾는 앵커. 문구가 바뀌면 양쪽을 같이 고친다. */
const SEO_MARKER = '<!-- canonical · OG · JSON-LD 는 scripts/build_seo.mjs 가 주입한다 -->';

const SITE_NAME = 'AutoEDA';

/** 편당 분량 하한. 미달은 경고만 하고 막지 않는다. → docs/content-strategy.md §7·§9 */
const MIN_CHARS = 800;

/**
 * 렌더 대상 섹션. `source` 의 md 를 `out` 에 HTML 로 낸다.
 * 군(group) 순서는 목록 출력 순서이며 docs/content-strategy.md §2 인벤토리 순서와 같다.
 */
// ⚠️ 인덱스를 `pages/guide/index.html` 로 내면 안 된다. 디렉토리 인덱스는
//    html_handling(auto-trailing-slash)이 `/pages/guide` → `/pages/guide/` 로 307
//    리디렉션하므로 sitemap·canonical·nav 가 전부 리디렉션 대상이 된다(실측).
//    다른 페이지와 같이 `pages/guide.html` 로 내면 `/pages/guide` 가 곧바로 200 이다.
//    → docs/tech-stack.md §6
const SECTIONS = {
  guide: {
    source: 'data/guide_source',
    indexFile: 'pages/guide.html',
    out: 'pages/guide',
    url: '/pages/guide',
    label: '해설',
    groups: ['프로세스·한국 데이터 환경', '데이터 품질', '분포', '관계', '타깃·모델링'],
  },
  case: {
    source: 'data/case_source',
    indexFile: 'pages/case.html',
    out: 'pages/case',
    url: '/pages/case',
    label: '사례 리포트',
    groups: ['사례 리포트'],
  },
};

class BuildError extends Error {}

// ─── 원자료 파싱 ────────────────────────────────────────────

const REQUIRED_KEYS = ['title', 'summary'];
const KNOWN_KEYS = new Set(['title', 'summary', 'description', 'group', 'index', 'slug']);

/**
 * 프론트매터 + 블록 본문을 파싱한다. 알 수 없는 서식은 즉시 오류다 —
 * 모르는 줄을 문단으로 흘려보내면 표가 통째로 문단이 되어도 눈에 띄지 않는다.
 * @param {string} text 원자료 전문
 * @param {string} file 오류 메시지용 파일명
 * @returns {{meta: object, blocks: object[], charCount: number}}
 */
export function parseSource(text, file) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new BuildError(`${file}:1 — 프론트매터(---)로 시작해야 한다`);
  }
  const closing = lines.indexOf('---', 1);
  if (closing === -1) throw new BuildError(`${file}:1 — 프론트매터가 닫히지 않았다`);

  const meta = {};
  for (let i = 1; i < closing; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const match = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!match) throw new BuildError(`${file}:${i + 1} — 프론트매터 형식이 아니다: ${line}`);
    const [, key, value] = match;
    if (!KNOWN_KEYS.has(key)) {
      throw new BuildError(`${file}:${i + 1} — 알 수 없는 키 "${key}" (허용: ${[...KNOWN_KEYS].join(', ')})`);
    }
    meta[key] = value.trim() === 'true' ? true : value.trim();
  }
  for (const key of REQUIRED_KEYS) {
    if (!meta[key]) throw new BuildError(`${file} — 프론트매터에 ${key} 가 없다`);
  }

  const blocks = parseBlocks(lines.slice(closing + 1), file, closing + 2);
  return { meta, blocks, charCount: countChars(blocks) };
}

/** 블록 단위 파서. 지원 블록 외의 줄은 전부 오류다. */
function parseBlocks(lines, file, offset) {
  const blocks = [];
  let i = 0;

  const lineNo = () => offset + i;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      // h1 은 title 에서 만든다. 본문에 두면 페이지에 h1 이 둘이 된다.
      throw new BuildError(`${file}:${lineNo()} — 본문에 # (h1)을 쓰지 않는다. 제목은 프론트매터 title 이다`);
    }
    if (line.startsWith('> ')) {
      const items = [];
      while (i < lines.length && lines[i].trimEnd().startsWith('> ')) {
        items.push(lines[i].trimEnd().slice(2).trim());
        i += 1;
      }
      blocks.push({ type: 'quote', text: items.join(' ') });
      continue;
    }
    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].trimEnd().startsWith('- ')) {
        items.push(lines[i].trimEnd().slice(2).trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trimEnd())) {
        items.push(lines[i].trimEnd().replace(/^\d+\.\s*/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      const startLine = lineNo();
      while (i < lines.length && lines[i].trimEnd().startsWith('|')) {
        rows.push(splitRow(lines[i].trimEnd()));
        i += 1;
      }
      if (rows.length < 3) {
        throw new BuildError(`${file}:${startLine} — 표는 헤더·구분·본문 3줄 이상이어야 한다`);
      }
      if (!rows[1].every((cell) => /^:?-{2,}:?$/.test(cell.trim()))) {
        throw new BuildError(`${file}:${startLine + 1} — 표의 둘째 줄은 구분선(---)이어야 한다`);
      }
      const width = rows[0].length;
      rows.forEach((row, index) => {
        if (row.length !== width) {
          throw new BuildError(
            `${file}:${startLine + index} — 표의 칸 수가 헤더(${width})와 다르다 (${row.length})`
          );
        }
      });
      blocks.push({ type: 'table', head: rows[0], body: rows.slice(2) });
      continue;
    }
    // 문단이 **굵게** 로 시작하는 것은 정상이므로 `**` 는 통과시키고 단일 `*` 만 막는다.
    if (/^(\*(?!\*)|[_`[\]!<])/.test(line) || line.startsWith('---')) {
      throw new BuildError(
        `${file}:${lineNo()} — 지원하지 않는 서식이다: ${line.slice(0, 40)}\n` +
          `    허용: ## ### 문단 - 1. | > 그리고 인라인 **굵게** 뿐이다`
      );
    }

    // 문단 — 빈 줄까지 이어 붙인다
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'p', text: paragraph.join(' ') });
  }

  for (const block of blocks) checkInline(block, file);
  return blocks;
}

function isBlockStart(line) {
  const t = line.trimEnd();
  return t.startsWith('## ') || t.startsWith('### ') || t.startsWith('- ') || t.startsWith('| ') || t.startsWith('|') || t.startsWith('> ') || /^\d+\. /.test(t);
}

function splitRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|');
}

/**
 * 인라인 서식 검사. 허용은 `**굵게**` 하나뿐이다.
 * 줄 시작만 보면 부족하다 — 문장 중간의 백틱·대괄호는 태그가 되지 않고
 * **화면에 기호가 그대로 남는다**(실측: 렌더된 해설에 백틱이 노출됨).
 */
function checkInline(block, file) {
  for (const text of blockTexts(block)) {
    const count = (text.match(/\*\*/g) ?? []).length;
    if (count % 2 !== 0) throw new BuildError(`${file} — ** 의 짝이 맞지 않는다: ${text.slice(0, 60)}`);
    if (/(^|[^*])\*([^*]|$)/.test(text)) {
      throw new BuildError(`${file} — 단일 * 는 허용하지 않는다(굵게 ** 만): ${text.slice(0, 60)}`);
    }
    if (text.includes('`')) {
      throw new BuildError(
        `${file} — 백틱은 허용하지 않는다(인라인 서식은 ** 하나뿐). 화면에 기호가 그대로 남는다: ${text.slice(0, 60)}`
      );
    }
    const link = /\[[^\]]*\]\([^)]*\)/.exec(text);
    if (link) {
      throw new BuildError(`${file} — 인라인 링크는 지원하지 않는다: ${link[0]}`);
    }
  }
}

function blockTexts(block) {
  if (block.type === 'table') return [...block.head, ...block.body.flat()];
  if (block.items) return block.items;
  return block.text === undefined ? [] : [block.text];
}

/** 렌더 텍스트 분량. 표·목록 포함, 서식 기호는 제외한다. */
function countChars(blocks) {
  return blocks
    .flatMap(blockTexts)
    .join('')
    .replace(/\*\*/g, '')
    .replace(/\s/g, '').length;
}

// ─── 렌더 ───────────────────────────────────────────────────

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** escapeHtml 을 먼저 걸고 나서 **굵게** 만 태그로 바꾼다(순서가 중요하다). */
export function inline(text) {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderBlocks(blocks, indent = '  ') {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'h2':
          return `${indent}<h2>${inline(block.text)}</h2>`;
        case 'h3':
          return `${indent}<h3>${inline(block.text)}</h3>`;
        case 'p':
          return `${indent}<p>${inline(block.text)}</p>`;
        case 'quote':
          return `${indent}<blockquote><p>${inline(block.text)}</p></blockquote>`;
        case 'ul':
          return `${indent}<ul>\n${block.items.map((it) => `${indent}  <li>${inline(it)}</li>`).join('\n')}\n${indent}</ul>`;
        case 'ol':
          return `${indent}<ol>\n${block.items.map((it) => `${indent}  <li>${inline(it)}</li>`).join('\n')}\n${indent}</ol>`;
        case 'table': {
          const head = block.head.map((c) => `<th>${inline(c.trim())}</th>`).join('');
          const body = block.body
            .map((row) => `${indent}    <tr>${row.map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`)
            .join('\n');
          return `${indent}<div class="table-wrap"><table>\n${indent}  <thead><tr>${head}</tr></thead>\n${indent}  <tbody>\n${body}\n${indent}  </tbody>\n${indent}</table></div>`;
        }
        default:
          throw new BuildError(`알 수 없는 블록 유형: ${block.type}`);
      }
    })
    .join('\n');
}

/** 공통 셸. 기존 수기 페이지(pages/about.html)와 같은 마크업을 쓴다. */
function page({ title, description, breadcrumb, h1, intro, body, cta = true }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${SITE_NAME}</title>
<meta name="description" content="${esc(description)}">
${SEO_MARKER}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/style.css">
</head>
<body>

<header class="site-header">
  <div class="container">
    <a class="logo" href="/">${SITE_NAME}</a>
    <nav class="site-nav" aria-label="주요 메뉴">
      <a href="/pages/analyze">데이터 분석</a>
      <a href="/pages/guide">해설</a>
      <a href="/pages/case">사례 리포트</a>
    </nav>
  </div>
</header>

<main class="container">
${breadcrumb ? `\n${breadcrumb}\n` : ''}
  <h1>${esc(h1)}</h1>
  <p class="page-intro">${inline(intro)}</p>

${body}
${
  cta
    ? `
  <hr>

  <section class="cta">
    <h2>내 데이터로 확인하기</h2>
    <p>여기서 설명한 항목을 직접 가진 파일에서 확인할 수 있습니다. 파일은 브라우저를 벗어나지 않습니다.</p>
    <p><a class="btn" href="/pages/analyze">CSV 분석하기</a></p>
  </section>
`
    : ''
}
</main>

<footer class="site-footer">
  <div class="container">
    <ul>
      <li><a href="/pages/about">소개</a></li>
      <li><a href="/pages/contact">문의</a></li>
      <li><a href="/pages/privacy">개인정보처리방침</a></li>
      <li><a href="/pages/terms">이용약관</a></li>
    </ul>
    <p>&copy; <span data-footer-year>2026</span> ${SITE_NAME}</p>
  </div>
</footer>

<script type="module" src="/js/app/common.js"></script>
<script type="module" src="/js/app/menu.js"></script>
</body>
</html>
`;
}

/** 하위 페이지의 브레드크럼. BreadcrumbList JSON-LD 는 build_seo 가 붙인다. */
function breadcrumbNav(section, title) {
  return `  <nav class="breadcrumb" aria-label="위치">
    <a href="/">홈</a> › <a href="${section.url}">${esc(section.label)}</a> › <span aria-current="page">${esc(title)}</span>
  </nav>`;
}

/** 섹션 인덱스 — 인덱스 문서 본문 + 군별 목록. 목록이 비면 목록 절 자체를 내지 않는다. */
function renderIndex(section, indexDoc, children) {
  const parts = [renderBlocks(indexDoc.blocks)];

  const byGroup = new Map();
  for (const child of children) {
    const group = child.meta.group ?? section.groups[0];
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(child);
  }

  // 발행된 하위 문서가 없으면 빈 목록·"준비 중" 문구를 내지 않는다 — 안티패턴 #5.
  if (byGroup.size > 0) {
    const ordered = [...section.groups.filter((g) => byGroup.has(g)), ...[...byGroup.keys()].filter((g) => !section.groups.includes(g))];
    const lists = ordered.map((group) => {
      const items = byGroup
        .get(group)
        .map(
          (child) =>
            `      <li><a href="${section.url}/${child.slug}">${esc(child.meta.title)}</a> — ${inline(child.meta.summary)}</li>`
        )
        .join('\n');
      return `  <h2>${esc(group)}</h2>\n  <ul class="doc-list">\n${items}\n  </ul>`;
    });
    parts.push(lists.join('\n\n'));
  }

  return parts.join('\n\n');
}

// ─── 실행 ───────────────────────────────────────────────────

/** 섹션 하나를 조립한다. 파일은 쓰지 않고 결과만 돌려준다. */
function buildSection(name, section, report) {
  const sourceDir = join(ROOT, section.source);
  if (!existsSync(sourceDir)) return [];

  const files = readdirSync(sourceDir).filter((f) => f.endsWith('.md')).sort();
  if (files.length === 0) return [];

  const docs = files.map((file) => {
    const text = readFileSync(join(sourceDir, file), 'utf-8');
    const parsed = parseSource(text, `${section.source}/${file}`);
    return { ...parsed, file, slug: parsed.meta.slug ?? file.replace(/\.md$/, '') };
  });

  const indexDocs = docs.filter((d) => d.meta.index === true);
  if (indexDocs.length === 0) {
    throw new BuildError(`${section.source} — index: true 문서가 없다. 섹션 인덱스 본문이 필요하다`);
  }
  if (indexDocs.length > 1) {
    throw new BuildError(
      `${section.source} — index: true 가 ${indexDocs.length}건이다: ${indexDocs.map((d) => d.file).join(', ')}`
    );
  }
  const indexDoc = indexDocs[0];
  const children = docs.filter((d) => d !== indexDoc);

  const slugs = new Set();
  for (const doc of children) {
    if (slugs.has(doc.slug)) throw new BuildError(`${section.source} — 슬러그 중복: ${doc.slug}`);
    slugs.add(doc.slug);
    if (!/^[a-z0-9-]+$/.test(doc.slug)) {
      throw new BuildError(`${section.source}/${doc.file} — 슬러그는 소문자·숫자·하이픈만: ${doc.slug}`);
    }
  }

  const outputs = [
    {
      path: join(ROOT, section.indexFile),
      url: section.url,
      chars: indexDoc.charCount,
      title: indexDoc.meta.title,
      html: page({
        title: indexDoc.meta.title,
        description: indexDoc.meta.description ?? indexDoc.meta.summary,
        h1: indexDoc.meta.title,
        intro: indexDoc.meta.summary,
        body: renderIndex(section, indexDoc, children),
      }),
    },
    ...children.map((doc) => ({
      path: join(ROOT, section.out, `${doc.slug}.html`),
      url: `${section.url}/${doc.slug}`,
      chars: doc.charCount,
      title: doc.meta.title,
      html: page({
        title: doc.meta.title,
        description: doc.meta.description ?? doc.meta.summary,
        breadcrumb: breadcrumbNav(section, doc.meta.title),
        h1: doc.meta.title,
        intro: doc.meta.summary,
        body: renderBlocks(doc.blocks),
      }),
    })),
  ];

  report.push({ section: name, outputs });
  return outputs;
}

function main() {
  const report = [];
  const pending = [];

  // 1단계 — 전 섹션을 파싱·검사하고 결과를 메모리에 모은다. 실패하면 아무것도 쓰지 않는다.
  for (const [name, section] of Object.entries(SECTIONS)) {
    pending.push(...buildSection(name, section, report));
  }
  if (pending.length === 0) {
    console.log('원자료가 없다 — 생성할 것이 없음 (data/guide_source, data/case_source)');
    return;
  }

  // 2단계 — 전부 통과했으므로 쓴다.
  for (const item of pending) {
    mkdirSync(dirname(item.path), { recursive: true });
    writeFileSync(item.path, item.html);
  }

  // 발행된 슬러그 목록 — 도구 화면이 이것으로 '자세히' 링크를 걸러 404 를 막는다.
  // 파일 시스템이 원천이므로 해설을 발행하면 링크가 자동으로 살아난다.
  writeFileSync(
    join(ROOT, 'data/published.json'),
    `${JSON.stringify(
      Object.fromEntries(
        report.map((group) => [
          group.section,
          group.outputs.filter((o) => o.url !== SECTIONS[group.section].url).map((o) => o.url.split('/').pop()),
        ])
      ),
      null,
      2
    )}\n`
  );

  // 3단계 — 분량 집계. 하한 미달은 경고만 한다(발행 여부는 사람이 판단).
  let total = 0;
  const thin = [];
  for (const group of report) {
    console.log(`[${group.section}]`);
    for (const out of group.outputs) {
      total += out.chars;
      const flag = out.chars < MIN_CHARS ? `  ← ${MIN_CHARS}자 미달` : '';
      if (out.chars < MIN_CHARS) thin.push(out.url);
      console.log(`  ${out.url.padEnd(38)} ${String(out.chars).padStart(6)}자${flag}`);
    }
  }
  console.log(`\n합계 ${total.toLocaleString('ko-KR')}자 / 목표 25,000자 (${Math.round((total / 25000) * 100)}%)`);
  if (thin.length > 0) {
    console.warn(`\n! ${MIN_CHARS}자 미달 ${thin.length}건 — thin content 경고 대상이다`);
    console.warn(`  ${thin.join('\n  ')}`);
  }
  console.log('\n다음: npm run build:seo (canonical·OG·JSON-LD·sitemap 갱신)');
}

if (process.argv[1] && process.argv[1].endsWith('build_guides.mjs')) {
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

export { SECTIONS, MIN_CHARS, renderBlocks, BuildError };
