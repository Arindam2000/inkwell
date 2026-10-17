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

test('Back: the button and the phone back gesture return to the start screen; back first closes a big preview', async ({ page }) => {
  await open2(page);
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(page.getByRole('button', { name: 'Choose photos or PDFs' })).toBeVisible();
  await page.locator('#file').setInputFiles([]); // what tapping Choose does: same file can be picked again
  await page.locator('#file').setInputFiles(fixture('two-page.pdf'));
  await expect(page.locator('img.preview')).toHaveCount(2, { timeout: 15000 });
  await page.locator('button.open').first().click();
  await expect(page.locator('#viewer')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('section[data-state="ready"]')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Choose photos or PDFs' })).toBeVisible();
});

test('Home: shown on every screen but the start, and goes straight back to it', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: '⌂ Home' })).toBeHidden();
  await page.locator('#file').setInputFiles(fixture('two-page.pdf'));
  await expect(page.locator('section[data-state="ready"]')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Print as a book (both sides)' }).click();
  await page.getByRole('button', { name: '⌂ Home' }).click();
  await expect(page.getByRole('button', { name: 'Choose photos or PDFs' })).toBeVisible();
  await expect(page.getByRole('button', { name: '⌂ Home' })).toBeHidden();
});

test('Save as image: extra taps while saving are ignored (one picture per page, not one per tap)', async ({ page }) => {
  await open2(page);
  const files = [];
  page.on('download', (d) => files.push(d.suggestedFilename()));
  const btn = page.getByRole('button', { name: 'Save as image' });
  await page.evaluate(() => { const b = document.getElementById('save-img'); b.click(); b.click(); b.click(); }); // three impatient taps
  await expect(btn).toBeVisible({ timeout: 15000 }); // label back = done
  await page.waitForTimeout(500);
  expect(files.sort()).toEqual(['inkwell-1.jpg', 'inkwell-2.jpg']);
});

test('app Back (Android asks the page): preview first, then pages, then lets the app leave', async ({ page }) => {
  await open2(page);
  await page.locator('button.open').first().click();
  const back = () => page.evaluate(() => window.inkwellBack());
  expect(await back()).toBe(true);
  await expect(page.locator('#viewer')).toBeHidden();
  expect(await back()).toBe(true);
  await expect(page.getByRole('button', { name: 'Choose photos or PDFs' })).toBeVisible();
  expect(await back()).toBe(false);
});

test('memory: saving again reuses the pictures; going back to an earlier setting is instant', async ({ page }) => {
  await open2(page);
  const files = [];
  page.on('download', (d) => files.push(d.suggestedFilename()));
  await page.getByRole('button', { name: 'Save as image' }).click();
  await expect.poll(() => files.length).toBe(2);
  let t = Date.now();
  await page.getByRole('button', { name: 'Save as image' }).click();
  await expect.poll(() => files.length).toBe(4);
  expect(Date.now() - t).toBeLessThan(1500);
  await page.getByRole('button', { name: 'Darker' }).click();
  await expect(page.locator('#summary')).toHaveText('2 pages · 2 sheets', { timeout: 15000 });
  t = Date.now();
  await page.getByRole('button', { name: 'Normal' }).click();
  await expect(page.locator('#summary')).toHaveText('2 pages · 2 sheets');
  await expect(page.locator('#app')).not.toHaveClass(/busy/);
  expect(Date.now() - t).toBeLessThan(1500);
});

test('big preview is never blank: it shows the small picture at once, even after a setting changed', async ({ page }) => {
  await open2(page);
  await page.locator('button.open').first().click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Darker' }).click();
  await expect(page.locator('#summary')).toHaveText('2 pages · 2 sheets', { timeout: 15000 });
  await page.locator('button.open').first().click();
  const shown = await page.locator('#viewer-img').evaluate(async (img) => {
    await new Promise((r) => setTimeout(r, 60));
    return img.complete && img.naturalWidth > 0;
  });
  expect(shown).toBe(true);
});

