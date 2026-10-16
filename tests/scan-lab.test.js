// Scan test lab: scores Magic Scan against fake phone photos whose perfect answer is known.
// Cases come from `python scan-lab/make_lab.py` (git-ignored, deterministic). Skipped if not generated.
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { cleanScan } from '../src/scan/clean.js';
import { findPage, warpPage } from '../src/scan/crop.js';

const DIR = 'scan-lab/cases';
const load = (f) => {
  const b = inflateSync(readFileSync(`${DIR}/${f}`));
  return { width: b.readUInt32BE(0), height: b.readUInt32BE(4), data: new Uint8Array(b.buffer, b.byteOffset + 8, b.length - 8) };
};

/**
 * Paper that should be white (judged away from ink edges), and ink that should stay dark
 * (found within `slack` pixels, since a photo can't be flattened back to the exact pixel).
 */
function score(out, truth, slack) {
  const { width: w, height: h } = truth;
  let paper = 0, paperOk = 0, ink = 0, inkOk = 0;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x, t = truth.data[i];
    if (t === 255) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (truth.data[i + dy * w + dx] < 250) { near = true; break; }
      if (!near) { paper++; if (out.data[i] >= 240) paperOk++; }
    } else if (t <= 90) {
      ink++;
      let ok = false;
      for (let dy = -slack; dy <= slack && !ok; dy++) for (let dx = -slack; dx <= slack; dx++) if (out.data[i + dy * w + dx] <= 150) { ok = true; break; }
      if (ok) inkOk++;
    }
  }
  return { paperWhite: (100 * paperOk) / paper, inkKept: (100 * inkOk) / ink };
}

const cases = existsSync(`${DIR}/cases.json`) ? JSON.parse(readFileSync(`${DIR}/cases.json`, 'utf8')) : [];

test.skipIf(!cases.length)('scan lab scores', () => {
  const rows = [];
  for (const c of cases) {
    const truth = load(`${c.name}.truth.gz`);
    let input = load(`${c.name}.in.gz`);
    let cornerErr = 0;
    if (c.route === 'camera') {
      const want = JSON.parse(readFileSync(`${DIR}/${c.name}.corners.json`, 'utf8'));
      const quad = findPage(input);
      const diag = Math.hypot(input.width, input.height);
      cornerErr = quad ? Math.max(...quad.map(([x, y], k) => Math.hypot(x - want[k][0], y - want[k][1]))) / diag * 100 : 100;
      input = warpPage(input, quad ?? [[0, 0], [input.width, 0], [input.width, input.height], [0, input.height]], truth.width, truth.height);
    }
    const t0 = performance.now();
    const out = /** @type {any} */ (cleanScan(input));
    const ms = performance.now() - t0;
    rows.push({ name: c.name, ...score(out, truth, c.route === 'camera' ? 2 : 0), cornerErr, ms });
  }
  const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  const worst = (k, dir) => rows.reduce((a, r) => (dir * r[k] < dir * a[k] ? r : a));
  console.table(rows.map((r) => ({ case: r.name, paperWhite: r.paperWhite.toFixed(1), inkKept: r.inkKept.toFixed(1), cornerErrPct: r.cornerErr.toFixed(2), ms: Math.round(r.ms) })));
  console.log(`AVG paperWhite ${avg('paperWhite').toFixed(1)}  inkKept ${avg('inkKept').toFixed(1)}  cornerErr ${avg('cornerErr').toFixed(2)}%`);
  console.log(`WORST paper ${worst('paperWhite', 1).name}  ink ${worst('inkKept', 1).name}  corner ${worst('cornerErr', -1).name}`);
  // Ratchet: raise these as the cleanup improves; never lower them.
  const judged = rows.filter((r) => !KNOWN_LIMITS.includes(r.name));
  expect(Math.min(...judged.map((r) => r.paperWhite))).toBeGreaterThanOrEqual(LIMITS.paperWhite);
  expect(Math.min(...judged.map((r) => r.inkKept))).toBeGreaterThanOrEqual(LIMITS.inkKept);
  expect(Math.max(...judged.map((r) => r.cornerErr))).toBeLessThanOrEqual(LIMITS.cornerErr);
}, 300_000);

const LIMITS = { paperWhite: 98.5, inkKept: 90, cornerErr: 0.35 };
// Page edge invisible (dark page on a dark table, deep shadow): auto-crop must give up (keep the whole
// photo) rather than cut the page. The person drags the corners instead.
const KNOWN_LIMITS = ['h5-camera-darkroom'];
