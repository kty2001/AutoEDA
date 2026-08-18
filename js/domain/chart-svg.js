// domain/chart-svg.js — SVG 문자열 생성 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-06, UC-07, UC-08 (docs/use-cases.md)
// 의존 위치: chart-select.js 를 소비한다. 그래프의 최하류이며 아무것도 역참조하지 않는다.
//            → docs/data-model.md §6
//
// document.createElement 를 쓰지 않고 문자열을 반환하므로 순수 함수로 유지되고
// node --test 로 검증할 수 있다(표현 레이어에 있지만 js/domain/ 에 두는 이유).
//
// ⚠️ CSP 가 style-src 'self' 이므로 인라인 style= 속성을 쓸 수 없다.
//    fill / stroke / stroke-width 같은 presentation attribute 와 class 만 사용한다.
//    SVG 에서는 이것으로 충분하므로 'unsafe-inline' 을 열지 않는다. → _headers, docs/tech-stack.md §6
// ⚠️ 값에서 온 문자열(열 이름·범주 값)은 반드시 이스케이프한다. XSS 경로가 된다.

/** 차트 5종 공용 캔버스 규격. viewBox 좌표계이므로 표시 크기는 CSS 가 정한다. */
const W = 400;
const H = 220;
const M = { top: 16, right: 12, bottom: 32, left: 48 };
const PLOT = { x: M.left, y: M.top, w: W - M.left - M.right, h: H - M.top - M.bottom };

const LABEL_MAX = 12; // 축·범주 레이블 최대 표시 길이

/**
 * 값 범위를 픽셀 좌표로 매핑하는 선형 스케일을 만든다.
 * 도메인 폭이 0(상수 값)이면 범위 중앙에 고정한다.
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {(v: number) => number}
 */
export function linearScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/**
 * 축(선·눈금 레이블)을 SVG 문자열로 만든다.
 * @param {{ orient: 'x'|'y', ticks: Array<{ pos: number, label: string }>, title?: string }} axisSpec
 * @returns {string}
 */
export function renderAxis(axisSpec) {
  // 제목·눈금 레이블은 열 이름 등 값에서 온 문자열일 수 있으므로 여기서 이스케이프한다
  const { orient, ticks } = axisSpec;
  const title = axisSpec.title === undefined ? undefined : escapeXml(axisSpec.title);
  const parts = [`<g class="axis axis-${orient}">`];
  if (orient === 'x') {
    const y = PLOT.y + PLOT.h;
    parts.push(line(PLOT.x, y, PLOT.x + PLOT.w, y, 'axis-line'));
    for (const t of ticks) {
      parts.push(text(t.pos, y + 14, escapeXml(t.label), 'tick', 'middle'));
    }
    if (title) parts.push(text(PLOT.x + PLOT.w / 2, H - 4, title, 'axis-title', 'middle'));
  } else {
    parts.push(line(PLOT.x, PLOT.y, PLOT.x, PLOT.y + PLOT.h, 'axis-line'));
    for (const t of ticks) {
      parts.push(text(PLOT.x - 6, t.pos + 3, escapeXml(t.label), 'tick', 'end'));
    }
    if (title) parts.push(text(10, PLOT.y - 4, title, 'axis-title', 'start'));
  }
  parts.push('</g>');
  return parts.join('');
}

/**
 * ChartSpec 하나를 완성된 <svg> 문자열로 렌더한다.
 * @param {{ kind: string, data: object, axis: object }} spec
 * @returns {string}
 */
export function renderChart(spec) {
  const body = RENDERERS[spec.kind]?.(spec.data, spec.axis) ?? '';
  return (
    `<svg viewBox="0 0 ${W} ${H}" class="chart chart-${spec.kind}" role="img">` +
    `<title>${escapeXml(chartTitle(spec))}</title>` +
    body +
    '</svg>'
  );
}

/**
 * SVG/HTML 삽입용 이스케이프. 렌더보다 먼저 적용한다.
 * @param {string} value
 * @returns {string}
 */
export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// ─── 종류별 렌더러 ──────────────────────────────────────────

