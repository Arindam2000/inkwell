import { expect, test } from 'vitest';
import { fitA4 } from '../../src/layout/fitA4.js';

const black = (w, h) => ({ width: w, height: h, data: new Uint8Array(w * h) });
/** bounding box of dark pixels */
function box(g) {
  let x0 = g.width, y0 = g.height, x1 = -1, y1 = -1;
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
    if (g.data[y * g.width + x] < 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

test('output is exactly A4 at 300 dpi', () => {
  const out = fitA4(black(100, 141));
  expect([out.width, out.height]).toEqual([2480, 3508]);
});

test('portrait input fills the width inside margins, centered', () => {
  const b = box(fitA4(black(100, 141)));
  expect(b.w).toBeGreaterThanOrEqual(2350);
  expect(Math.abs(b.cx - 1240)).toBeLessThan(3);
  expect(Math.abs(b.cy - 1754)).toBeLessThan(3);
});

test('landscape input is rotated', () => {
  const b = box(fitA4(black(300, 100)));
  expect(b.h).toBeGreaterThan(b.w);
});

test('actual size: a 100 mm wide page at 200 dpi prints 100 mm wide, no shrinking', () => {
  const w = Math.round((100 / 25.4) * 200);
  const b = box(fitA4(black(w, w * 1.2), { actualDpi: 200 }));
  expect(Math.abs(b.w - Math.round((100 / 25.4) * 300))).toBeLessThanOrEqual(1);
});

test('actual size: a page bigger than A4 is cut at the edges, not squeezed', () => {
  const out = fitA4(black(3000, 4000), { actualDpi: 300 });
  expect([out.width, out.height]).toEqual([2480, 3508]);
  expect(box(out).w).toBe(2480);
});
