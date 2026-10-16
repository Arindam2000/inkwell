import { expect, test } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { processPage, processAll } from '../../src/pipeline/pipeline.js';
import { HP_M126NW, applyCurve } from '../../src/printer/profile.js';

const flat = (v, w = 50, h = 70) => ({ width: w, height: h, data: new Uint8Array(w * h).fill(v) });

test('processPage gives A4 with the printer curve applied', () => {
  const out = processPage(flat(128), HP_M126NW, { clean: 'off' });
  expect([out.width, out.height]).toEqual([2480, 3508]);
  const expected = applyCurve(flat(128, 1, 1), HP_M126NW.curve).data[0];
  expect(out.data[1754 * 2480 + 1240]).toBe(expected);
});

test('processes pages sequentially', async () => {
  const log = [];
  async function* pages() {
    for (let i = 1; i <= 20; i++) { log.push(`pull ${i}`); yield flat(200); }
  }
  const res = await processAll(pages(), HP_M126NW, (done) => log.push(`done ${done}`), { clean: 'off' });
  const expected = [];
  for (let i = 1; i <= 20; i++) expected.push(`pull ${i}`, `done ${i}`);
  expect(log).toEqual(expected);
  const doc = await getDocument({ data: res.pdf.slice() }).promise;
  expect(doc.numPages).toBe(20);
  expect(res.previews).toHaveLength(20);
  expect(res.previews[0].height).toBe(600);
  expect(res.tonerPct).toBeGreaterThan(0);
}, 30_000); // 20 full A4 pages: slow when the scan lab runs alongside

test('darker / lighter shift mid-grays, keep black and white', () => {
  const mid = (tone) => processPage(flat(128), HP_M126NW, { tone, clean: 'off' }).data[1754 * 2480 + 1240];
  expect(mid(0.8)).toBeGreaterThan(mid(1)); // lighter
  expect(mid(1.25)).toBeLessThan(mid(1)); // darker
  expect(processPage(flat(255), HP_M126NW, { tone: 1.25, clean: 'off' }).data[0]).toBe(255);
});

test('2 pages per sheet: page 1 on top, page 2 below, an odd last page shares with blank', async () => {
  async function* pages() { yield flat(0); yield flat(255); yield flat(0); }
  const res = await processAll(pages(), HP_M126NW, () => {}, { perSheet: 2, clean: 'off' });
  expect(res.pages).toHaveLength(2);
  expect(res.previews).toHaveLength(2);
  const p = res.previews[0];
  const at = (fx, fy) => p.data[Math.round(fy * p.height) * p.width + Math.round(fx * p.width)];
  expect(at(0.5, 0.25)).toBeLessThan(60); // black page on top
  expect(at(0.5, 0.75)).toBeGreaterThan(200); // white page below
});

test('ID card mode: front + back become one A4 page', async () => {
  async function* pages() { yield flat(30, 400, 252); yield flat(60, 400, 252); }
  const res = await processAll(pages(), HP_M126NW, () => {}, { idCard: true });
  expect(res.pages).toHaveLength(1);
  expect(res.previews).toHaveLength(1);
});
