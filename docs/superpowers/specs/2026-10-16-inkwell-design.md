# Inkwell: design spec (v1)

*Working name: Inkwell. Project: Printing Envisioned. Date: 2026-10-16. Status: **DRAFT, waiting for Arindam's review.***

---

## 1. In one breath

**Inkwell is a phone app that makes everything the family prints come out clean, true-size and beautiful on their black-and-white laser, while using less toner.**
It does documents first, photos second, and fun prints (mystery, posters, origami) after that.

---

## 2. Who, what, why

| | |
|---|---|
| **Who** | Arindam's family. Android phones only. Oldest: **Mi A1** and **Realme 3 Pro**. |
| **Printer** | HP LaserJet Pro MFP M126nw: black-and-white laser, 600 dpi, A4, Wi-Fi, flatbed scanner, no auto two-sided printing. |
| **Main use** | Documents: pages photographed or scanned with Google Drive, then printed. |
| **Pain today** | Color photos and charts print muddy. Phone photos of papers print tilted, gray and shadowy, and waste toner. |
| **Quality bar** | Family use, **enterprise-grade quality**: tested, fast, private, never crashes, easy for anyone. |
| **Money** | Free tools and free hosting only. |

**Success looks like:**
1. Anyone in the family can go photo → print in **3 taps**, without asking Arindam.
2. Documents look **scanner-clean** and fit A4.
3. Every print shows how much toner it saves.
4. It works **without internet** after the first install.

---

## 3. What the tests already proved (2026-10-16)

From spike 01 (printed test sheet) and spike 02 (Drive scan):

| Finding | What it means for the design |
|---|---|
| ✅ Phone PDF prints keep true size (100 mm ruler correct, ±2%) | Make exact A4 PDFs and let Android print them. No custom driver needed. |
| ✅ Re-feeding works: printed side **up**, top edge (X) **toward the printer** | This becomes the loading rule shown on screen for mystery prints. |
| ⚠️ Re-fed paper shifts up to **3 mm** and tilts slightly | Mystery prints must tolerate ±3 mm. Spike 03 checks whether the shift repeats (if it does, we pre-correct it). |
| ❌ Finest dots (600 dpi single dots) print muddy | Smallest dot we use = **2 printer dots** (300 dpi). "Fine" settings are banned. |
| ⚠️ Only ~12 of 16 gray steps visible (3 darkest merge, 2 lightest vanish) | Every print goes through a **printer tuning curve** (see 6.2). |
| ✅ All 6 chart-safe hatch patterns clearly different | Chart-safe mode is proven. |
| ✅ Medium/coarse halftone dots, medium stipple and engraving lines look good | These are the base for the art styles. |
| ✅ Google Drive's crop + straighten is excellent | We **don't rebuild scanning** in v1. Drive scans, then shares to Inkwell. |
| ⚠️ Drive saves pages at odd sizes (216 × 353 mm), not A4 | Inkwell always fits pages to A4 (or true size for known sizes). |
| ⚠️ Drive "auto" output can carry gray speckles + text showing through from the back of the page | "Show-through removal" is a real build item and the hardest part of Magic Scan. |

---

## 4. The big picture: how it works

```
 Google Drive scan ─┐
 Gallery photo ─────┼─► 1. RECEIVE ─► 2. UNDERSTAND ─► 3. LENS ─► 4. PRINTER TUNING ─► 5. LAYOUT ─► 6. PDF ─► Android Print ─► HP M126nw
 WhatsApp image ────┤      (share)      (doc/photo/      (the look)  (tuning curve,       (A4 fit, ID,
 Camera ────────────┘                   chart/screen)                min dot size)        poster, mystery)
```

1. **Receive.** Inkwell appears in Android's **Share** menu (Drive → Share → Inkwell). Also: pick from gallery, or take a photo.
2. **Understand.** It guesses what the input is (document, photo, chart, screenshot) and picks a sensible default. One tap to change it.
3. **Lens.** The look: Scanner-clean, Smart gray, Halftone, Engraving, and so on.
4. **Printer tuning.** Corrects for what this printer can't do (measured, see 6.2).
5. **Layout.** Fit to A4, true size, ID card, poster tiles, mystery layers, origami template.
6. **PDF → print.** Inkwell builds an exact A4 PDF and hands it to Android's built-in printing (already proven to work at 100%).

