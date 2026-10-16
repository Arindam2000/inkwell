import { expect, test } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { writePdf } from '../../src/pdf/writePdf.js';

/** @param {number} w @param {number} h @param {number} [v] */
const page = (w, h, v = 255) => ({ width: w, height: h, data: new Uint8Array(w * h).fill(v) });
const open = (bytes) => getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;

test('a4 at 300 dpi gives 595.28 x 841.89 pt', async () => {
  const doc = await open(await writePdf([page(2480, 3508)], 300));
  const view = (await doc.getPage(1)).view;
  expect(view[2]).toBeCloseTo(595.28, 0);
  expect(view[3]).toBeCloseTo(841.89, 0);
});

test('three pages in, three pages out', async () => {
  const doc = await open(await writePdf([page(10, 10), page(10, 10), page(10, 10)], 300));
  expect(doc.numPages).toBe(3);
});

test('pixels round-trip', async () => {
  const p = page(4, 4);
  p.data.forEach((_, i) => (p.data[i] = (i + Math.floor(i / 4)) % 2 ? 0 : 255));
  const bytes = await writePdf([p], 300);
  const text = new TextDecoder('latin1').decode(bytes);
  const start = text.indexOf('stream\n', text.indexOf('/Subtype /Image')) + 7;
  const len = Number(/\/Length (\d+)/.exec(text.slice(text.indexOf('/Subtype /Image')))?.[1]);
  const raw = new Uint8Array(await new Response(new Blob([bytes.slice(start, start + len)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  expect([...raw]).toEqual([...p.data]);
});
