# Inkwell M0 (Foundation + Printer Tuning) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable, offline phone web app that receives a Drive scan or photo (Share menu or file picker), fits it to A4 through the HP M126nw printer profile, and prints it at true size.

**Architecture:** A static PWA (Vite build) hosted on GitHub Pages. All image work runs in a Web Worker on the phone. The pipeline is `read → gray → printer curve → fit A4 → PDF`. Output goes to Android printing by the route spike 04 proves.

**Tech Stack:**
- Runtime: plain JavaScript (ES modules), JSDoc type-checked with `tsc --checkJs`, Vite 5.
- Tests: Vitest; Playwright with the preinstalled Chromium.
- Libraries: `pdfjs-dist` (PDF input), native `CompressionStream` (PDF output).

**Spec:** `docs/superpowers/specs/2026-10-16-inkwell-design.md` (sections 3, 4, 5, 6.1, 6.2, 8)

## Global Constraints

- English only. Plain-language messages, no jargon in the UI.
- Free tools only. Runtime dependencies: `pdfjs-dist` only. Pin every version exactly (no `^`).
- No network after install. No analytics. No outside scripts at runtime (CSP `script-src 'self'`).
- Everything stays on the phone (no uploads).
- Smallest printed dot = 2 printer dots at 600 dpi. Page = A4 210 × 297 mm. Working resolution 300 dpi (2480 × 3508 px).
- Speed (Mi A1, CPU throttled 4× in tests): one page ≤ 4 s; first open ≤ 3 s; memory ≤ 300 MB.
- Never crash: every failure shows a plain message plus a next step.
- Big buttons (≥ 48 px tall), high contrast.
- Releases are git tags. Tests pass on the laptop before every deploy.
- Phone photos carry EXIF rotation; always decode with orientation applied.

## Review Focus

1. **Rotated phone photo (EXIF orientation 6/8).** It must print upright. → Task 5 test `respects EXIF orientation`.
2. **Landscape page or photo.** It must rotate to fill portrait A4, not shrink to a strip. → Task 3 test `landscape input is rotated`.
3. **Huge photo (50 MP).** It must not run out of memory on the Mi A1; it downscales first. → Task 5 test `caps pixels at 24 MP`.
4. **Broken or password-protected PDF.** It shows "This PDF is locked or damaged…", no blank screen. → Task 5 test `damaged pdf gives friendly error`.
5. **20-page Drive PDF.** Pages are processed one at a time; the progress shows; memory stays flat. → Task 6 test `processes pages sequentially`.

---

### Task 0a: Spike 03 (re-feed repeatability + calibration ramp), throwaway

**Files:** Create `spike-03-refeed/make_sheet.py` (copy helpers from `spike-01-paper-test/make_sheets.py`). Outputs: `pass1.pdf`, `pass2.pdf`, `pass3.pdf`.

- [ ] **Step 1: Generate the sheets.**
  - **pass1:** the drift-check blocks A and B (as in spike 01), plus drift block C at bottom-right, plus a **32-step gray ramp** (plain 8-bit, 6 mm tall, 2 rows: steps 0–15 and 16–31, numbered).
  - **pass2:** lines only, 4 mm long.
  - **pass3:** lines only, 8 mm long, so passes are tellable apart.
- [ ] **Step 2: Arindam prints** pass1 → re-feeds (printed side up, top edge first) → pass2 → re-feeds → pass3, then sends a photo plus: the first ramp step he can tell from black, and the last step he can tell from white.
- [ ] **Step 3: Record results** in `PROGRESS.md`:
  - X/Y shift per pass at A, B and C;
  - whether the shift repeats (same sign and within ±0.5 mm between passes 2 and 3);
  - the two ramp step numbers.
- [ ] **Step 4: Commit** `spike 03: refeed + calibration results`.

### Task 0b: Spike 04 (Mi A1 reality check), throwaway

**Prerequisite (Arindam, about 5 min):**
1. Create a public GitHub repo `inkwell`.
2. Settings → Pages → Source: "Deploy from a branch", branch `gh-pages`.
3. Create a fine-grained token (Contents: read/write, this repo only) and paste it into `.env` as `GITHUB_TOKEN=` (the file is git-ignored; never printed).

**Files:** Create `spike-04-phone/index.html`, `spike-04-phone/manifest.json`, `spike-04-phone/sw.js`, `scripts/deploy.ps1`.

