import { expect, test } from '@playwright/test';
import path from 'node:path';

const fixture = (f) => path.join(process.cwd(), 'tests', 'fixtures', f);

/** Slow the CPU 4x, like the Mi A1. */
async function asOldPhone(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

test('a 2-page PDF shows 2 previews and the toner line, fast on a slow phone', async ({ page }) => {
  await asOldPhone(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Choose photos or PDFs' }).waitFor();
  await page.locator('#file').setInputFiles(fixture('two-page.pdf'));
  await expect(page.locator('img.preview')).toHaveCount(2, { timeout: 8000 });
  await expect(page.getByText(/^Toner: \d+%$/)).toBeVisible();
});

test('a text file shows the friendly message and a way back', async ({ page }) => {
  await page.goto('./');
  await page.locator('#file').setInputFiles(fixture('note.txt'));
  await expect(page.getByText("Inkwell can't open this kind of file.")).toBeVisible();
  await expect(page.getByText('Share a photo or a PDF instead.')).toBeVisible();
  await page.getByRole('button', { name: 'Try another file' }).click();
  await expect(page.getByRole('button', { name: 'Choose photos or PDFs' })).toBeVisible();
});

test('every button is at least 48 px tall', async ({ page }) => {
  await page.goto('./');
  for (const b of await page.getByRole('button').all()) {
    if (await b.isVisible()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(48);
  }
});

test('only one screen state is visible at a time', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Choose photos or PDFs' })).toBeVisible();
  await expect(page.getByText('Getting it ready…')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Try another file' })).toBeHidden();
});

test('footer shows app version and browser version (for support)', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#about')).toHaveText(/^Inkwell v\d+\.\d+\.\d+ · Chrome \d+$/);
});
