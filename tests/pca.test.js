// tests/pca.test.js — domain/pca.js 동작 테스트
//
// 기준값은 pca.js 헤더에 문서화한 규약(listwise · 표준화 = 상관행렬 · 부호 고정) 기준이다.
// 픽스처는 전부 **해석적으로 정답이 정해지는 것**만 쓴다 — 무상관 설계의 고윳값은 전부 1,
// 완전 공선 2열 + 독립 1열의 고윳값은 [2, 1, 0] 이다. 외부 라이브러리 대조가 필요 없다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { principalComponents } from '../js/domain/pca.js';
import { PCA, DISPLAY_LIMIT } from '../js/domain/thresholds.js';

const F = (arr) => Float64Array.from(arr);
const approx = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

const col = (name, values) => ({ name, values: F(values) });

/** 완전 공선 2열(y = 2x + 5) + 거의 독립인 1열. 고윳값이 [2, 1, 0] 에 붙는다. */
function collinearFixture(n = 40) {
  const x = [];
  const y = [];
  const z = [];
  for (let i = 0; i < n; i++) {
    x.push(i);
    y.push(2 * i + 5);
    z.push((i * 37) % 11);
  }
  return [col('x', x), col('y', y), col('z', z)];
}

// ─── 고윳값 ─────────────────────────────────────────────────

test('완전 공선 2열 + 독립 1열 — 고윳값이 [2, 1, 0]', () => {
  const pca = principalComponents(collinearFixture());
  assert.equal(pca.components.length, 3);
  approx(pca.components[0].eigenvalue, 2, 0.01);
  approx(pca.components[1].eigenvalue, 1, 0.01);
  approx(pca.components[2].eigenvalue, 0, 1e-9);
});

test('상관이 0 인 설계 — 고윳값이 전부 1 부근이고 어느 축도 지배하지 않는다', () => {
  const n = 60;
  const a = [];
  const b = [];
  const c = [];
  for (let i = 0; i < n; i++) {
    a.push(Math.sin(i));
    b.push(Math.cos(i));
    c.push(Math.sin(i * 2.7));
  }
  const pca = principalComponents([col('a', a), col('b', b), col('c', c)]);
  for (const comp of pca.components) approx(comp.eigenvalue, 1, 0.15);
});

test('고윳값 합 = 열 수 (상관행렬의 대각합)', () => {
  const pca = principalComponents(collinearFixture());
  const total = pca.components.reduce((s, c) => s + c.eigenvalue, 0);
  approx(total, pca.columns.length, 1e-9);
});

test('비율 합 = 1 이고 누적은 단조 증가해 1 로 끝난다', () => {
  const pca = principalComponents(collinearFixture());
  approx(
    pca.components.reduce((s, c) => s + c.ratio, 0),
    1
  );
  for (let i = 1; i < pca.components.length; i++) {
    assert.ok(
      pca.components[i].cumulative >= pca.components[i - 1].cumulative,
      '누적 설명 분산이 감소함'
    );
  }
  approx(pca.components.at(-1).cumulative, 1);
});

test('고윳값은 내림차순이며 음수가 없다', () => {
  const pca = principalComponents(collinearFixture());
  for (let i = 1; i < pca.components.length; i++) {
    assert.ok(pca.components[i].eigenvalue <= pca.components[i - 1].eigenvalue);
  }
  for (const c of pca.components) assert.ok(c.eigenvalue >= 0, '음수 고윳값');
});

// ─── 로딩 ───────────────────────────────────────────────────

test('로딩 제곱합 = 그 성분의 고윳값', () => {
  const pca = principalComponents(collinearFixture());
  for (let k = 0; k < pca.loadings.length; k++) {
    const ss = pca.loadings[k].reduce((s, v) => s + v * v, 0);
    approx(ss, pca.components[k].eigenvalue, 1e-9);
  }
});

test('열별 공통성 = 1 — 로딩이 원본 열과 주성분의 상관임을 보인다', () => {
  const pca = principalComponents(collinearFixture());
  for (let i = 0; i < pca.columns.length; i++) {
    let communality = 0;
    for (let k = 0; k < pca.loadings.length; k++) communality += pca.loadings[k][i] ** 2;
    approx(communality, 1, 1e-9);
  }
});

test('로딩 절댓값은 1 을 넘지 않는다 (상관계수 범위)', () => {
  const pca = principalComponents(collinearFixture());
  for (const row of pca.loadings) {
    for (const v of row) assert.ok(Math.abs(v) <= 1 + 1e-9, `로딩 ${v} 가 범위를 벗어남`);
  }
});

test('부호 규약 — 성분마다 절댓값 최대 로딩이 양수다', () => {
  const pca = principalComponents(collinearFixture());
  pca.loadings.forEach((row, k) => {
    // 고윳값 0 인 성분(완전 공선이면 반드시 생긴다)은 로딩이 전부 0 이라 부호 개념이 없다
    if (pca.components[k].eigenvalue === 0) {
      for (const v of row) assert.ok(Object.is(v, 0), `고윳값 0 성분에 -0 이나 잔여값이 남음: ${v}`);
      return;
    }
    const anchor = row.reduce((best, v, i) => (Math.abs(v) > Math.abs(row[best]) ? i : best), 0);
    assert.ok(row[anchor] > 0, '절댓값 최대 로딩이 음수 — 부호가 고정되지 않음');
  });
});

