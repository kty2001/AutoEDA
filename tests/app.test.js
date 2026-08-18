// tests/app.test.js — app 모듈의 비 DOM 로직 테스트
// DOM 배선 자체는 브라우저 실기 확인 대상이고, 여기서는 순수 부분과
// "Node 환경에서 import 만으로 부작용이 없다"는 계약을 지킨다
// (모든 app 모듈은 document 부재 시 아무것도 실행하지 않아야 한다).

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('app 모듈 4종 — document 없이 import 가능 (부작용 가드)', async () => {
  await assert.doesNotReject(async () => {
    await import('../js/app/common.js');
    await import('../js/app/menu.js');
    await import('../js/app/contact.page.js');
    await import('../js/app/analyze.page.js');
  });
});

test('normalizePath — 확장자·꼬리 슬래시 제거', async () => {
  const { normalizePath } = await import('../js/app/common.js');
  assert.equal(normalizePath('/pages/analyze.html'), '/pages/analyze');
  assert.equal(normalizePath('/pages/analyze/'), '/pages/analyze');
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath(''), '/');
});

test('menu.ITEMS — 확장자 없는 URL (307 리디렉션 회피)', async () => {
  const { ITEMS } = await import('../js/app/menu.js');
  assert.equal(ITEMS.length, 6);
  for (const item of ITEMS) {
    assert.ok(!item.href.endsWith('.html'), `${item.href} 가 확장자를 포함함`);
    assert.ok(item.href.startsWith('/'), '루트 기준 절대경로여야 함');
  }
});

test('menu.sublistEntries — 군 제목과 해설 링크를 순서대로 편다', async () => {
  const { sublistEntries } = await import('../js/app/menu.js');
  const rows = sublistEntries({
    url: '/pages/guide',
    groups: [
      { label: '데이터 품질', items: [{ slug: 'missing-types', label: '결측치 유형과 판별 방법' }] },
      { label: '분포', items: [{ slug: 'skewness', label: '왜도 해석' }] },
    ],
  });
  assert.deepEqual(rows, [
    { type: 'group', label: '데이터 품질' },
    { type: 'link', label: '결측치 유형과 판별 방법', href: '/pages/guide/missing-types' },
    { type: 'group', label: '분포' },
    { type: 'link', label: '왜도 해석', href: '/pages/guide/skewness' },
  ]);
});

test('menu.sublistEntries — 목록이 없거나 비면 빈 배열 (하위목록을 만들지 않음)', async () => {
  const { sublistEntries } = await import('../js/app/menu.js');
  assert.deepEqual(sublistEntries(undefined), []);
  assert.deepEqual(sublistEntries({ url: '/pages/case', groups: [] }), []);
});

test('buildMailto — 제목 접두사·본문 인코딩', async () => {
  const { buildMailto } = await import('../js/app/contact.page.js');
  const url = buildMailto('bug', '1행에서 오류 & 중단');
  assert.ok(url.startsWith('mailto:'));
  assert.ok(url.includes(encodeURIComponent('[AutoEDA] 오류·버그 신고')));
  assert.ok(url.includes(encodeURIComponent('1행에서 오류 & 중단')));
  // 모르는 유형은 '기타'로
  assert.ok(buildMailto('ghost', 'x').includes(encodeURIComponent('기타')));
});
