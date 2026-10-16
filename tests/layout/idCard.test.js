import { expect, test } from 'vitest';
import { idCardSheet } from '../../src/layout/idCard.js';

const card = (w, h, v) => ({ width: w, height: h, data: new Uint8Array(w * h).fill(v) });
/** Bounding box of pixels equal to v. */
function box(g, v) {
  let x0 = g.width, y0 = g.height, x1 = -1, y1 = -1;
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
    if (g.data[y * g.width + x] === v) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, y0 };
}

test('front and back print at real card size (85.6 x 54 mm) on one A4, front on top', () => {
  const out = idCardSheet(card(400, 252, 40), card(252, 400, 90)); // back photographed sideways
  expect([out.width, out.height]).toEqual([2480, 3508]);
  const f = box(out, 40), b = box(out, 90);
  for (const c of [f, b]) {
    expect(c.w).toBe(1011); // 85.6 mm at 300 dpi
    expect(c.h).toBe(638); // 54 mm
  }
  expect(f.y0).toBeLessThan(b.y0);
});

test('a front alone still prints, with no back', () => {
  const out = idCardSheet(card(400, 252, 40), null);
  expect(box(out, 40).w).toBe(1011);
});
