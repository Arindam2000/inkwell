import { expect, test } from '@playwright/test';

test('run() turns a 2-page PDF into a 2-page A4 PDF in the background worker', async ({ page }) => {
  await page.goto('./');
  const r = await page.evaluate(async () => {
    const { run } = await import('/inkwell/src/pipeline/run.js');
    const blob = await (await fetch('/inkwell/tests/fixtures/two-page.pdf')).blob();
    const progress = [];
    const res = await run(blob, (done, total) => progress.push([done, total]));
    const head = new TextDecoder().decode(res.pdf.slice(0, 5));
    return { head, pages: res.previews.length, h: res.previews[0].height, toner: res.tonerPct, progress };
  });
  expect(r.head).toBe('%PDF-');
  expect(r.pages).toBe(2);
  expect(r.h).toBe(600);
  expect(r.toner).toBeGreaterThan(0);
  expect(r.progress.map((p) => p[0])).toEqual([1, 2]);
});
