import { expect, test } from 'vitest';
import { cleanScan } from '../../src/scan/clean.js';
import { findPage, warpPage } from '../../src/scan/crop.js';

const W = 300, H = 400;
/** A page: light paper with a shadow across it and a few dark text bars. */
function doc() {
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const paper = 230 * (1 - 0.4 * (x / W)); // shadow on the right
    const ink = y % 20 < 3 && x > 30 && x < 270;
    data[y * W + x] = ink ? paper * 0.15 : paper;
  }
  return { width: W, height: H, data };
}

test('a shadowed page becomes white paper with black text', () => {
  const out = /** @type {any} */ (cleanScan(doc()));
  expect(out.data[5 * W + 290]).toBe(255); // shadowed paper -> white
  expect(out.data[1 * W + 280 - 20]).toBeLessThan(60); // ink in the shadow stays dark
});

test('auto mode leaves a photo alone', () => {
  const data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = (i % W) * 0.6 + ((i / W) | 0) * 0.2; // smooth photo-like tones
  expect(cleanScan({ width: W, height: H, data }, { force: false })).toBeNull();
  expect(cleanScan(doc(), { force: false })).not.toBeNull();
});

test('finds a bright page on a dark table and flattens it', () => {
  const PW = 600, PH = 800, data = new Uint8Array(PW * PH).fill(60);
  for (let y = 100; y < 700; y++) for (let x = 120; x < 480; x++) data[y * PW + x] = 220;
  const quad = /** @type {[number, number][]} */ (findPage({ width: PW, height: PH, data }));
  for (const [[x, y], [ex, ey]] of quad.map((p, i) => [p, [[120, 100], [480, 100], [480, 700], [120, 700]][i]])) {
    expect(Math.hypot(x - ex, y - ey)).toBeLessThan(6);
  }
  const flat = warpPage({ width: PW, height: PH, data }, quad, 90, 150);
  expect(Math.min(...flat.data)).toBeGreaterThan(150); // only page, no table
});
