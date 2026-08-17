// app/analyze.page.js — 도구 화면 전용 (Presentation)
// 대응 유스케이스: UC-01 ~ UC-11, UC-15 (docs/use-cases.md)
// 대응 화면: /pages/analyze — 4상태 단일 페이지 (docs/screens.md §3.2·§4)
//
// 상태 A 파일 선택 → B 진행(Worker) → C 결과(5섹션 탭) → D 오류
// 상태를 히스토리에 넣지 않는다 — 뒤로가기로 결과가 사라지는 혼란을 만들지 않는다.
// 대신 해설 페이지에서 돌아오면 sessionStorage 로 결과를 복원한다(docs/screens.md §4).
//
// 모든 분석 UC 가 이 파일에 몰리는 것은 단일 페이지 구조의 귀결이다.
// 과대해지면 상태별 렌더 모듈로 분할하되, js/domain/* 이 DOM 을 참조하지 않는 계약은 유지한다
// — 분할은 Presentation 내부 문제로 한정한다. → docs/use-cases.md §6
//
// 동적 텍스트는 esc() 를 거치거나 textContent 로 넣는다 — 열 이름·범주 값이 XSS 경로다.

import { selectForColumn, selectPairs, selectHeatmap } from '../domain/chart-select.js';
import { renderChart, escapeXml as esc } from '../domain/chart-svg.js';
import { DISPLAY_LIMIT } from '../domain/thresholds.js';
import { percent, count, stat, bytes } from '../lib/format.js';
import { saveResult, loadResult, clearResult, loadPrefs, savePrefs } from '../storage/local.js';

/** @typedef {'A'|'B'|'C'|'D'} State */

const STATE_SECTION = {
  A: 'state-select',
  B: 'state-progress',
  C: 'state-result',
  D: 'state-error',
};

const STAGE_LABEL = {
  decode: '인코딩 감지',
  parse: 'CSV 파싱',
  infer: '타입 추론',
  stats: '통계 계산',
  finding: '발견 정리',
};

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'quality', label: '품질' },
  { id: 'findings', label: '발견' },
  { id: 'columns', label: '변수별' },
  { id: 'relations', label: '관계' },
];

const TYPE_LABEL = {
  numeric: '수치', categorical: '범주', datetime: '날짜', boolean: '불리언', id: 'ID', text: '텍스트',
};
const SEVERITY_LABEL = { high: '높음', medium: '중간', low: '낮음' };
const GRADE_LABEL = { good: '양호', fair: '주의', poor: '문제 있음' };
const HEALTH_LABEL = {
  missing: '결측', duplicate: '중복 행', constant: '상수·준상수 열',
  cardinality: '고카디널리티', outlier: '이상치', invalid: '유효하지 않은 값',
};
const VERDICT_LABEL = { ok: '양호', warn: '주의', bad: '문제' };
const DELIMITER_LABEL = { ',': '쉼표', ';': '세미콜론', '\t': '탭', '|': '파이프' };

// 화면 상태 (원본 파일 핸들은 재계산용으로만 메모리에 두며 어디에도 저장하지 않는다)
let currentFile = null;
let currentResult = null;
let currentWorker = null;
let typeOverrides = {};
let findingMapPromise = null;

/** 상태를 전환하고 해당 섹션만 노출한다. */
export function setState(state) {
  for (const [key, id] of Object.entries(STATE_SECTION)) {
    document.getElementById(id)?.classList.toggle('is-active', key === state);
  }
}

/**
 * 파일 선택·드래그 앤 드롭을 받아 Worker 를 기동한다. (UC-01)
 * @param {File} file
 * @param {{ encoding?: string, resetOverrides?: boolean }} [options]
 *   encoding: 상태 D 의 인코딩 수동 선택 재시도 경로.
 *   resetOverrides: 기본 true — 새 파일에는 이전 파일의 타입 수정을 물려주지 않는다
 *   (열 이름이 우연히 겹치면 엉뚱한 열에 적용된다)
 */
export function startAnalysis(file, options = {}) {
  currentFile = file;
  if (options.resetOverrides !== false) typeOverrides = {};
  runWorker(options.encoding);
}

