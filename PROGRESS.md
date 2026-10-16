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