const RENDERERS = {
  histogram(data, axis) {
    const { binEdges, counts } = data;
    const x = linearScale([binEdges[0], binEdges[binEdges.length - 1]], [PLOT.x, PLOT.x + PLOT.w]);
    const y = linearScale([0, Math.max(...counts, 1)], [PLOT.y + PLOT.h, PLOT.y]);
    const bars = counts
      .map((c, i) => {
        const x0 = x(binEdges[i]);
        const x1 = x(binEdges[i + 1]);
        return rect(x0, y(c), Math.max(x1 - x0 - 1, 1), PLOT.y + PLOT.h - y(c), 'bar');
      })
      .join('');
    const fmt = axis.time ? fmtDate : fmtNum;
    const annotation = skewAnnotation(axis.highlight?.skewness);
    return (
      bars +
      renderAxis({
        orient: 'x',
        title: axis.x,
        ticks: [
          { pos: PLOT.x, label: fmt(binEdges[0]) },
          { pos: PLOT.x + PLOT.w, label: fmt(binEdges[binEdges.length - 1]) },
        ],
      }) +
      renderAxis({ orient: 'y', title: axis.y, ticks: [{ pos: PLOT.y, label: fmtNum(Math.max(...counts, 1)) }] }) +
      annotation
    );
  },

  boxplot(data, axis) {
    const values = [data.min, data.max, data.bounds?.lower, data.bounds?.upper].filter(
      (v) => v !== undefined
    );
    const x = linearScale([Math.min(...values), Math.max(...values)], [PLOT.x, PLOT.x + PLOT.w]);
    const cy = PLOT.y + PLOT.h / 2;
    const boxH = 60;
    const parts = [
      line(x(data.min), cy, x(data.q1), cy, 'whisker'),
      line(x(data.q3), cy, x(data.max), cy, 'whisker'),
      line(x(data.min), cy - 10, x(data.min), cy + 10, 'whisker'),
      line(x(data.max), cy - 10, x(data.max), cy + 10, 'whisker'),
      rect(x(data.q1), cy - boxH / 2, Math.max(x(data.q3) - x(data.q1), 1), boxH, 'box'),
      line(x(data.median), cy - boxH / 2, x(data.median), cy + boxH / 2, 'median'),
    ];
    if (data.bounds) {
      // 이상치 경계 — 박스 요소와 구분되는 점선 (stroke-dasharray 는 presentation attribute)
      for (const bound of [data.bounds.lower, data.bounds.upper]) {
        parts.push(
          `<line x1="${n(x(bound))}" y1="${PLOT.y}" x2="${n(x(bound))}" y2="${PLOT.y + PLOT.h}" class="bound" stroke-dasharray="4 3"/>`
        );
      }
    }
    parts.push(
      renderAxis({
        orient: 'x',
        title: axis.x,
        ticks: [
          { pos: x(data.min), label: fmtNum(data.min) },
          { pos: x(data.median), label: fmtNum(data.median) },
          { pos: x(data.max), label: fmtNum(data.max) },
        ],
      })
    );
    return parts.join('');
  },

  bar(data, axis) {
    const items = data.items;
    const x = linearScale([0, Math.max(...items.map((d) => d.count), 1)], [0, PLOT.w]);
    const rowH = PLOT.h / items.length;
    const barH = Math.min(rowH * 0.7, 24);
    const parts = items.map((d, i) => {
      const cy = PLOT.y + rowH * i + rowH / 2;
      return (
        rect(PLOT.x, cy - barH / 2, Math.max(x(d.count), 1), barH, 'bar') +
        text(PLOT.x - 6, cy + 3, truncate(d.value), 'tick', 'end') +
        text(PLOT.x + x(d.count) + 4, cy + 3, fmtNum(d.count), 'value', 'start')
      );
    });
    parts.push(renderAxis({ orient: 'x', title: axis.x, ticks: [] }));
    return parts.join('');
  },

  scatter(data, axis) {
    const xs = data.points.map((p) => p[0]);
    const ys = data.points.map((p) => p[1]);
    const x = linearScale(pad(Math.min(...xs), Math.max(...xs)), [PLOT.x, PLOT.x + PLOT.w]);
    const y = linearScale(pad(Math.min(...ys), Math.max(...ys)), [PLOT.y + PLOT.h, PLOT.y]);
    const dots = data.points
      .map((p) => `<circle cx="${n(x(p[0]))}" cy="${n(y(p[1]))}" r="2.5" class="dot"/>`)
      .join('');
    return (
      dots +
      renderAxis({
        orient: 'x',
        title: axis.x,
        ticks: [
          { pos: PLOT.x, label: fmtNum(Math.min(...xs)) },
          { pos: PLOT.x + PLOT.w, label: fmtNum(Math.max(...xs)) },
        ],
      }) +
      renderAxis({
        orient: 'y',
        title: axis.y,
        ticks: [
          { pos: PLOT.y + PLOT.h, label: fmtNum(Math.min(...ys)) },
          { pos: PLOT.y, label: fmtNum(Math.max(...ys)) },
        ],
      })
    );
  },

  heatmap(data, axis) {
    const { names, cells, reduced } = data;
    const size = Math.min(PLOT.w, PLOT.h) / names.length;
    const originX = PLOT.x;
    const originY = PLOT.y;
    const byKey = new Map();
    for (const c of cells) {
      byKey.set(`${c.row}:${c.col}`, c.value);
      byKey.set(`${c.col}:${c.row}`, c.value); // 대칭 채움
    }
    const parts = [];
    for (let r = 0; r < names.length; r++) {
      for (let c = 0; c < names.length; c++) {
        const value = r === c ? 1 : byKey.get(`${r}:${c}`);
        if (value === undefined) continue;
        parts.push(
          `<rect x="${n(originX + c * size)}" y="${n(originY + r * size)}" width="${n(size)}" height="${n(size)}" fill="${divergingColor(value)}" class="cell"><title>${escapeXml(names[r])} × ${escapeXml(names[c])}: ${fmtNum(value)}</title></rect>`
        );
      }
      parts.push(text(originX - 6, originY + r * size + size / 2 + 3, truncate(names[r]), 'tick', 'end'));
    }
    if (reduced) {
      parts.push(text(W - M.right, 12, `분산 상위 ${names.length}열로 축소됨`, 'annotation', 'end'));
    }
    parts.push(text(originX, H - 4, `${axis.method} 상관`, 'axis-title', 'start'));
    return parts.join('');
  },
};