- [ ] **Step 1: Build one page** that shows:
  - **(a) Chrome version:** `navigator.userAgent`.
  - **(b) Worker speed:** a Web Worker grays and applies a 256-entry lookup table to an 8 MP synthetic image; shows milliseconds.
  - **(c) Share target:** the manifest declares `share_target` (POST `/inkwell/share`, multipart, `files` accepting `image/*,application/pdf`). The service worker stores the posted file in Cache `shared` and redirects to `./?shared=1`. The page then shows the file's name and size.
  - **(d) Three print buttons for a built-in A4 PDF that has a 100 mm ruler:**
    1. `window.print()` on an `<img>` page with `@page { size: A4; margin: 0 }`;
    2. `navigator.share({ files: [pdf] })`;
    3. download the PDF.
- [ ] **Step 2: Deploy.** `scripts/deploy.ps1 <folder>` pushes the folder to branch `gh-pages` using `GITHUB_TOKEN` from `.env`. The token must never appear in output or errors (re-raise clean messages).
- [ ] **Step 3: Arindam opens it on the Mi A1:**
  1. install it (Add to Home screen);
  2. share a Drive scan to it;
  3. try all 3 print buttons;
  4. measure the 3 rulers;
  5. send a screenshot of the numbers.
- [ ] **Step 4: Record in `PROGRESS.md`:**
  - Chrome version;
  - worker time (pass = ≤ 1500 ms for 8 MP);
  - share target works or not;
  - **the chosen print route** = the first button that is 100 mm and has the fewest taps.
  - If share-target fails on the Mi A1, M0 keeps the file picker only for that phone and the spec risk table is updated.
- [ ] **Step 5: Commit** `spike 04: phone results`.

---

### Task 1: App skeleton + tooling

**Files:**
- Create: `package.json`, `vite.config.js`, `jsconfig.json`, `index.html`, `src/main.js`, `tests/smoke.test.js`
- Modify: `.gitignore` (add `node_modules/`, `dist/`, `.env`)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (`vitest run`), `check` (`tsc --noEmit -p jsconfig.json`), `e2e` (Playwright), `deploy` (`scripts/deploy.ps1 dist`).

- [ ] **Step 1: Write the failing test.** `tests/smoke.test.js`: `import { APP_NAME } from '../src/main.js'; expect(APP_NAME).toBe('Inkwell')`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement the skeleton:**
  - pinned devDependencies: `vite`, `vitest`, `typescript`, `@playwright/test`;
  - dependency: `pdfjs-dist`;
  - `vite.config.js` `base: '/inkwell/'`;
  - Playwright config with `executablePath: '/opt/pw-browsers/chromium'` fallback to the local Chromium path;
  - `src/main.js` exports `APP_NAME = 'Inkwell'`.
- [ ] **Step 4: Run `npm test && npm run check && npm run build`.** Expected: all pass, and `dist/index.html` exists.
- [ ] **Step 5: Commit** `M0 task 1: skeleton`.

### Task 2: PDF writer

**Files:** Create `src/image/types.js`, `src/pdf/writePdf.js`, `tests/pdf/writePdf.test.js`

**Interfaces:**
- Produces:
  - `/** @typedef {{width:number,height:number,data:Uint8Array}} Gray */` in `src/image/types.js` (8-bit, 0 = black, 255 = white, row-major).
  - `writePdf(pages: Gray[], dpi: number): Promise<Uint8Array>`. Each page becomes one PDF page sized `width/dpi × height/dpi` inches. The image is DeviceGray, 8 bits, FlateDecode via `CompressionStream('deflate')`, `/Interpolate false`.

- [ ] **Step 1: Write the failing tests:**
  - `a4 at 300 dpi gives 595.28 x 841.89 pt`: load the result with pdfjs; `page.view` ≈ `[0,0,595.28,841.89]` (±0.1).
  - `pixels round-trip`: a 4 × 4 checker page written and rendered back at scale 1 keeps black and white in the same places.
  - `three pages in, three pages out`.
- [ ] **Step 2: Run** `npx vitest run tests/pdf`. Expected: FAIL.
- [ ] **Step 3: Implement** the same object layout as `spike-01-paper-test/make_sheets.py:write_pdf`, generalized to N pages.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `M0 task 2: pdf writer`.

### Task 3: Gray + fit to A4

**Files:** Create `src/image/gray.js`, `src/layout/fitA4.js`, `tests/image/gray.test.js`, `tests/layout/fitA4.test.js`