/** Worker 를 (재)기동한다. 타입 수정 재계산도 이 경로를 다시 탄다(docs/data-model.md §5). */
function runWorker(encoding) {
  currentWorker?.terminate();
  currentWorker = new Worker('/js/worker/analyze.worker.js', { type: 'module' });
  currentWorker.addEventListener('message', (event) => handleWorkerMessage(event.data));
  setState('B');
  setProgress('준비 중', 0);
  currentWorker.postMessage({
    type: 'start',
    file: currentFile,
    encoding,
    typeOverrides: Object.keys(typeOverrides).length > 0 ? typeOverrides : undefined,
  });
}

function setProgress(label, ratio) {
  const stage = document.getElementById('progress-stage');
  const bar = document.getElementById('progress-bar');
  if (stage) stage.textContent = label;
  if (bar) bar.value = Math.round(ratio * 100);
}

/** Worker 메시지를 상태 전환·렌더로 연결한다. (docs/data-model.md §5) */
export function handleWorkerMessage(message) {
  switch (message.type) {
    case 'progress':
      setProgress(STAGE_LABEL[message.stage] ?? message.stage, message.ratio);
      return;
    case 'done': {
      const cache = saveResult(message.result);
      renderResult(message.result, cacheNotice(cache));
      setState('C');
      return;
    }
    case 'error':
      renderError(message.code, message.detail);
      setState('D');
      return;
  }
}

/** 캐시 축소·실패 안내문 (docs/screens.md §5 — 조용히 실패하지 않는다). */
function cacheNotice(cache) {
  if (!cache.saved) return '결과가 커서 임시 보관에 실패했습니다. 다른 페이지에 다녀오면 다시 분석해야 합니다.';
  if (cache.degraded === 'no-histogram') return '결과가 커서 분포 차트를 제외하고 임시 보관했습니다. 복귀 시 분포 차트는 다시 계산됩니다.';
  if (cache.degraded === 'reduced-correlations') return '결과가 커서 분포 차트와 낮은 상관 쌍을 제외하고 임시 보관했습니다.';
  return null;
}

// ─── 오류 상태 D (docs/data-model.md §5.1 과 1:1) ───────────

function renderError(code, detail) {
  const message = document.getElementById('error-message');
  const actions = document.getElementById('error-actions');
  if (!message || !actions) return;
  actions.innerHTML = '';

  const backButton = button('다른 파일 선택', 'btn btn-secondary', () => setState('A'));

  switch (code) {
    case 'ENCODING_UNDETECTED':
      message.textContent = '문자 인코딩을 감지하지 못했습니다. 인코딩을 직접 골라 다시 시도해 주세요.';
      actions.append(
        button('UTF-8로 열기', 'btn', () => runWorker('utf-8')),
        ' ',
        button('EUC-KR로 열기', 'btn', () => runWorker('euc-kr')),
        ' ',
        backButton
      );
      return;
    case 'FILE_TOO_LARGE':
      message.textContent = `${detailText(detail)} 행 수를 줄이거나 필요한 열만 남긴 파일로 다시 시도해 주세요.`;
      actions.append(backButton);
      return;
    case 'SCHEMA_MISMATCH':
      message.textContent = `불러온 파일이 이 도구의 결과 형식과 맞지 않습니다. ${detailText(detail)}`;
      actions.append(backButton);
      return;
    default: // PARSE_FAILED
      message.textContent = `CSV를 해석하지 못했습니다. ${detailText(detail)} 해당 행을 확인한 뒤 다시 시도해 주세요.`;
      actions.append(backButton);
  }
}

function detailText(detail) {
  if (detail == null) return '';
  if (typeof detail === 'object') {
    return detail.line !== undefined ? `${detail.line}행: ${detail.reason ?? ''}` : JSON.stringify(detail);
  }
  return String(detail);
}

// ─── 상태 C — 결과 5섹션 (UC-03 ~ UC-08) ────────────────────

/**
 * 결과 5섹션(개요·품질·발견·변수별·관계)을 렌더한다.
 * @param {object} result 결과 JSON (docs/data-model.md §3)
 * @param {string|null} [notice] 캐시 축소 등 결과 화면에 표시할 안내
 */