**Everything runs on the phone.** Photos never leave it, and nothing is uploaded.

---

## 5. Technology choices (and why)

| Choice | Why |
|---|---|
| **Installable web app (PWA)**, later wrapped as an Android app | One codebase. Installs from a link. Updates itself. Free. |
| **Hosting: GitHub Pages** (Arindam already uses it) | Free, reliable, HTTPS. The repo holds **code only, never family files**. Free accounts need a **public** repo for Pages (see question Q3). |
| **Language: JavaScript**, type-checked (JSDoc + TypeScript checker), with **Vite** as the build tool | Fits the partnership's language rule (web-standard JS for the phone). The type checks catch bugs early (enterprise bar). |
| **Heavy image work in a background worker** | The screen never freezes, even on the Mi A1. |
| **pdf.js** (Mozilla, free) to read Drive PDFs | The standard, battle-tested PDF reader. |
| **Our own small PDF writer** (proven in spike 01) | Exact page size and lossless dots. No library rescales our patterns. |
| **Android Share Target** (web standard) | Lets Drive and WhatsApp send files straight into Inkwell. |
| **Phone storage (IndexedDB)** for settings and recent prints | Private; stays on the device. |
| **Later (M7): small Android app shell** with Google's **ML Kit Document Scanner** | Google-grade scanning inside Inkwell (one button: scan → print). Free; Android only; installed directly (no Play Store). |

**Not used:** no accounts, no servers, no analytics, no ads, no paid services.

---

## 6. Features

Each feature lists **what it does** and **how we know it's done** (acceptance tests).

### 6.1 Foundation (M0)
- Installable app with icon; works offline after first open.
- Appears in Android's Share menu for images and PDFs.
- Builds exact A4 PDFs; "Print" opens Android printing.
- Settings: printer profile, Ink Saver on/off, language.
- **Done when:**
  - it installs on the Mi A1 and Realme 3 Pro;
  - a Drive scan shared to Inkwell prints at true A4 from both phones;
  - it opens with Wi-Fi off.

### 6.2 Printer tuning (M0, built in from day one)
- A **printer profile** for the HP M126nw holds:
  - **Tone curve:** lifts the darkest tones so they don't merge into black; keeps the lightest tones from vanishing.
  - **Minimum dot size:** 2 printer dots; finer patterns are never produced.
  - **Paper drift:** measured shift for re-fed sheets (from spike 03).
- **"Tune my printer" flow:** print one calibration sheet, then answer 2 or 3 taps ("which is the first gray you can see?"). The profile updates. This also lets Inkwell work on any future printer.
- **Done when:** a 16-step gray ramp printed through the profile shows **≥ 15 distinct steps** (was ~12).

### 6.3 Magic Scan: documents (M1, the #1 feature)
Input: a Drive scan (PDF or image) or a photo of a paper.
- **Scanner-clean:**
  - paper becomes pure white;
  - uneven light and shadows are flattened;
  - text becomes crisp black.
- **Show-through removal:** faint mirrored text from the back of the page is removed (it is lighter and blurrier than real ink on the front).
- **Speckle removal:** tiny isolated gray dots are removed.
- **Colored ink stays dark:** blue pen, stamps and signatures keep their meaning (smart gray).
- **Size:**
  - fit to A4 (default);
  - **true size** for known shapes (A4, Letter, Legal, ID card), snapped when within ~3%.
- **Multi-page:** many pages → one PDF → one print job.
- **ID card mode:** front + back of a card on one A4 at real card size (85.6 × 54 mm), with a cut line.
- **Fallback scanner** (photo straight from the gallery, no Drive): find the 4 corners, drag to fix, flatten.
- **Done when (golden set of ≥ 12 real family scans: bills, notices, school sheets, book pages, thin paper):**
  - paper areas are ≥ 98% pure white;
  - show-through is gone, judged by Arindam on printed copies of the 3 worst pages;
  - text stays readable (no broken letters) on every page;
  - toner use is ≤ the Drive-as-is version on every page;
  - a 1-page job takes ≤ 4 s on the Mi A1.

