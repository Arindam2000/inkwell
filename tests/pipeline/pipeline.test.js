import { expect, test } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { processPage, processAll } from '../../src/pipeline/pipeline.js';
import { HP_M126NW, applyCurve } from '../../src/printer/profile.js';

const flat = (v, w = 50, h = 70) => ({ width: w, height: h, data: new Uint8Array(w * h).fill(v) });

test('processPage gives A4 with the printer curve applied', () => {
  const out = processPage(flat(128), HP_M126NW);
  expect([out.width, out.height]).toEqual([2480, 3508]);
  const expected = applyCurve(flat(128, 1, 1), HP_M126NW.curve).data[0];
  expect(out.data[1754 * 2480 + 1240]).toBe(expected);
});

test('processes pages sequentially', async () => {
  const log = [];
  async function* pages() {
    for (let i = 1; i <= 20; i++) { log.push(`pull ${i}`); yield flat(200); }
  }
  const res = await processAll(pages(), HP_M126NW, (done) => log.push(`done ${done}`));
  const expected = [];
  for (let i = 1; i <= 20; i++) expected.push(`pull ${i}`, `done ${i}`);
  expect(log).toEqual(expected);
  const doc = await getDocument({ data: res.pdf.slice() }).promise;
  expect(doc.numPages).toBe(20);
  expect(res.previews).toHaveLength(20);
  expect(res.previews[0].height).toBe(600);
  expect(res.tonerPct).toBeGreaterThan(0);
});
