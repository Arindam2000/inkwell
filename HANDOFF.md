# Inkwell handoff (2026-10-16)

**Goal:** family B&W print PWA (spec: `docs/superpowers/specs/2026-10-16-inkwell-design.md`, plan: `docs/superpowers/plans/2026-10-16-m0-foundation.md`, quality bar: `SCORECARD.md`).

**State:** M0 tasks 1-8 built and committed (`git log`). 16 unit tests pass (`npm test`), plus e2e (`npm run e2e`). Deploy script ready (`npm run deploy`, reads `.env`).

**Waiting on Arindam:**
1. Spike 03 print: sheets copied to `OneDrive\Desktop\Test print 03\` (pass1 -> refeed -> pass2 -> refeed -> pass3). Needs photo + first step distinct from black + last step distinct from white.
2. Token: `.env` exists with empty `GITHUB_TOKEN=`; Desktop `Inkwell token (open .env).cmd` opens it. Never ask for the token in chat.
3. GitHub repo `Arindam2000/inkwell` + Pages on `gh-pages` (plan Task 0b).

**Next for Claude:**
1. Spike 03 numbers -> printer profile curve points + drift (plan Task 4 note), record in PROGRESS.md, commit.
2. Task 9: build, deploy, tag v0.1.0, phone acceptance on Mi A1 + Realme 3 Pro.
3. One fresh reviewer at the end ("simple" mode).

**Gotcha:** the 🖨️ emoji in the folder name breaks WScript `.lnk` shortcuts (old `pass1 - Shortcut.lnk` points at spike 01). Use copies or a UTF-8 `.cmd` with `chcp 65001`.

## Update 2026-10-16 (later)
- v0.1.0 live at arindam2000.github.io/inkwell (Pages on gh-pages, he enabled it). Spike 03 results in PROGRESS.md.
- v0.2.0: Print button (share PDF -> print app, download fallback) + book print (odd pages, re-insert stack blank side up, even pages reversed; blank back for odd counts; resumes after app close; "how did backs come out" learns rotate/reverse in localStorage).
- His printer: output face down (printed side down, blank up), last sheet on top.
- Next (his choice B): camera scan inside Inkwell, no Drive. He wants **magic crop (page edge detect + perspective fix) and auto enhance**, like Drive's scanner.
- Phone acceptance (ruler 100 mm, offline, share) still pending on Mi A1 + Realme 3 Pro.

## Update 2026-10-16 (afternoon)
- Source now on github.com/Arindam2000/inkwell `main` (token has Workflows permission). `.github/workflows/apk.yml` builds the Capacitor Android app on each push -> releases/latest/download/inkwell.apk (debug-signed; key changes per build, so updates may need uninstall).
- Android app prints direct: `src/print/{urf,ipp,direct}.js` + `android/.../IppPlugin.java` (mDNS `_ipp._tcp` discovery, IPP Print-Job with URF 600 dpi, quality 5). Spike 05 proved 100 mm exact from laptop.
- v0.3.0: page numbers, tap-to-skip, copies, summary. v0.4.0: book print in 5-sheet batches with blank-sheet check and per-batch redo (double-feed fix).
- Next: phone test of APK direct print; then 2 pages per sheet, lighter/darker; then camera scan (magic crop + auto enhance). Rea: Arindam to run `npx rea-agents@6.5.0 setup` himself.

## Update 2026-10-16 (evening)
- v0.5-0.7: share into Android app (SharedPlugin), Inkwell icon, darkness + 2 per sheet, camera scan via @capacitor-mlkit/document-scanner (FULL mode, PDF result).
- APK now signed with a fixed key: `.keys/inkwell.p12` (git-ignored, password in `.env` INKWELL_KEY_PASS), uploaded as secrets INKWELL_KEYSTORE_B64 / INKWELL_KEY_PASS. Losing the key = users must uninstall to update; keep `.keys/` backed up.
- Next: phone test of v0.7.0 (scan, share, signed update), then Magic Scan cleanup extras (ID card mode, show-through), then v1.0 fresh review.

## Update 2026-10-16 (Magic Scan)
- Scan lab: `python scan-lab/make_lab.py` makes 29 deterministic cases (git-ignored); `tests/scan-lab.test.js` scores them with ratchet LIMITS (never lower). Known limit: h5 dark room (no visible page edge -> no crop).
- `src/scan/clean.js` (paper map via closing + fill non-paper, levels, despeckle, finger removal; auto = documents only), `src/scan/crop.js` (edge-bounded flood vs Otsu, line-fit corners, warp, A4 snap), `src/layout/idCard.js`.
- Corner-drag: not built; Google scanner's gallery import already lets you drag corners in the Android app.
- v0.10.0 APK built. Next: Arindam's real-paper check; then Ink Saver (M2).

## PAUSED 2026-10-16 17:40 IST (mid-task, saved as WIP)
- v0.11.0 is the last finished version (APK built OK). Everything after is WIP in the latest commit.
- WIP "more print options": Quality Draft/Normal/Best (IPP print-quality 3/4/5), Size Fit/Actual (PDF dpi), 4 per sheet, Booklet (bookletSides + nUp), Ink saver (flipIfDark), all under a "More options" <details>. Unit tests + type check pass.
- To finish: e2e/print.spec.js last test — after picking Draft, call `await open2(page)` instead of `page.reload()` (options live on the ready screen). Then run all checks, bump to 0.12.0, deploy, push main for the APK, tell Arindam.

## Update 2026-10-16 (v0.12.0)
- More options done: Quality Draft/Normal/Best, Actual size, 4 per sheet, Booklet, Ink saver. 41 unit + 21 e2e pass. Committed locally; deploy + push await Arindam's OK.


## Update 2026-10-16 (v0.13.0)
- v0.12.0 shipped (deploy + APK). Local branch is m0-foundation and has no remote: push with `git push <url> m0-foundation:main` using the token header like scripts/deploy.ps1. Run `npm run build` before `npm run deploy` (deploy doesn't build).
- Mini book (src/layout/miniBook.js): 8 pages (A6, folds H,V) or 16 (A7, folds V,H,V) per sheet, page order from a fold simulator; 8-page matches the textbook quarto. 'Try a numbered fold test' button. Several files can be picked at once.
- Booklet backs now turned 180 (folded across the width = short-edge flip; book print turns on the long edge). Not yet checked on paper.
- Update button: Android app reads the release title 'Inkwell vX.Y.Z' from the GitHub API and links to the APK (Android asks once to install).


## Update 2026-10-16 (v0.14.0)
- Setting changes are fast: the worker stays alive and keeps each page after clean-up (compressed); same file + same clean-up mode replays from memory (src/pipeline/run.js 'held', worker.js 'again'). Screen stays on Ready, dimmed (.busy); taps while busy = only the latest runs.
- In-app update: UpdatePlugin.java downloads the APK to cache/update, opens the installer (REQUEST_INSTALL_PACKAGES; first time Android asks to allow Inkwell). Cache is wiped on every start. Not yet tested on a phone.


## Update 2026-10-16 (v0.15.0)
- Back: '‹ Back' on the Ready screen; leaving the start screen pushes one history entry so Android's back gesture returns home (closes the big preview first) instead of exiting.

- v0.16.0: '⌂ Home' button in the header on every screen except the start screen (same action as Back).

- v0.17.0: Android Back handled natively (MainActivity OnBackPressedCallback asks window.inkwellBack(); false = moveTaskToBack). No @capacitor/app plugin, so before this Back closed the app. Save as image: gray->RGBA with Uint32 writes (was a 4-element array per pixel). Save/Print buttons guarded: taps while working are ignored, label shows 'Saving 2 of 5…'.

- Gotcha: when checking `npm test`, look for 'Failed Suites' too. A module that won't load (e.g. top-level `window` in app.js, imported by tests/smoke.test.js) drops the count by one instead of showing a failed test. Use globalThis.

- v0.18.0 memory (src/ui/app.js): 'made' = big previews + saved files (per kind + skipped set), emptied on new pages; 'results' = last 6 prepared results for this file by settings (quality ignored), emptied on a new file. Plus the worker's cleaned-page cache (v0.14).

- v0.19.0: faster opening (auto clean-up skipped on pure-white computer-made PDF pages; next page is read while the worker processes the last). Julee (his Indian Spitz) drawn in src/ui/julee.js: welcome on the start screen ('নমস্কার! আজ কী প্রিন্ট করবো?'), loading ('একটু অপেক্ষা করুন!', a page floats up; new files wait for one full 2.4 s float before opening). More options has a turning arrow.

- v0.20.0: Julee redrawn anime-style (fluff() tuft outlines, gradients, glossy eyes, blush, sweater stripes, swinging charm), slow ease-in-out motion (breathe 3.6 s, sway 6 s, tail 2.2 s, ear flick, blink, sparkles). Bubbles: Bengali (20px) + English (15px) underneath. No AI image tool in this setup; for hand-drawn anime art, he'd make a still in an image AI and I'd animate it.

- v0.21.0: Lily (Julee's puppy sister) drawn beside Julee (dog() in julee.js, mirrored, bigger head, no sweater/tongue). Bubbles: Bengali + Bengali in English letters (his choice, not Hindi). HELLO/WAIT phrase lists (5 each) pick at random; loading line changes every 2.4 s.

- v0.22.0: Julee & Lily are Ghibli watercolours made in Google Flow (his account, PRO, Nano Banana 2.1; project 'Oct 17 - 00:27'). src/ui/img/{julee,lily}.jpg = crops with paper levelled to pure white; .dog uses mix-blend-mode multiply over .pups paper background. Motion: breathe, soft-masked head copy that nods, blink lids (percent positions per dog), drifting petals, page float while loading. Flow video (Frames) not done: couldn't set a start frame by automation.
- Gotcha: the Claude app's built-in browser can't attach local files (no file_upload); Claude in Chrome has file_upload. For upload tasks, connect the Chrome extension. Localhost fetch from the pane also fails.

- v0.23.0: big preview never blank (small preview shown at once; old blob URL had been revoked when settings changed). Update: download first with a moving bar (showUpdate in app.js), THEN Android's 'allow from this source'; finished download kept as cache/update/inkwell-<ver>.apk (.part while downloading); deleted on start only when up to date.

- v0.24.0: printer picker (app.js pickPrinter/search; localStorage 'inkwell-printer' = {name, host}, old plain-host value still read). 'Printer: … ▾' row on Ready (app only). 'Print with Android' = IppPlugin.systemPrint (PrintManager + PDF adapter), remembered as host 'android'. One printer found = chosen without asking.

- v0.24.1 was a no-change test release. v0.25.0: update check on start + whenever the app comes back to the screen + every 30 min (1-min throttle). New version is prefetched in the background (UpdatePlugin.prefetch; synchronized ensure() so a tap during prefetch waits instead of downloading twice); button stages Connecting… / Getting v… N% / Update ready · tap to install; tap during download = install when ready.

