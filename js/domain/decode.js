// domain/decode.js — 바이트 → 문자열 디코드 (순수: DOM·IO 참조 없음, 단위 테스트 대상)
// 대응 유스케이스: UC-01 (docs/use-cases.md)
// 의존 위치: docs/data-model.md §6 그래프의 최상류. parse.js 만 이 모듈을 소비한다.
//
// 축 5(한국 데이터 환경) 요구를 라이브러리 없이 충족하는 지점이다 —
// TextDecoder 는 WHATWG 인코딩 표준을 따르므로 'euc-kr' 이 CP949 를 덮는다.

/**
 * UTF-8 우선, 실패 시 EUC-KR 폴백으로 디코드한다. BOM 은 제거한다.
 * fatal 모드가 판별 수단이다 — 유효한 EUC-KR 한글 바이트열은 UTF-8 로는 거의 항상
 * 디코드에 실패하므로, UTF-8 fatal 성공 여부가 실질적인 인코딩 감지가 된다.
 * @param {ArrayBuffer} buffer
 * @param {'utf-8'|'euc-kr'} [forced] 사용자 지정 인코딩. 있으면 감지를 건너뛴다
 * @returns {{ text: string, encoding: 'utf-8'|'euc-kr' }}
 * @throws {Error & {code: 'ENCODING_UNDETECTED'}} 둘 다 디코드에 실패한 경우
 */
export function decode(buffer, forced) {
  const candidates = forced ? [forced] : ['utf-8', 'euc-kr'];
  for (const encoding of candidates) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
      return { text: stripBom(text), encoding };
    } catch {
      // 다음 후보로 폴백
    }
  }
  const err = new Error('인코딩을 감지하지 못함 (utf-8, euc-kr 모두 실패)');
  err.code = 'ENCODING_UNDETECTED';
  throw err;
}

/**
 * 선행 BOM(EF BB BF)을 제거한다. 본문을 손상시키지 않아야 한다.
 * @param {string} text
 * @returns {string}
 */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