**Interfaces:**
- Consumes: `Gray` (Task 2).
- Produces:
  - `toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray`. Rec. 709 luma on sRGB values, rounded.
  - `fitA4(src: Gray, opts?: {dpi?: number, marginMm?: number}): Gray`. Defaults: `dpi 300`, `marginMm 5`. Output is 2480 × 3508. If `src` is wider than tall, rotate it 90° clockwise first. Scale it (bilinear) to the largest size inside the margins keeping proportions, centered on white.
  - `toner(g: Gray): number` (in `src/image/gray.js`): percent 0–100 = `100 * (1 - mean/255)`.

- [ ] **Step 1: Write the failing tests:**
  - pure red `(255,0,0)` → 54;
  - white → 255;
  - `toner` of an all-black page = 100, all-white = 0;
  - `fitA4` output is exactly 2480 × 3508;
  - a 100 × 141 all-black input → black area centered, ≥ 2420 px wide;
  - **`landscape input is rotated`:** 300 × 100 input → the black area is taller than wide.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `M0 task 3: gray + fit A4`.

### Task 4: Printer profile (HP M126nw)

**Files:** Create `src/printer/profile.js`, `tests/printer/profile.test.js`

**Interfaces:**
- Produces:
  - `HP_M126NW = { name: 'HP LaserJet Pro MFP M126nw', dpi: 600, minDot: 2, curve: [[0,0],[0.06,0.22],[0.94,0.86],[1,1]], drift: null }`.
  - These curve points are the spike-01 estimate. **Replace them with spike-03 ramp readings:** point 2 output = (first visible dark step)/31; point 3 output = (last visible light step)/31.
  - `drift` = spike-03 mean shift `{xMm, yMm}` if repeatable, else `null`.
  - `applyCurve(g: Gray, curve: number[][]): Gray`: piecewise-linear via a 256-entry lookup table; returns a new Gray.

- [ ] **Step 1: Write the failing tests:**
  - 0 → 0;
  - 255 → 255;
  - the output is monotonic over 0..255;
  - input `round(0.06*255)` → `round(0.22*255)` ±1;
  - the input array is untouched.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with the spike-03 numbers.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `M0 task 4: printer profile`.

### Task 5: Reading files

**Files:** Create `src/input/readFile.js`, `src/errors.js`, `tests/input/readFile.test.js`, `tests/fixtures/` (tiny JPEG with EXIF orientation 6; a 2-page PDF made with `writePdf`; a truncated PDF; a 3-byte `.txt`).

**Interfaces:**
- Produces:
  - `class InkwellError extends Error { constructor(message: string, hint: string) }`. Both strings are shown to the family as-is.
  - `readFile(file: Blob & {name?: string}, opts?: {pdfDpi?: number, maxPixels?: number}): AsyncGenerator<Gray>`. It yields one Gray per page (PDFs rendered at `pdfDpi` default 200), one at a time.
    - Images decode via `createImageBitmap(file, { imageOrientation: 'from-image' })`, then downscale if over `maxPixels` (default 24 000 000).
  - Friendly errors:
    - unknown type → `InkwellError('Inkwell can't open this kind of file.', 'Share a photo or a PDF instead.')`;
    - bad or locked PDF → `InkwellError('This PDF is locked or damaged.', 'Open it in Drive, then share it again.')`.

- [ ] **Step 1: Write the failing tests** (Vitest browser-like env for `createImageBitmap`: run this file in Playwright Chromium via `@vitest/browser`, pinned):
  - `respects EXIF orientation`: the fixture is stored 40 × 20 with orientation 6 → the yielded Gray is 20 × 40;
  - `two-page pdf yields two pages`;
  - `caps pixels at 24 MP`: a 6000 × 5000 canvas blob → width × height ≤ 24 000 000;
  - `damaged pdf gives friendly error`: the message equals the exact string above;
  - `txt file gives friendly error`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `M0 task 5: file input`.

### Task 6: Pipeline in a worker

**Files:** Create `src/pipeline/pipeline.js` (pure), `src/pipeline/worker.js`, `src/pipeline/run.js`, `tests/pipeline/pipeline.test.js`

