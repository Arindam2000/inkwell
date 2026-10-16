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

