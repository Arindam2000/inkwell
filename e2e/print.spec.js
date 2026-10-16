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
  await page.locator('input[type=file]').setInputFiles(fixture('two-page.pdf'));
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

  await page.reload(); // app closed mid-job
  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Print back pages' }).click();
  await page.getByRole('button', { name: /Done, check the pages/ }).click();
  await page.getByRole('button', { name: 'Backs are upside down' }).click();
  await expect(page.getByText(/next book print/)).toBeVisible();

  await open2(page);
  await page.getByRole('button', { name: 'Print as a book (both sides)' }).click();
  await page.getByRole('button', { name: 'Print front pages' }).click();
  await page.getByRole('button', { name: /Done, the sheets are out/ }).click();
  await page.getByRole('button', { name: 'Print back pages' }).click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(2); // reload cleared the first recorder
  expect(await shared(page)).toEqual([
    { name: 'inkwell-front.pdf', pages: 1, turned: 0 },
    { name: 'inkwell-back.pdf', pages: 1, turned: 1 },
  ]);
});
