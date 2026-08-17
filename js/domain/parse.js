// domain/parse.js — CSV 파싱 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-01 (docs/use-cases.md)
// 의존 위치: decode.js 를 소비하고 infer.js 에 공급한다. → docs/data-model.md §6
//
// 외부 라이브러리를 쓰지 않으므로 RFC 4180 을 직접 구현한다.
// 반드시 처리해야 하는 것: 인용부호로 감싼 필드, 인용 내부의 "" 이스케이프,
// 인용 내부의 개행, CRLF/LF 혼재, 마지막 줄 개행 없음, 빈 필드.
// ⚠️ 엣지케이스 버그를 직접 책임지는 영역이므로 tests/ 를 두텁게 쓴다.

const DELIMITERS = [',', ';', '\t', '|'];

/**
 * 구분자를 추정한다. 후보 중 헤더 행에서 필드 수가 가장 안정적인 것을 고른다.
 * 검출 단계에서는 인용 내 개행을 무시하고 앞부분 줄만 본다 — 근사면 충분하다.
 * @param {string} text
 * @returns {','|';'|'\t'|'|'}
 */
export function detectDelimiter(text) {
  const lines = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (line.trim() !== '') lines.push(line);
    if (lines.length >= 10) break;
  }
  let best = ',';
  let bestScore = -Infinity;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countFields(line, delimiter));
    if (counts.length === 0 || counts[0] < 2) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = (consistent ? 1000 : 0) + counts[0];
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** 인용부호 밖의 구분자만 세어 한 줄의 필드 수를 구한다. */
function countFields(line, delimiter) {
  let count = 1;
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

/**
 * CSV 텍스트를 열 단위 구조로 파싱한다.
 * 수치로 보이는 열은 Float64Array 로, 그 외는 문자열 배열로 담는다.
 * 동명 열은 name, name_2 로 구분해 이름 참조의 유일성을 보장한다(docs/data-model.md §3.3).
 * @param {string} text
 * @param {{ delimiter?: string, keepAsString?: string[] }} [options]
 *   keepAsString: 수치 변환을 건너뛸 열 이름. 우편번호처럼 수치로 보이는 열을
 *   비수치 타입으로 오버라이드(UC-02)할 때 선행 0 유실을 막는다 — Float64Array 로
 *   바꾼 뒤에는 "06236" 을 되살릴 수 없으므로 재파싱 시점(start 재호출)에 지정해야 한다
 * @returns {{ names: string[], columns: Array<Float64Array|string[]>, rowCount: number }}
 * @throws {Error & {code: 'PARSE_FAILED', detail: {line: number, reason: string}}}
 *   행별 필드 수 불일치가 임계 이상인 경우. 어느 행이 문제인지 detail 에 담는다
 *   (임계는 1건 — 어긋난 행을 조용히 버리거나 메워서 통계를 왜곡하지 않는다)
 */
export function parseCsv(text, options) {
  const delimiter = options?.delimiter ?? detectDelimiter(text);
  const { rows, startLines } = tokenize(text, delimiter);

  if (rows.length === 0) {
    throw parseError(1, '내용이 없는 파일');
  }

  const names = dedupeNames(rows[0]);
  const expected = names.length;

  const dataRows = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // 다열 파일의 빈 줄(필드 1개, 공백뿐)은 데이터가 아니므로 건너뛴다 — 주로 파일 끝의 잔여 개행.
    // 단일 열 파일에서는 빈 줄이 결측값과 구분되지 않으므로 삼키지 않는다
    if (expected > 1 && row.length === 1 && row[0].trim() === '') continue;
    if (row.length !== expected) {
      throw parseError(startLines[r], `필드 수 ${row.length} — 헤더 기준 ${expected}개여야 함`);
    }
    dataRows.push(row);
  }
  if (expected === 1) {
    // 단일 열: 파일 끝 개행이 만든 잔여 빈 행만 걷어낸다
    while (dataRows.length > 0 && dataRows[dataRows.length - 1][0].trim() === '') dataRows.pop();
  }

  const rowCount = dataRows.length;
  const keepAsString = new Set(options?.keepAsString ?? []);
  const columns = names.map((name, c) => {
    const raw = new Array(rowCount);
    for (let r = 0; r < rowCount; r++) raw[r] = dataRows[r][c];
    return keepAsString.has(name) ? raw : maybeNumericColumn(raw);
  });

  return { names, columns, rowCount };
}

/**
 * 선행 0 이 붙은 정수 표기인지 판정한다 — "06236"(우편번호), "007"(코드값) 등.
 * 이런 값은 수치가 아니라 코드값이며, 수치로 바꾸면 선행 0 이 비가역으로 사라진다.
 * "0.5" 나 "0" 은 해당하지 않는다.
 * @param {string} value
 * @returns {boolean}
 */
export function hasLeadingZero(value) {
  return /^[+-]?0\d/.test(value.trim());
}

/**
 * 문자열 값 → 수치. 천단위 구분 쉼표(1,234.5)를 허용한다. 실패 시 null.
 * infer.js 의 numeric 판정도 이 함수를 쓴다 — 파싱과 추론의 수치 정의가 갈리면 안 된다.
 * @param {string} value
 * @returns {number|null}
 */
export function toNumber(value) {
  let s = value.trim();
  if (s === '') return null;
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 비결측 값이 전부 수치면 Float64Array(결측은 NaN), 아니면 원본 문자열 배열을 반환한다. */
function maybeNumericColumn(raw) {
  let present = 0;
  for (const value of raw) {
    if (value.trim() === '') continue;
    present++;
    // 선행 0 이 하나라도 있으면 코드값으로 보고 문자열로 남긴다 — 수치 변환은 비가역이고,
    // 진짜 수치였다면 사용자가 numeric 으로 오버라이드할 수 있다(UC-02). 반대 방향은 복구 불가다
    if (hasLeadingZero(value)) return raw;
    if (toNumber(value) === null) return raw;
  }
  if (present === 0) return raw; // 전결측 열은 수치로 단정할 근거가 없다
  const nums = new Float64Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const n = toNumber(raw[i]);
    nums[i] = n === null ? NaN : n;
  }
  return nums;
}

/** RFC 4180 상태기계. 행 배열과 각 행의 시작 줄 번호(1부터)를 함께 반환한다. */
function tokenize(text, delimiter) {
  const rows = [];
  const startLines = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;

  const endRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    startLines.push(rowStart);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      endRow();
      rowStart = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow(); // 마지막 줄 개행 없음

  return { rows, startLines };
}

/** 동명 열을 name, name_2, name_3 … 으로 구분한다. 빈 헤더는 col_N 으로 채운다. */
function dedupeNames(headerRow) {
  const used = new Set();
  return headerRow.map((rawName, i) => {
    const base = rawName.trim() !== '' ? rawName.trim() : `col_${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    return name;
  });
}

function parseError(line, reason) {
  const err = new Error(`CSV 파싱 실패 (${line}행): ${reason}`);
  err.code = 'PARSE_FAILED';
  err.detail = { line, reason };
  return err;
}