### 6.4 Ink Saver (M2)
"Remove the unnecessary, never the quality."
- **Paper-white:** near-white areas print as pure white.
- **Dark-mode flip:** dark screenshots (WhatsApp, apps) flip to light before printing.
- **Border trim:** empty or black bars around screenshots are cut off.
- **Big-black texture:** large solid black areas become a fine texture that still reads as black.
- **Toner meter:** every preview shows "this print: X% toner (normal: Y%)".
- **Done when:**
  - toner drops ≥ 40% on a screenshot test set and ≥ 15% on documents;
  - every golden document still passes its readability check.

### 6.5 Photo art styles (M3)
Each style is tuned to the proven-safe dot sizes:
1. **Smart gray:** colors that would merge become different grays.
2. **Halftone:** classic newspaper dots (medium/coarse).
3. **Stipple:** ink dots like a pen drawing (medium).
4. **Engraving:** lines that thicken in the shadows (banknote style).
5. **Woodcut / Linocut:** bold carved shapes.
6. **Ink wash:** soft brush-like tones.
7. **Risograph grain:** grainy poster print.
8. **Papercut:** 2–3 flat layers, like cut paper.
9. **Chart-safe:** each chart color gets its own pattern.
- **Done when:**
  - each style has a reference-image test;
  - a 12-megapixel photo renders in ≤ 4 s on the Mi A1;
  - Arindam picks his favorites from one printed style sheet.

