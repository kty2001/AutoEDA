// 자체 호스팅 폰트 수집 — Google Fonts 의 subset 슬라이스를 fonts/ 로 미러링한다.
//
// 왜 미러링인가: _headers 의 CSP 가 `font-src 'self'` 라 Google Fonts 를 직접 참조할 수 없다.
// 통짜 subset 을 만들지 않고 슬라이스를 그대로 가져오는 이유는 unicode-range 가 보존되어
// 브라우저가 실제로 쓰는 구간만 내려받기 때문이다(한글 통짜 subset 은 weight 당 400KB+).
//
// 실행: node scripts/fetch_fonts.mjs   (1회성. 서체·웨이트를 바꿀 때만 다시 돈다)
// 산출: fonts/*.woff2 + css/fonts.css
// 규약: 하나라도 실패하면 파일을 쓰지 않고 exit 1 (docs/implementation-status.md §2 규약 7)
//
// 서체 근거: docs/DESIGN.md §3 — Latin 은 SoDoSans 대체(Inter), 한글은 Noto Sans KR.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'fonts');

// 오래된 UA 를 보내면 woff2 대신 ttf 가 온다.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** subsets: null 이면 전량. 문자열 배열이면 그 이름의 subset 만 남긴다. */
const FAMILIES = [
  { name: 'Inter', slug: 'inter', weights: [400, 600], subsets: ['latin', 'latin-ext'] },
  { name: 'Noto Sans KR', slug: 'noto-sans-kr', weights: [400, 600], subsets: null },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

// @font-face 블록을 앞선 subset 주석과 함께 끊어 낸다.
function parseFaces(css) {
  const faces = [];
  const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const body = m[2];
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
    const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(body)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    if (!weight || !url) throw new Error(`@font-face 파싱 실패:\n${m[0]}`);
    faces.push({ subset: m[1] ?? null, weight, url, range });
  }
  if (faces.length === 0) throw new Error('@font-face 를 하나도 찾지 못했다');
  return faces;
}

/** 파일명. subset 주석이 없는 한글 슬라이스는 URL 끝의 `.<n>.woff2` 인덱스를 쓴다. */
function fileNameOf(family, face, i) {
  const label = face.subset ?? /\.(\d+)\.woff2$/.exec(face.url)?.[1] ?? String(i);
  return `${family.slug}-${face.weight}-${label}.woff2`;
}

async function main() {
  mkdirSync(FONT_DIR, { recursive: true });

  const blocks = [];
  let downloaded = 0;
  let reused = 0;

  for (const family of FAMILIES) {
    const query = `family=${encodeURIComponent(family.name)}:wght@${family.weights.join(';')}`;
    const css = await fetchText(`https://fonts.googleapis.com/css2?${query}&display=swap`);
    const faces = parseFaces(css).filter(
      (f) => family.subsets === null || (f.subset && family.subsets.includes(f.subset)),
    );
    if (faces.length === 0) throw new Error(`${family.name}: 남은 subset 이 없다`);

    for (const [i, face] of faces.entries()) {
      const name = fileNameOf(family, face, i);
      const path = join(FONT_DIR, name);
      if (existsSync(path) && readFileSync(path).length > 0) {
        reused += 1;
      } else {
        const res = await fetch(face.url, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`${res.status} — ${face.url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new Error(`빈 응답 — ${face.url}`);
        writeFileSync(path, buf);
        downloaded += 1;
      }
      blocks.push(
        `@font-face {\n` +
          `  font-family: '${family.name}';\n` +
          `  font-style: normal;\n` +
          `  font-weight: ${face.weight};\n` +
          `  font-display: swap;\n` +
          `  src: url(/fonts/${name}) format('woff2');\n` +
          (face.range ? `  unicode-range: ${face.range};\n` : '') +
          `}`,
      );
    }
    console.log(`${family.name} — ${faces.length}개 슬라이스`);
  }

  // 전부 성공한 뒤에 쓴다.
  const header =
    '/* 생성물 — 직접 고치지 않는다. scripts/fetch_fonts.mjs 가 만든다.\n' +
    '   CSP 가 font-src \'self\' 이므로 Google Fonts 를 직접 참조하지 않고 미러링한다. */\n\n';
  writeFileSync(join(ROOT, 'css', 'fonts.css'), header + blocks.join('\n\n') + '\n');
  console.log(`@font-face ${blocks.length}개 · 내려받음 ${downloaded} · 재사용 ${reused} → css/fonts.css`);
}

main().catch((err) => {
  console.error(`폰트 수집 실패: ${err.message}`);
  process.exit(1);
});
