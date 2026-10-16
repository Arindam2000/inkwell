# Progress

## Spike 03: re-feed + gray ramp (2026-10-16)
Source: Arindam's scan `Scanned_20261016-1249.pdf` + his eye readings.

**Gray ramp (HP M126nw):**
- Dark end: boxes 0-3 look alike; first box apart from black = **4** (4/31 = 0.13).
- Light end: 26-31 look like white; last box apart from white = **25** (25/31 = 0.81).
- Scan shows 21-24 as sandy speckle: the printer's halftone breaks up in the lightest grays.
- Profile curve now `[[0,0],[0.06,0.13],[0.94,0.81],[1,1]]`.

**Re-feed drift (mm, read from scan; X + = right, Y + = down):**
| Block | Pass 2 X / Y | Pass 3 X / Y |
|---|---|---|
| A top-right | ~0 / ~0 | ~-2 / ~+1 |
| B bottom-left | ~0 / ~0 | ~-5 / ~0 |
| C bottom-right | ~0 / ~0 | ~-5 / ~+1.5 |

- Pass 2 landed almost exactly; pass 3 slid 2-5 mm left and slightly skewed (bottom moved more than top). The "P3" label is ~4 mm left of "P2".
- **Not repeatable** -> `drift: null`. Spec risk row applies: multi-pass designs must tolerate ~5 mm, not 3; Secret message stays a maybe for M2.

## Spike 05: direct print over Wi-Fi (2026-10-16)
- Printer IPP answer: formats `image/urf`, `application/PCLm`, `image/jpeg`; 600x600 only; quality 3/4/5; margins 4 mm; one-sided; output face-down.
- Laptop sent a 600 dpi 8-bit URF ruler page via IPP Print-Job (quality 5): printer status successful-ok. Ruler measurement: pending.
- A Chrome PWA on https can't reach `http://192.168.x.x:631` (mixed content + CORS), so direct print needs an Android app shell.

## Android app on ASUS ROG Phone 5s (2026-10-16)
- Arindam installed the v0.4.0 APK and tested: direct print works end to end ("all works well").
- Still to test: Mi A1 (Android 9) and Realme 3 Pro.

## Road to v1.0 (agreed plan, 2026-10-16)
1. **Feels finished:** Share from Drive/WhatsApp into the Android app; Inkwell icon; fixed signing key (updates install over the old app); test on Mi A1 + Realme 3 Pro.
2. **Paper savers:** 2 pages per sheet; lighter/darker.
3. **Camera scan:** scan in the app with magic crop + auto enhance (no Drive upload).
4. **v1.0:** fresh independent review, fixes, scorecard check, tag v1.0.