test('Update: fetched in the background with clear stages; tap installs at once when ready, or as soon as it is', async ({ page }) => {
  await page.goto('./');
  const steps = await page.evaluate(async () => {
    const { showUpdate } = await import('/inkwell/src/ui/app.js');
    const b = document.getElementById('update');
    const tick = () => new Promise((r) => setTimeout(r, 0));
    /** @type {(pct: number) => void} */ let report = () => {};
    let done = () => {};
    let installs = 0;
    showUpdate(b, '9.9.9', {
      fetch: (onProgress) => { report = onProgress; return new Promise((r) => { done = () => r(undefined); }); },
      install: async () => { installs++; return {}; },
    });
    const seen = [`${b.textContent}|${b.classList.contains('loading')}`];
    report(40);
    seen.push(`${b.textContent}|${b.style.getPropertyValue('--pct')}`);
    done();
    await tick();
    seen.push(`${b.textContent}|${b.classList.contains('ready')}|${installs}`);
    b.click();
    await tick(); await tick();
    seen.push(`installs ${installs}`);
    // tapped while still downloading: installs by itself when the download finishes
    showUpdate(b, '9.9.10', { fetch: () => new Promise((r) => { done = () => r(undefined); }), install: async () => { installs++; return {}; } });
    b.click();
    seen.push(b.textContent);
    done();
    await tick(); await tick();
    seen.push(`installs ${installs}`);
    return seen;
  });
  expect(steps).toEqual([
    'New version v9.9.9 · connecting…|true', 'Getting v9.9.9… 40%|40%', 'Update ready: v9.9.9 · tap to install|true|0', 'installs 1',
    'Connecting… (installs when ready)', 'installs 2',
  ]);
});
test('printer picker: lists the printers found, remembers the choice; one printer is picked by itself; none offers Android', async ({ page }) => {
  await page.goto('./');
  const r = await page.evaluate(async () => {
    const { pickPrinter } = await import('/inkwell/src/ui/app.js');
    const two = async () => [{ name: 'HP LaserJet', host: '192.168.1.5' }, { name: 'Canon Office', host: '192.168.1.9' }];
    const chosen = pickPrinter(false, two);
    await new Promise((res) => setTimeout(res, 50));
    const names = [...document.querySelectorAll('#picker-list button')].map((b) => b.firstChild.textContent);
    /** @type {HTMLElement} */ (document.querySelectorAll('#picker-list button')[1]).click();
    const pick = await chosen;
    const saved = JSON.parse(localStorage.getItem('inkwell-printer'));
    const auto = await pickPrinter(true, async () => [{ name: 'Only One', host: '10.0.0.2' }]);
    const none = pickPrinter(false, async () => []);
    await new Promise((res) => setTimeout(res, 50));
    const msg = document.getElementById('picker-msg').textContent;
    document.getElementById('pick-android').click();
    const android = await none;
    const stillSaved = JSON.parse(localStorage.getItem('inkwell-printer')).host; // Android's screen is one-time, never the default
    return { names, pick: pick.name, saved: saved.host, auto: auto.name, msg, android: android.host, stillSaved, hidden: document.getElementById('picker').hidden };
  });
  expect(r).toEqual({ names: ['HP LaserJet', 'Canon Office'], pick: 'Canon Office', saved: '192.168.1.9', auto: 'Only One',
    msg: expect.stringContaining('No printer found'), android: 'android', stillSaved: '10.0.0.2', hidden: true });
});

test('a PDF opened before comes back from the phone memory (no reading or clean-up), even after restarting', async ({ page }) => {
  await open2(page);
  const before = await page.locator('img.preview').first().getAttribute('src');
  await page.reload(); // app closed and opened again
  await page.evaluate(() => { window.__workers = 0; const W = window.Worker; window.Worker = class extends W { constructor(...a) { super(...a); if (String(a[0]).includes('pipeline')) window.__workers++; } }; });
  await page.locator('#file').setInputFiles(fixture('two-page.pdf'));
  await expect(page.locator('img.preview')).toHaveCount(2, { timeout: 15000 });
  expect(await page.evaluate(() => window.__workers)).toBe(0); // no preparing worker was started
  expect(before).toBeTruthy();
});
