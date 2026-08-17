// app/contact.page.js — 문의 화면 전용 (Presentation)
// 대응 유스케이스: UC-12 (docs/use-cases.md)
// 대응 화면: /pages/contact (docs/screens.md §3.6)
//
// 백엔드가 없으므로 폼 전송이 아니라 mailto: 로 사용자의 메일 앱을 연다.
// 유형을 고르면 제목·본문이 자동 조립된다(../BDAnalyzer/js/contact.js 패턴).
//
// ⚠️ 업로드한 데이터·분석 결과를 문의에 자동 첨부하지 않는다 —
//    "서버 전송 없음"이라는 전제를 문의 경로에서 깨뜨리지 않는다(UC-12 규칙).

/** 수신 주소. 커스텀 도메인 취득(direction.md §9) 후 도메인 메일로 교체 검토. */
const CONTACT_EMAIL = 'tyoujungzz@gmail.com';

/** 문의 유형. 제목 접두사에 쓰인다. */
const TYPES = [
  { id: 'bug', label: '오류·버그 신고' },
  { id: 'guide', label: '해설 내용 오류' },
  { id: 'feature', label: '기능 제안' },
  { id: 'etc', label: '기타' },
];

/**
 * 선택된 유형·내용으로 mailto URL 을 조립한다.
 * @param {string} type TYPES 의 id. 모르는 값이면 '기타'로 처리
 * @param {string} body
 * @returns {string}
 */
export function buildMailto(type, body) {
  const matched = TYPES.find((t) => t.id === type) ?? TYPES[TYPES.length - 1];
  const subject = `[AutoEDA] ${matched.label}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** 메일 앱이 없을 때를 위해 주소 노출 + 복사 + 본문 미리보기를 제공한다. */
export function showFallback() {
  const box = document.getElementById('contact-fallback');
  if (!box) return;
  const body = document.getElementById('contact-body')?.value ?? '';

  box.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';

  const intro = document.createElement('p');
  intro.textContent = '메일 앱이 열리지 않으면 아래 주소로 직접 보내 주세요.';

  const address = document.createElement('p');
  const code = document.createElement('code');
  code.textContent = CONTACT_EMAIL;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn-secondary';
  copy.textContent = '주소 복사';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      copy.textContent = '복사됨';
    } catch {
      copy.textContent = '복사 실패 — 직접 선택해 주세요';
    }
  });
  address.append(code, ' ', copy);

  card.append(intro, address);

  if (body.trim() !== '') {
    const previewLabel = document.createElement('p');
    previewLabel.textContent = '작성한 내용:';
    const preview = document.createElement('pre');
    preview.className = 'contact-preview';
    preview.textContent = body; // textContent 삽입이므로 이스케이프 불필요
    card.append(previewLabel, preview);
  }

  box.appendChild(card);
  box.hidden = false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('contact-type');
    const send = document.getElementById('contact-send');
    if (!select || !send) return;

    for (const t of TYPES) {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.label;
      select.appendChild(option);
    }

    send.addEventListener('click', () => {
      const body = document.getElementById('contact-body')?.value ?? '';
      location.href = buildMailto(select.value, body);
      // mailto 실패는 감지할 수 없으므로 폴백을 항상 함께 보여준다
      showFallback();
    });
  });
}

export { TYPES };