### 6.6 Mystery Prints (M4)
One sheet, several separate prints. The sheet goes back in the tray each time (printed side up, top edge first). The next layer unlocks on the phone.
1. **Puzzle:** random tiles appear each print (gaps ≥ 5 mm, so a 3 mm shift doesn't matter).
2. **Polaroid:** the picture "develops" from light to dark across 3 prints. Uses drift correction from spike 03, plus soft-edged layers so small shifts don't show.
3. **Countdown:** one layer per day until a date (birthday, Diwali).
4. **Clue hunt:** answer a riddle on the phone to unlock the next layer.
5. **Secret message:** only with chunky blocks (≥ 8 mm), or dropped if spike 03 says alignment is too random.
- Maximum 4 passes per sheet (heat and paper curl; verified in spike 03).
- **Done when:** a 3-pass Polaroid and a 4-pass Puzzle both look right to a family member who didn't make them.

### 6.7 Big picture: poster tiling (M5)
- One picture spread over N × M A4 sheets.
- Each sheet gets 10 mm glue overlap, cut marks, a number, and a small assembly map.
- **Done when:** a 2 × 2 poster lines up within 1 mm after taping.

### 6.8 Fold-to-life: origami (M6)
- Starting templates:
  - **paper fortune teller** (kids' favorite);
  - **box/cube**;
  - **pop-up greeting card**.
- The art is mapped onto the faces you see after folding.
- Fold lines are marked (mountain = dash-dot, valley = dash).
- **Single-sided only** (the printer can't flip pages itself).
- **Done when:** a family member folds each template from the printed instructions alone.

### 6.9 Android app with Google scanning (M7)
- Wrap the same app; add ML Kit Document Scanner (edges, auto-capture, finger/stain removal, gallery import).
- One button: **Scan → Print**.
- Installed directly onto family phones.
- **Done when:** scan → print works end to end on the Mi A1.

### 6.10 AI (M8, later)
- AI line-art redraw, "living paper" (scan a printed sheet back in to continue it).
- **Rule:** only free options; the laptop's 4 GB graphics card is too small and too hot (failing fan) for image AI right now. We revisit when free on-device or cloud options are verified.

---

## 7. Build order (milestones)

| # | Milestone | Size (estimate) | Unblocks |
|---|---|---|---|
| S3 | **Spike 03:** re-feed repeatability (same sheet fed 3 times) | 15 min of Arindam's time | Mystery design |
| S4 | **Spike 04:** Mi A1 check: Chrome version, speed of one lens on an 8 MP image, Share-from-Drive into a test page | 20 min | Tech choices hold on the oldest phone |
| M0 | Foundation + printer tuning | 2–3 sessions | Everything |
| M1 | Magic Scan | 3–5 sessions | The family's main use |
| M2 | Ink Saver | 1–2 sessions | |
| M3 | Photo art styles | 2–3 sessions | |
| M4 | Mystery Prints | 2 sessions | |
| M5 | Poster tiling | 1 session | |
| M6 | Origami | 2–3 sessions | |
| M7 | Android app + ML Kit | 2–3 sessions (plus installing free Android build tools on D:) | |
| M8 | AI | later | |

A "session" is about 2–3 hours of AI work, ending in a save-point. These are estimates; each milestone ends with an after-action review (planned → happened → why different → keep/change) in `PROGRESS.md`.

---

## 8. Enterprise-grade quality bar (applies to every milestone)

1. **Tests:**
   - unit tests for every algorithm;
   - **reference-image tests** for every lens and layout (like Distill's golden set);
   - end-to-end tests in a phone-sized browser with the CPU slowed 4× (to act like the Mi A1);
   - a real-device check on the Mi A1 every milestone.
2. **Speed budgets (on the Mi A1):**
   - first open ≤ 3 s on 4G, instant after that;
   - one page or photo processed in ≤ 4 s;
   - memory ≤ 300 MB.
3. **Never crash:** bad, huge or odd files get a plain-language message and a way forward. Big images are scaled safely. Background work has a timeout.
4. **Privacy:**
   - no network use after install;
   - no analytics;
   - files stay on the phone;
   - "Clear history" button.
5. **Easy for everyone:** big buttons (≥ 48 dp), high contrast, readable text sizes, screen-reader labels, and plain words everywhere.
6. **Safe updates:** numbered versions and a changelog. The app asks before updating. Any release can be rolled back.
7. **Security:**
   - strict content rules (no outside scripts at runtime);
   - pinned dependencies with automatic security alerts.
8. **Automatic checks:** every change runs all tests on GitHub (free tier) before it reaches the family.
9. **Clean code:** small files, each with one job. Every fixed bug gets a test.

---

## 9. Risks and how we handle them

| Risk | Likelihood | Plan |
|---|---|---|
| Show-through removal not good enough on thin paper | Medium-high | Build it test-first on real worst-case pages. Fallback: an extra "strong clean" slider. |
| Mi A1 stuck on an old Chrome (Android 9) | Medium | Spike 04 checks first. The features we need are years old, so we expect it to be fine. |
| Re-feed shift is random (not repeatable) | Medium | Mystery designs already tolerate 3 mm. Polaroid gets soft-edged layers. Secret message is dropped if needed. |
| Drive changes its output | Low | Inkwell accepts any PDF or image; nothing depends on Drive internals. |
| Free hosting needs a public repo | Certain | Repo holds code only. No family data ever touches it. |
| Laptop heat during long test runs | Medium | Heavy test runs one at a time, short, with the heat guard habit from Distill. |

---

## 10. Out of scope (v1)

- iPhone support (no iPhones in the family).
- Windows virtual printer (product-only, cut).
- Color printing.
- Accounts, cloud sync, sharing between family phones.
- Curved book-page flattening (Drive handles most of it; revisit later).

---

## 11. Open questions for Arindam

| # | Question | My pick |
|---|---|---|
| Q1 | App name **Inkwell** OK? | yes |
| Q2 | Languages: English only, or also Hindi / Bengali? | English first, others in M2 |
| Q3 | OK for the **code** to sit in a public GitHub repo (needed for free hosting; no family data in it)? | yes |
| Q4 | Run spike 03 (re-feed one sheet 3 times) and spike 04 (Mi A1 check) before M0? | yes |