**Interfaces:**
- Consumes: `readFile`, `toGray`/`fitA4`/`toner`, `applyCurve` + `HP_M126NW`, `writePdf`.
- Produces:
  - `processPage(g: Gray, profile): Gray` = `fitA4(applyCurve(g, profile.curve))`.
  - `run(file: Blob, onProgress: (done: number, total: number|null) => void): Promise<{pdf: Uint8Array, previews: Gray[], tonerPct: number}>`. It runs in the worker. Previews are downscaled to 600 px tall. `tonerPct` is the mean over pages.
  - Timeout: 20 s per page → `InkwellError('This took too long.', 'Try a smaller photo or fewer pages.')`.

- [ ] **Step 1: Write the failing tests:**
  - `processPage` output is 2480 × 3508 and is curve-applied (a mid-gray input pixel maps to the curve value);
  - **`processes pages sequentially`:** with a fake 20-page generator, `onProgress` is called 20 times in order, and at most 2 full-size pages are alive at once (count via a wrapper);
  - the `run` result PDF has 20 pages.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `worker.js` is a thin message adapter around `pipeline.js`; `run.js` wraps the worker in a promise.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `M0 task 6: pipeline`.

### Task 7: The screen

**Files:** Create `src/ui/app.js`, `src/ui/style.css`; modify `index.html`, `src/main.js`. Test: `e2e/app.spec.js`.

**Interfaces:**
- Consumes: `run`, `InkwellError`, the print route from spike 04.
- Produces: one screen, three states:
  1. **Empty:** a big button "Choose a photo or PDF" (≥ 48 px) and the line "Or share from Drive → Inkwell".
  2. **Working:** "Getting it ready… page N of M".
  3. **Ready:** page previews, the line `Toner: X%`, and a big **Print** button (uses the spike-04 route).
  - Errors show `message` + `hint` and a "Try another file" button.

- [ ] **Step 1: Write the failing e2e tests** (Playwright, 412 × 915 viewport, CPU throttle 4× via CDP `Emulation.setCPUThrottlingRate`):
  - pick `tests/fixtures/two-page.pdf` → 2 previews and a `Toner:` line appear within 8 s;
  - pick the `.txt` → the exact friendly message is visible;
  - every button's bounding box height is ≥ 48.
- [ ] **Step 2: Run** `npm run e2e`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `M0 task 7: screen`.

### Task 8: Install, offline, Share menu

**Files:** Create `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` (192, 512, maskable 512, apple 180; simple ink-drop mark, black on white); modify `index.html` (manifest link, CSP meta, SW registration). Test: `e2e/pwa.spec.js`.

**Interfaces:**
- Produces:
  - **Manifest:** `name: "Inkwell"`, `start_url: "/inkwell/"`, `display: "standalone"`, `share_target`:
    ```json
    {"action":"/inkwell/share","method":"POST","enctype":"multipart/form-data","params":{"files":[{"name":"file","accept":["image/*","application/pdf"]}]}}
    ```
  - **SW:** caches the app shell (cache-first for hashed assets, network-first for `index.html`). `POST /inkwell/share` → store the file in Cache `shared` as `/inkwell/shared-file` → 303 to `/inkwell/?shared=1`.
  - **App:** on `?shared=1`, reads `shared-file`, runs it, then deletes it.
  - Uses the spike-04 result: if share-target failed on the Mi A1, keep it anyway (it works on the Realme) and note it.

- [ ] **Step 1: Write the failing e2e tests:**
  - after the first load, `context.setOffline(true)` + reload → the "Choose a photo or PDF" button is visible;
  - a simulated multipart POST to `/inkwell/share` (via `page.evaluate` + `fetch` through the SW) → the page lands on `?shared=1` and shows a preview.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check && npm run e2e`. Expected: all PASS.
- [ ] **Step 5: Commit** `M0 task 8: pwa`.

### Task 9: Release + real-phone acceptance

**Files:** Create `PROGRESS.md` sections and the `scripts/deploy.ps1` (from Task 0b).

- [ ] **Step 1: Run** `npm test && npm run check && npm run e2e && npm run build`. Expected: all pass.
- [ ] **Step 2: Deploy.** `npm run deploy`, then `git tag v0.1.0`. Open `https://arindam2000.github.io/inkwell/` from the laptop. Expected: loads.
- [ ] **Step 3: Arindam checks the spec 6.1 "done when"** on the Mi A1 and the Realme 3 Pro:
  1. install it;
  2. share a Drive scan → print → the ruler on a test page is 100 mm;
  3. Wi-Fi off → the app still opens.
- [ ] **Step 4: Write the after-action review** in `PROGRESS.md` (planned → happened → why different → keep/change).
- [ ] **Step 5: Commit** `M0 done: v0.1.0`.
