import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Runs against the real production build (preview server), like the phones get it.
const APP = 'http://localhost:4173/inkwell/';

async function controlled(page) {
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test('opens with Wi-Fi off after the first visit', async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Choose photos or PDFs' })).toBeVisible();
});

test('a file shared to Inkwell opens straight into a preview', async ({ page }) => {
  await controlled(page);
  const bytes = [...readFileSync('tests/fixtures/two-page.pdf')];
  await page.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)]);
    const form = Object.assign(document.createElement('form'), { method: 'POST', action: '/inkwell/share', enctype: 'multipart/form-data' });
    const input = Object.assign(document.createElement('input'), { type: 'file', name: 'file' });
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'scan.pdf', { type: 'application/pdf' }));
    input.files = dt.files;
    form.append(input);
    document.body.append(form);
    form.submit();
  }, bytes);
  await expect(page.locator('img.preview')).toHaveCount(2, { timeout: 15000 });
  expect(page.url()).toBe(APP);
});

test('manifest declares install + share target', async ({ request }) => {
  const m = await (await request.get(APP + 'manifest.webmanifest')).json();
  expect(m.name).toBe('Inkwell');
  expect(m.display).toBe('standalone');
  expect(m.share_target.action).toBe('/inkwell/share');
  expect(m.share_target.params.files[0].accept).toEqual(['image/*', 'application/pdf']);
  expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});