test('결정성 — 같은 입력은 같은 결과를 낸다', () => {
  const a = principalComponents(collinearFixture());
  const b = principalComponents(collinearFixture());
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('공선인 두 열은 PC1 에서 같은 크기의 로딩을 갖는다', () => {
  const pca = principalComponents(collinearFixture());
  const [x, y] = [pca.columns.indexOf('x'), pca.columns.indexOf('y')];
  approx(Math.abs(pca.loadings[0][x]), Math.abs(pca.loadings[0][y]), 1e-6);
});

// ─── 결측·상수 열 ───────────────────────────────────────────

test('listwise — 결측이 있는 행을 전부 제외하고 그 수를 보고한다', () => {
  const base = collinearFixture(30);
  const withGaps = base.map((c, i) => {
    const values = Float64Array.from(c.values);
    if (i === 0) {
      values[0] = NaN;
      values[5] = NaN;
    }
    if (i === 1) values[5] = NaN; // 같은 행 — 중복으로 세지 않는다
    return { name: c.name, values };
  });
  const pca = principalComponents(withGaps);
  assert.equal(pca.usedRowCount, 28);
  assert.equal(pca.droppedRowCount, 2);
});

test('상수 열은 제외하고 droppedColumns 에 기록한다', () => {
  const fixture = collinearFixture(30);
  fixture.push(col('상수', Array(30).fill(7)));
  const pca = principalComponents(fixture);
  assert.deepEqual(pca.droppedColumns, ['상수']);
  assert.ok(!pca.columns.includes('상수'));
  assert.equal(pca.columns.length, 3);
});

test('상수 열을 뺀 나머지가 최소 열 수에 못 미치면 null', () => {
  const values = Array.from({ length: 30 }, (_, i) => i);
  const pca = principalComponents([
    col('a', values),
    col('b', values.map((v) => v * 2)),
    col('상수', Array(30).fill(1)),
  ]);
  assert.equal(pca, null);
});

// ─── 산출 조건 ──────────────────────────────────────────────

test('수치형 열이 최소 개수 미만이면 null', () => {
  const values = Array.from({ length: 30 }, (_, i) => i % 7);
  const columns = Array.from({ length: PCA.minColumns - 1 }, (_, i) =>
    col(`c${i}`, values.map((v) => v + i))
  );
  assert.equal(principalComponents(columns), null);
});

test('완전 케이스가 최소 행 수 미만이면 null', () => {
  const short = PCA.minCompleteRows - 1;
  const columns = Array.from({ length: 3 }, (_, i) =>
    col(`c${i}`, Array.from({ length: short }, (_, r) => r * (i + 1) + (r % 3)))
  );
  assert.equal(principalComponents(columns), null);
});

test('입력이 배열이 아니면 null', () => {
  assert.equal(principalComponents(null), null);
  assert.equal(principalComponents([]), null);
});

// ─── 상한 ───────────────────────────────────────────────────

test('열이 상한을 넘으면 분산 상위만 쓰고 reduced 를 세운다', () => {
  const n = 50;
  const columns = Array.from({ length: PCA.maxColumns + 5 }, (_, i) =>
    // i 가 클수록 분산이 크다 — 상위 maxColumns 개는 뒤쪽 열들이다
    col(`c${i}`, Array.from({ length: n }, (_, r) => ((r * 7 + i) % 13) * (i + 1)))
  );
  const pca = principalComponents(columns);
  assert.equal(pca.reduced, true);
  assert.equal(pca.columns.length, PCA.maxColumns);
  assert.ok(pca.columns.includes(`c${PCA.maxColumns + 4}`), '분산 상위 열이 빠짐');
  assert.ok(!pca.columns.includes('c0'), '분산 하위 열이 남음');
});

test('축소된 열 목록은 원본 순서를 유지한다', () => {
  const n = 50;
  const columns = Array.from({ length: PCA.maxColumns + 5 }, (_, i) =>
    col(`c${i}`, Array.from({ length: n }, (_, r) => ((r * 7 + i) % 13) * (i + 1)))
  );
  const pca = principalComponents(columns);
  const indexes = pca.columns.map((name) => Number(name.slice(1)));
  assert.deepEqual(indexes, indexes.slice().sort((a, b) => a - b));
});

test('열 수가 상한 이하면 reduced 는 false 고 전 열을 쓴다', () => {
  const pca = principalComponents(collinearFixture());
  assert.equal(pca.reduced, false);
  assert.deepEqual(pca.columns, ['x', 'y', 'z']);
});

test('loadings 는 표시 상한 개수까지만 담는다', () => {
  const n = 60;
  const columns = Array.from({ length: DISPLAY_LIMIT.pcaComponents + 4 }, (_, i) =>
    col(`c${i}`, Array.from({ length: n }, (_, r) => (r * (i + 3)) % (11 + i)))
  );
  const pca = principalComponents(columns);
  assert.equal(pca.components.length, columns.length); // 고윳값은 전량
  assert.equal(pca.loadings.length, DISPLAY_LIMIT.pcaComponents); // 로딩만 상한
});

test('입력 배열을 변형하지 않는다', () => {
  const fixture = collinearFixture();
  const before = fixture.map((c) => Array.from(c.values));
  principalComponents(fixture);
  assert.deepEqual(
    fixture.map((c) => Array.from(c.values)),
    before
  );
});