// ─── 공용 도우미 ────────────────────────────────────────────

function chartTitle(spec) {
  const { axis } = spec;
  if (spec.kind === 'scatter') return `${axis.x} × ${axis.y} 산점도`;
  if (spec.kind === 'heatmap') return '상관 히트맵';
  return `${axis.x ?? ''} ${KIND_LABEL[spec.kind] ?? spec.kind}`.trim();
}

const KIND_LABEL = { histogram: '히스토그램', boxplot: '박스플롯', bar: '빈도 막대' };

function skewAnnotation(skewness) {
  if (skewness === undefined || skewness === null || Math.abs(skewness) < 1) return '';
  const label = skewness > 0 ? '오른쪽으로 긴 꼬리 →' : '← 왼쪽으로 긴 꼬리';
  const anchor = skewness > 0 ? 'end' : 'start';
  const xPos = skewness > 0 ? PLOT.x + PLOT.w : PLOT.x;
  return text(xPos, PLOT.y - 4, label, 'annotation', anchor);
}

/** 발산 배색의 중립점. 채도 없는 값이어야 0 부근이 두 극과 섞이지 않는다. */
const HEATMAP_NEUTRAL = [237, 235, 233]; // Ceramic #edebe9 (docs/DESIGN.md §2)
/** 양(+)은 Green Accent, 음(-)은 Red. 두 극 모두 docs/DESIGN.md §2 팔레트다. */
const HEATMAP_POS = [0, 117, 74];   // #00754a
const HEATMAP_NEG = [200, 32, 20];  // #c82014

/**
 * [-1, 1] -> 중립색을 가운데 둔 2색 발산 색. 인라인 style 없이 fill 속성으로 쓴다.
 * 색만으로 값을 읽게 하지 않는다 - 각 셀에 <title> 로 수치가 붙는다.
 * 두 극의 색각 이상 분리도는 검증했다 (deutan dE 9.9 > 8).
 */
function divergingColor(value) {
  const v = Math.max(-1, Math.min(1, value));
  const t = Math.abs(v);
  const pole = v >= 0 ? HEATMAP_POS : HEATMAP_NEG;
  const ch = HEATMAP_NEUTRAL.map((from, i) => Math.round(from + (pole[i] - from) * t));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function pad(min, max) {
  const p = (max - min || 1) * 0.05;
  return [min - p, max + p];
}

function truncate(value) {
  const s = escapeXml(value);
  return s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX)}…` : s;
}

/** 좌표값 표기 — 부동소수 잔여 자릿수로 SVG 가 비대해지지 않게 한다. */
function n(value) {
  return Math.round(value * 10) / 10;
}

function fmtNum(value) {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(3)));
}

function fmtDate(epochMs) {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function rect(x, y, w, h, cls) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" class="${cls}"/>`;
}

function line(x1, y1, x2, y2, cls) {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" class="${cls}"/>`;
}

function text(x, y, content, cls, anchor) {
  return `<text x="${n(x)}" y="${n(y)}" class="${cls}" text-anchor="${anchor}" font-size="10">${content}</text>`;
}