export function renderResult(result, notice = null) {
  currentResult = result;
  const tabs = document.getElementById('result-tabs');
  const panels = document.getElementById('result-panels');
  if (!tabs || !panels) return;
  tabs.innerHTML = '';
  panels.innerHTML = '';

  if (notice) {
    const p = document.createElement('p');
    p.className = 'result-notice';
    p.textContent = notice;
    panels.appendChild(p);
  }

  const renderers = {
    overview: renderOverview,
    quality: renderQuality,
    findings: renderFindings,
    columns: renderColumns,
    relations: renderRelations,
  };

  const panelById = {};
  for (const tab of TABS) {
    const panel = document.createElement('div');
    panel.id = `panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    renderers[tab.id](panel, result);
    panels.appendChild(panel);
    panelById[tab.id] = panel;
  }

  const activate = (id) => {
    for (const tab of TABS) {
      const btn = tabs.querySelector(`[data-tab="${tab.id}"]`);
      btn?.setAttribute('aria-selected', String(tab.id === id));
      panelById[tab.id].hidden = tab.id !== id;
    }
    savePrefs({ activeTab: id });
  };

  for (const tab of TABS) {
    const btn = button(tab.label, 'tab', () => activate(tab.id));
    btn.setAttribute('role', 'tab');
    btn.dataset.tab = tab.id;
    tabs.appendChild(btn);
  }

  const preferred = loadPrefs().activeTab;
  activate(TABS.some((t) => t.id === preferred) ? preferred : 'overview');
}

// 개요 — 데이터셋 기본 정보 + 열 목록 (타입 배지·오버라이드, UC-02·03)
function renderOverview(panel, result) {
  const d = result.dataset;
  panel.insertAdjacentHTML(
    'beforeend',
    `<div class="table-wrap"><table><tbody>
      <tr><th>행 수</th><td>${count(d.rowCount)}</td><th>열 수</th><td>${count(d.columnCount)}</td></tr>
      <tr><th>완전 중복 행</th><td>${count(d.duplicateRowCount)}</td><th>메모리 추정</th><td>${bytes(d.memoryBytes)}</td></tr>
      <tr><th>인코딩</th><td>${esc(d.encoding)}</td><th>구분자</th><td>${esc(DELIMITER_LABEL[d.delimiter] ?? d.delimiter)}</td></tr>
    </tbody></table></div>
    <h3>열 목록</h3>
    <p class="hint">타입이 잘못 잡혔으면 직접 바꿀 수 있습니다. 바꾸면 전체를 다시 계산합니다.</p>`
  );

  const rows = result.columns
    .map(
      (col) => `<tr>
        <td>${esc(col.name)}</td>
        <td>${typeCell(col)}</td>
        <td>${percent(col.missingRate)}</td>
        <td>${percent(col.invalidRate)}</td>
        <td>${count(col.uniqueCount)}</td>
        <td class="samples">${esc(col.evidence?.sampleValues?.join(', ') ?? '')}</td>
      </tr>`
    )
    .join('');
  panel.insertAdjacentHTML(
    'beforeend',
    `<div class="table-wrap"><table>
      <thead><tr><th>이름</th><th>타입</th><th>결측</th><th>불일치</th><th>고유값</th><th>표본</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`
  );

  // 타입 오버라이드 — 원본 파일 핸들이 있어야 재계산할 수 있다(복원·불러오기 결과는 불가)
  for (const select of panel.querySelectorAll('select[data-column]')) {
    if (!currentFile) {
      select.disabled = true;
      select.title = '파일을 다시 선택하면 타입을 바꿀 수 있습니다';
      continue;
    }
    select.addEventListener('change', () => {
      typeOverrides[select.dataset.column] = select.value;
      runWorker();
    });
  }
}

function typeCell(col) {
  const options = Object.entries(TYPE_LABEL)
    .map(([value, label]) => `<option value="${value}"${value === col.type ? ' selected' : ''}>${label}</option>`)
    .join('');
  const overridden = col.typeOverridden ? ' <span class="badge">수정됨</span>' : '';
  return `<select data-column="${esc(col.name)}" aria-label="${esc(col.name)} 타입">${options}</select>${overridden}`;
}

// 품질 — Health Score (UC-04)
function renderQuality(panel, result) {
  const h = result.health;
  panel.insertAdjacentHTML(
    'beforeend',
    `<p class="health-total">
      <strong class="verdict-${gradeClass(h.grade)}">${h.total}점 · ${GRADE_LABEL[h.grade] ?? esc(h.grade)}</strong>
      — 100점에서 항목별로 감점한 값입니다. 근거는 아래 표와 같습니다.
    </p>`
  );
  const rows = h.items
    .map(
      (item) => `<tr>
        <td>${HEALTH_LABEL[item.key] ?? esc(item.key)}</td>
        <td class="verdict-${item.verdict}">${VERDICT_LABEL[item.verdict]}</td>
        <td>−${item.penalty}</td>
        <td>${evidenceText(item.evidence)}</td>
      </tr>`
    )
    .join('');
  panel.insertAdjacentHTML(
    'beforeend',
    `<div class="table-wrap"><table>
      <thead><tr><th>항목</th><th>판정</th><th>감점</th><th>근거</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`
  );
}

function gradeClass(grade) {
  return grade === 'good' ? 'ok' : grade === 'fair' ? 'warn' : 'bad';
}

/** evidence 를 사람이 읽는 문장으로. 점수만 보여주고 근거를 감추지 않는다(rules.md §1). */
function evidenceText(evidence) {
  const parts = [];
  if (evidence.avgMissingRate !== undefined) parts.push(`평균 결측률 ${percent(evidence.avgMissingRate)}`);
  if (evidence.duplicateRowCount !== undefined) parts.push(`중복 ${count(evidence.duplicateRowCount)}행 (${percent(evidence.duplicateRate)})`);
  if (evidence.avgOutlierRate !== undefined) parts.push(`평균 이상치율 ${percent(evidence.avgOutlierRate)}`);
  if (evidence.avgInvalidRate !== undefined) parts.push(`평균 불일치율 ${percent(evidence.avgInvalidRate)}`);
  if (evidence.count !== undefined) parts.push(`해당 열 ${count(evidence.count)}개`);
  if (evidence.columns?.length) parts.push(evidence.columns.map(esc).join(', '));
  if (evidence.worst?.length) parts.push(evidence.worst.map((w) => `${esc(w.name)} ${percent(w.rate)}`).join(', '));
  return parts.join(' — ') || '—';
}

// 발견 — Finding 목록 (UC-05·06, 기본 15건 + 전체 보기)
function renderFindings(panel, result) {
  if (result.findings.length === 0) {
    panel.insertAdjacentHTML('beforeend', '<p>확인할 문제가 발견되지 않았습니다. 변수별·관계 탭에서 분포를 직접 살펴보세요.</p>');
    return;
  }

  const list = document.createElement('ol');
  list.className = 'findings';
  result.findings.forEach((f, i) => {
    const item = document.createElement('li');
    item.className = `finding severity-${f.severity}`;
    if (i >= DISPLAY_LIMIT.findings) item.hidden = true;
    item.innerHTML = `
      <p class="finding-head">
        <span class="badge severity-${f.severity}">${SEVERITY_LABEL[f.severity]}</span>
        ${f.mlRelevant ? '<span class="badge badge-ml">ML</span>' : ''}
        <strong>${esc(f.what)}</strong>
      </p>
      <p class="finding-why">${esc(f.why)}</p>
      <p class="finding-how">${esc(f.how)} <span data-guide-link="${esc(f.type)}"></span></p>`;
    list.appendChild(item);
  });
  panel.appendChild(list);

  if (result.findings.length > DISPLAY_LIMIT.findings) {
    const more = button(`전체 보기 (${result.findings.length}건)`, 'btn btn-secondary', () => {
      for (const li of list.children) li.hidden = false;
      more.remove();
    });
    panel.appendChild(more);
  }

  attachGuideLinks(panel);
}

/**
 * Finding 유형 → 해설 링크(UC-15). 매핑에 없는 유형은 링크를 렌더하지 않는다.
 * 아직 발행되지 않은 해설도 링크하지 않는다 — `data/published.json`(build_guides 산출물)이
 * 발행된 슬러그의 원천이다. 이 게이트가 없으면 콘텐츠 발행 전까지 결과 화면의
 * 모든 '자세히' 링크가 404 로 이어진다(첫 배포 직후 실측).
 */
function attachGuideLinks(panel) {
  findingMapPromise ??= Promise.all([
    fetch('/data/finding-map.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch('/data/published.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]).then(([map, published]) => ({ map, published: new Set(published.guide ?? []) }));

  findingMapPromise.then(({ map, published }) => {
    for (const slot of panel.querySelectorAll('[data-guide-link]')) {
      const entry = map[slot.dataset.guideLink];
      if (!entry?.slug || !published.has(entry.slug)) continue;
      const a = document.createElement('a');
      a.href = `/pages/guide/${entry.slug}`;
      a.textContent = '자세히 →';
      slot.appendChild(a);
    }
  });
}

// 변수별 — 대표 차트 (UC-07, 초기 8열 + 열 선택)
function renderColumns(panel, result) {
  const chartable = result.columns.filter((col) => selectForColumn(col).length > 0);
  if (chartable.length === 0) {
    panel.insertAdjacentHTML('beforeend', '<p>차트를 그릴 수 있는 열이 없습니다.</p>');
    return;
  }

  const initial = chartable.slice(0, DISPLAY_LIMIT.columnCharts);
  for (const col of initial) panel.appendChild(columnBlock(col));

  const rest = chartable.slice(DISPLAY_LIMIT.columnCharts);
  if (rest.length > 0) {
    const picker = document.createElement('p');
    picker.innerHTML = `<label>다른 열 보기 <select id="column-picker">
      <option value="">선택…</option>
      ${rest.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
    </select></label>`;
    const slot = document.createElement('div');
    panel.append(picker, slot);
    picker.querySelector('select').addEventListener('change', (event) => {
      const col = chartable.find((c) => c.name === event.target.value);
      if (!col) return;
      slot.appendChild(columnBlock(col));
      savePrefs({ selectedColumn: col.name });
    });
  }
}

function columnBlock(col) {
  const block = document.createElement('section');
  block.className = 'column-block';
  block.insertAdjacentHTML('beforeend', `<h3>${esc(col.name)} <small>${TYPE_LABEL[col.type]}</small></h3>`);
  if (col.type === 'numeric' && col.stats.mean !== undefined) {
    block.insertAdjacentHTML(
      'beforeend',
      `<p class="hint">평균 ${stat(col.stats.mean)} · 중위 ${stat(col.stats.median)} · 표준편차 ${stat(col.stats.std)} · 범위 ${stat(col.stats.min)}~${stat(col.stats.max)}</p>`
    );
  }
  const specs = selectForColumn(col);
  if (specs.length === 0) {
    block.insertAdjacentHTML('beforeend', '<p class="hint">임시 보관에서 분포 차트가 제외되어 표시할 수 없습니다. 파일을 다시 분석하면 볼 수 있습니다.</p>');
  }
  for (const spec of specs) block.insertAdjacentHTML('beforeend', renderChart(spec));
  return block;
}

// 관계 — 히트맵 + 산점도 (UC-08)
function renderRelations(panel, result) {
  if (result.correlations.length === 0) {
    panel.insertAdjacentHTML('beforeend', '<p>수치형 열이 2개 미만이라 상관을 계산하지 않았습니다.</p>');
    return;
  }

  const method = loadPrefs().corrMethod === 'spearman' ? 'spearman' : 'pearson';
  const toggle = document.createElement('p');
  toggle.innerHTML = `<label>상관 방식
    <select id="corr-method">
      <option value="pearson"${method === 'pearson' ? ' selected' : ''}>Pearson</option>
      <option value="spearman"${method === 'spearman' ? ' selected' : ''}>Spearman</option>
    </select></label>`;
  const heatmapSlot = document.createElement('div');
  panel.append(toggle, heatmapSlot);

  const drawHeatmap = (m) => {
    const spec = selectHeatmap(result.correlations, result.columns, m);
    heatmapSlot.innerHTML = spec ? renderChart(spec) : '';
  };
  drawHeatmap(method);
  toggle.querySelector('select').addEventListener('change', (event) => {
    savePrefs({ corrMethod: event.target.value });
    drawHeatmap(event.target.value);
  });

  const scatters = selectPairs(result.correlations);
  if (scatters.length > 0) {
    panel.insertAdjacentHTML('beforeend', '<h3>상관 상위 쌍 산점도</h3>');
    for (const spec of scatters) {
      panel.insertAdjacentHTML(
        'beforeend',
        `<section class="scatter-block"><p class="hint">${esc(spec.axis.x)} × ${esc(spec.axis.y)} — Pearson ${stat(spec.data.pearson)}</p>${renderChart(spec)}</section>`
      );
    }
  }
}

// ─── 내보내기·불러오기 (UC-09·10) ───────────────────────────

/** 결과 JSON 내보내기. 집계 통계만 담기므로 원본 데이터는 나가지 않는다. */
export function exportResult() {
  if (!currentResult) return;
  const blob = new Blob([JSON.stringify(currentResult)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'autoeda-result.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** 결과 JSON 불러오기. major 불일치는 상태 D(SCHEMA_MISMATCH)로 보낸다. */
export async function importResult(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    renderError('SCHEMA_MISMATCH', 'JSON 형식이 아닙니다.');
    setState('D');
    return;
  }
  const major = String(parsed?.schemaVersion ?? '').split('.')[0];
  if (major !== '1') {
    renderError('SCHEMA_MISMATCH', `schemaVersion "${parsed?.schemaVersion ?? '없음'}"은 지원하지 않습니다.`);
    setState('D');
    return;
  }
  currentFile = null; // 불러온 결과는 재계산 불가(타입 수정 비활성)
  const cache = saveResult(parsed);
  renderResult(parsed, cacheNotice(cache));
  setState('C');
}

// ─── 초기 배선 ──────────────────────────────────────────────

function button(label, className, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

function init() {
  const fileInput = document.getElementById('file-input');
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) startAnalysis(fileInput.files[0]);
  });

  // 드래그 앤 드롭 — 상태 A 카드 전체를 드롭 영역으로 쓴다
  const dropZone = document.querySelector('#state-select .card');
  dropZone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));
  dropZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) startAnalysis(file);
  });

  document.getElementById('cancel-analysis')?.addEventListener('click', () => {
    // 부분 결과를 쓰지 않는다 — cancel 후 terminate (docs/data-model.md §5.2)
    currentWorker?.postMessage({ type: 'cancel' });
    currentWorker?.terminate();
    currentWorker = null;
    setState('A');
  });

  document.getElementById('export-result')?.addEventListener('click', exportResult);
  document.getElementById('clear-result')?.addEventListener('click', () => {
    clearResult(); // UC-11 — 개인정보처리방침의 "직접 삭제" 근거
    currentResult = null;
    setState('A');
    document.getElementById('resume-notice')?.setAttribute('hidden', '');
  });
  document.getElementById('new-file')?.addEventListener('click', () => setState('A'));

  document.getElementById('import-result')?.addEventListener('click', () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.addEventListener('change', () => {
      if (picker.files?.[0]) importResult(picker.files[0]);
    });
    picker.click();
  });

  // 캐시가 있으면 상태 A 에 "이어보기" 제시 (UC-15 복귀 동선)
  const cached = loadResult();
  const notice = document.getElementById('resume-notice');
  if (cached && notice) {
    notice.hidden = false;
    notice.className = 'card';
    const p = document.createElement('p');
    p.textContent = `이전 분석 결과가 남아 있습니다 (${cached.dataset.rowCount.toLocaleString('ko-KR')}행 × ${cached.dataset.columnCount}열).`;
    notice.append(
      p,
      button('이어보기', 'btn', () => {
        renderResult(cached);
        setState('C');
      }),
      ' ',
      button('지우기', 'btn btn-secondary', () => {
        clearResult();
        notice.hidden = true;
      })
    );
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
