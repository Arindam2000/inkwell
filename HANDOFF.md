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
