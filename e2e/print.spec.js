import { expect, test } from '@playwright/test';
import path from 'node:path';

const fixture = (f) => path.join(process.cwd(), 'tests', 'fixtures', f);

/** Replace Android's share sheet with a recorder: name, page count, turned pages. */
async function recordShares(page) {
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = async ({ files }) => {
      const text = new TextDecoder('latin1').decode(await files[0].arrayBuffer());
      window.__shared.push({
        name: files[0].name,
        pages: (text.match(/\/Type \/Page\b(?!s)/g) || []).length,
        turned: (text.match(/\/Rotate 180/g) || []).length,
      });
    };
  });
}
const shared = (page) => page.evaluate(() => window.__shared);

async function open2(page) {
  await page.goto('./');
  await page.locator('#file').setInputFiles(fixture('two-page.pdf'));
  await expect(page.locator('img.preview')).toHaveCount(2, { timeout: 15000 });
}

test('Print hands the whole PDF to the phone', async ({ page }) => {
  await recordShares(page);
  await open2(page);
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect.poll(() => shared(page)).toEqual([{ name: 'inkwell.pdf', pages: 2, turned: 0 }]);
});

test('book print: fronts, then backs, survives closing the app, learns the flip', async ({ page }) => {
  await recordShares(page);
  await open2(page);
  await page.getByRole('button', { name: 'Print as a book (both sides)' }).click();
  await page.getByRole('button', { name: 'Print front pages' }).click();
  await page.getByRole('button', { name: /Done, the sheets are out/ }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await expect(page.getByText(/you should have 1 printed sheets/)).toBeVisible();

  await page.reload(); // app closed mid-job
  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Print back pages' }).click();
  await page.getByRole('button', { name: /Done, check the pages/ }).click();
  await page.getByRole('button', { name: 'Backs are upside down' }).click();
  await expect(page.getByText(/fixed for every book/)).toBeVisible();

  // Reprint just this batch, now with the backs turned.
  await page.getByRole('button', { name: 'Print front pages' }).click();
  await page.getByRole('button', { name: /Done, the sheets are out/ }).click();
  await page.getByRole('button', { name: 'Print back pages' }).click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(3); // reload cleared the first recorder
  expect((await shared(page)).at(-1)).toEqual({ name: 'inkwell-back.pdf', pages: 1, turned: 1 });
  await page.getByRole('button', { name: /Done, check the pages/ }).click();
  await page.getByRole('button', { name: 'Perfect' }).click();
  await expect(page.getByText('Book done ✓')).toBeVisible();
});

test('page numbers, tap to skip a page, copies: what you see is what prints', async ({ page }) => {
  await recordShares(page);
  await open2(page);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.locator('#summary')).toHaveText('2 pages · 2 sheets');

  await page.getByRole('button', { name: /Page 2 of 2/ }).click();
  await expect(page.getByRole('button', { name: /Page 2 of 2/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#summary')).toHaveText('1 page · 1 sheet');
  await expect(page.getByRole('button', { name: 'Print as a book (both sides)' })).toBeHidden();

  await page.getByRole('button', { name: 'More copies' }).click();
  await expect(page.locator('#summary')).toHaveText('1 page × 2 copies · 2 sheets');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect.poll(() => shared(page)).toEqual([{ name: 'inkwell.pdf', pages: 2, turned: 0 }]);
});

test('2 pages per sheet and darker: previews redo, sheet count halves, setting remembered', async ({ page }) => {
  await recordShares(page);
  await open2(page);
  await page.getByRole('group', { name: 'Per sheet' }).getByRole('button', { name: '2' }).click();
  await expect(page.locator('img.preview')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByText('Sheet 1 of 1')).toBeVisible();
  await expect(page.locator('#summary')).toHaveText('1 sheet (2 pages each) · 1 sheet');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect.poll(() => shared(page)).toEqual([{ name: 'inkwell.pdf', pages: 1, turned: 0 }]);

  await page.getByRole('button', { name: 'Darker' }).click();
  await expect(page.getByRole('button', { name: 'Darker' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Darker', includeHidden: true })).toHaveAttribute('aria-pressed', 'true');
});

test('ID card: two pages become one sheet', async ({ page }) => {
  await page.goto('./');
  await page.locator('#id-files').setInputFiles(fixture('two-page.pdf'));
  await expect(page.locator('img.preview')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('#summary')).toHaveText('1 page · 1 sheet');
});

test('tap a page: big preview, skip from there; save as PDF and as image', async ({ page }) => {
  await open2(page);
  await page.getByRole('button', { name: 'See page 2 of 2 big' }).click();
  await expect(page.getByText('Page 2 of 2', { exact: true }).last()).toBeVisible();
  await expect(page.locator('#viewer-img')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Skip this page' }).click();
  await expect(page.getByRole('button', { name: 'Print this page' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#summary')).toHaveText('1 page · 1 sheet');

  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as PDF' }).click();
  expect((await pdf).suggestedFilename()).toBe('inkwell.pdf');
  const jpg = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as image' }).click();
  expect((await jpg).suggestedFilename()).toBe('inkwell-1.jpg');
});

test('more options: booklet makes sides to fold; quality is remembered', async ({ page }) => {
  await open2(page);
  await page.getByText('More options').click();
  await page.getByRole('group', { name: 'Booklet' }).getByRole('button', { name: 'On' }).click();
  await expect(page.locator('#summary')).toHaveText('booklet: 2 sides · 2 sheets', { timeout: 15000 });
  await page.getByRole('button', { name: 'Draft' }).click();
  await open2(page); // app opened again later
  await page.getByText('More options').click();
  await expect(page.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');
});

test('mini book: several PDFs at once fold into one pocket book; the numbered fold test makes one too', async ({ page }) => {
  await page.goto('./');
  await page.locator('#file').setInputFiles([fixture('two-page.pdf'), fixture('two-page.pdf')]);
  await expect(page.locator('img.preview')).toHaveCount(4, { timeout: 15000 });
  await page.getByText('More options').click();
  await page.getByRole('group', { name: 'Mini book' }).getByRole('button', { name: '8 pages' }).click();
  await expect(page.locator('#summary')).toHaveText('mini book: 2 sides · 2 sheets', { timeout: 15000 });
  await page.getByRole('group', { name: 'Mini book' }).getByRole('button', { name: '16 pages' }).click();
  await page.getByRole('button', { name: 'Try a numbered fold test' }).click();
  await expect(page.locator('img.preview')).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator('.cap').first()).toHaveText('Side 1 of 2');
});

test('changing a setting updates in place, faster than the first time (no re-reading, no re-cleaning)', async ({ page }) => {
  await page.goto('./');
  let t = Date.now();
  await page.locator('#file').setInputFiles(fixture('two-page.pdf'));
  await expect(page.locator('#summary')).toHaveText('2 pages · 2 sheets', { timeout: 15000 });
  const first = Date.now() - t;
  t = Date.now();
  await page.getByRole('button', { name: 'Darker' }).click();
  await expect(page.locator('section[data-state="ready"]')).toBeVisible(); // never back to the "getting ready" screen
  await expect(page.locator('#summary')).toHaveText('2 pages · 2 sheets', { timeout: 15000 });
  expect(Date.now() - t).toBeLessThan(first);
  await page.getByRole('button', { name: 'Lighter' }).click(); // two quick taps: the last one wins
  await page.getByRole('button', { name: 'Normal' }).click();
  await expect(page.locator('#summary')).toHaveText('2 pages · 2 sheets', { timeout: 15000 });
  await expect(page.locator('#app')).not.toHaveClass(/busy/);
});
