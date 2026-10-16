import { expect, test } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { bookOrder } from '../../src/print/book.js';
import { assemblePdf, compressPage } from '../../src/pdf/writePdf.js';

// Default: the M126nw drops sheets face down, so the stack comes back last sheet on top.
test('20 pages: fronts 1,3..19, backs reversed 20..2', () => {
  const { front, back } = bookOrder(20);
  expect(front.map((i) => i + 1)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  expect(back.map((i) => (i === null ? 'blank' : i + 1))).toEqual([20, 18, 16, 14, 12, 10, 8, 6, 4, 2]);
});

test('21 pages: sheet 11 gets a blank back, fed first', () => {
  const { front, back } = bookOrder(21);
  expect(front).toHaveLength(11);
  expect(back).toHaveLength(11);
  expect(back[0]).toBeNull();
  expect(back.at(-1)).toBe(1); // page 2
});

test('not reversed: backs in reading order, blank last', () => {
  const { back } = bookOrder(5, { reverse: false });
  expect(back).toEqual([1, 3, null]);
});

test('1 page: one front, one blank back', () => {
  expect(bookOrder(1)).toEqual({ front: [0], back: [null] });
});

test('assemblePdf: blank pages and 180° turns', async () => {
  const p = await compressPage({ width: 30, height: 40, data: new Uint8Array(1200).fill(0) });
  const bytes = assemblePdf([p, { ...p, rotate: true }, null], 300);
  const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  expect(doc.numPages).toBe(3);
  expect((await doc.getPage(2)).rotate).toBe(180);
  const blank = await doc.getPage(3);
  expect(blank.view[2]).toBeCloseTo((30 / 300) * 72, 1); // same size as its neighbours
  expect((await blank.getOperatorList()).fnArray).not.toContain(85); // 85 = paintImageXObject
});
