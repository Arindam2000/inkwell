import { expect, test } from '@playwright/test';

/** Runs readFile in the page on a fixture (or a generated blob) and returns page sizes or the error. */
async function read(page, fixture, opts = {}) {
  await page.goto('./');
  return page.evaluate(async ({ fixture, opts }) => {
    const { readFile } = await import('/inkwell/src/input/readFile.js');
    let blob;
    if (fixture === 'huge') {
      const c = new OffscreenCanvas(6000, 5000);
      c.getContext('2d').fillRect(0, 0, 10, 10);
      blob = await c.convertToBlob({ type: 'image/jpeg' });
    } else {
      blob = await (await fetch(`/inkwell/tests/fixtures/${fixture}`)).blob();
      blob = new File([blob], fixture, { type: blob.type });
    }
    try {
      const out = [];
      for await (const g of readFile(blob, opts)) out.push([g.width, g.height, g.data.length === g.width * g.height]);
      return { pages: out };
    } catch (e) {
      return { error: e.message, hint: e.hint, kind: e.name };
    }
  }, { fixture, opts });
}

test('respects EXIF orientation', async ({ page }) => {
  const r = await read(page, 'rotated-exif6.jpg');
  expect(r.pages).toEqual([[20, 40, true]]);
});

test('two-page pdf yields two pages', async ({ page }) => {
  const r = await read(page, 'two-page.pdf', { pdfDpi: 100 });
  expect(r).toHaveProperty('pages');
  expect(r.pages?.length).toBe(2);
  expect(r.pages[0][0]).toBeGreaterThan(r.pages[0][1] * 0.6);
});

test('caps pixels at 24 MP', async ({ page }) => {
  const r = await read(page, 'huge');
  const [w, h] = r.pages[0];
  expect(w * h).toBeLessThanOrEqual(24_000_000);
  expect(w * h).toBeGreaterThan(20_000_000);
});

test('damaged pdf gives friendly error', async ({ page }) => {
  const r = await read(page, 'damaged.pdf');
  expect(r.error).toBe('This PDF is locked or damaged.');
  expect(r.hint).toBe('Open it in Drive, then share it again.');
});

test('txt file gives friendly error', async ({ page }) => {
  const r = await read(page, 'note.txt');
  expect(r.error).toBe("Inkwell can't open this kind of file.");
  expect(r.hint).toBe('Share a photo or a PDF instead.');
});
