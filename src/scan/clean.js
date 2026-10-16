/** @typedef {import('../image/types.js').Gray} Gray */

// Calibration knobs (tuned on the scan lab, then checked on real prints).
const WHITE = 0.8; // after flattening, anything lighter than 80% of the paper becomes pure white
const BLACK = 0.3; // anything darker than 30% becomes solid black
const STEP = 4; // the paper-brightness map is built at 1/8 size
const DOC_WHITE = 0.6; // auto: it's a document if at least 60% turns to clean paper

/**
 * Magic Scan cleanup for a scanned or photographed page:
 * 1. flatten uneven light and shadows (divide by the paper's own brightness),
 * 2. paper -> pure white (also removes faint show-through and gray tint), ink -> crisp black,
 * 3. remove tiny specks.
 * With force = false (auto), pages that don't look like documents (mostly paper) are left alone
 * and null is returned, so family photos never get bleached.
 * @param {Gray} g @param {{force?: boolean}} [opts] @returns {Gray | null}
 */
export function cleanScan(g, { force = true } = {}) {
  const bg = paperMap(g);
  const { width: w, height: h } = g;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const flat = g.data[i] / Math.max(bg[i], 1);
    const v = (flat - BLACK) / (WHITE - BLACK);
    out[i] = v >= 1 ? 255 : v <= 0 ? 0 : Math.round(v * 255);
  }
  if (!force) {
    let white = 0;
    for (let i = 0; i < out.length; i += 7) if (out[i] === 255) white++;
    if (white / (out.length / 7) < DOC_WHITE) return null;
  }
  despeckle(out, w, h);
  return { width: w, height: h, data: out };
}

/**
 * Paper brightness at every pixel: shrink, take the local maximum (text disappears, paper stays),
 * smooth, then enlarge again. @param {Gray} g @returns {Uint8Array}
 */
function paperMap(g) {
  const { width: w, height: h } = g;
  const sw = Math.ceil(w / STEP), sh = Math.ceil(h / STEP);
  let small = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let m = 0;
    for (let yy = y * STEP; yy < Math.min(h, y * STEP + STEP); yy++) for (let xx = x * STEP; xx < Math.min(w, x * STEP + STEP); xx++) {
      const v = g.data[yy * w + xx];
      if (v > m) m = v;
    }
    small[y * sw + x] = m;
  }
  // Closing (max, then min of the same size): text disappears, but a shadow's edge stays where it is.
  small = minFilter(maxFilter(small, sw, sh, 6), sw, sh, 6);
  fillNonPaper(small, sw, sh);
  small = boxFilter(small, sw, sh, 3);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) / STEP - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) / STEP - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), fx = sx - x0;
      const a = small[y0 * sw + x0], b = small[y0 * sw + x1], c = small[y1 * sw + x0], d = small[y1 * sw + x1];
      out[y * w + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    }
  }
  return out;
}

/**
 * Big dark areas (photos, black boxes) aren't paper, even though the max filter can't see past them.
 * A cell much darker than the brightest paper around it (shadows change slowly, photos don't)
 * gets the paper level of its neighbours instead. @param {Uint8Array} a @param {number} w @param {number} h
 */
function fillNonPaper(a, w, h) {
  const around = maxFilter(a, w, h, 20);
  const bad = new Uint8Array(a.length);
  let todo = 0;
  for (let i = 0; i < a.length; i++) if (a[i] < 0.8 * around[i]) { bad[i] = 1; todo++; }
  // Grow paper inwards, one ring per pass.
  for (let pass = 0; todo && pass < w + h; pass++) {
    const next = bad.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bad[i]) continue;
      let s = 0, n = 0;
      if (x > 0 && !bad[i - 1]) { s += a[i - 1]; n++; }
      if (x < w - 1 && !bad[i + 1]) { s += a[i + 1]; n++; }
      if (y > 0 && !bad[i - w]) { s += a[i - w]; n++; }
      if (y < h - 1 && !bad[i + w]) { s += a[i + w]; n++; }
      if (n) { a[i] = s / n; next[i] = 0; todo--; }
    }
    bad.set(next);
  }
}

/** Separable max over a (2r+1) square. @param {Uint8Array} a @param {number} w @param {number} h @param {number} r */
function maxFilter(a, w, h, r) {
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, a[y * w + k]);
    t[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, t[k * w + x]);
    o[y * w + x] = m;
  }
  return o;
}

/** Separable min over a (2r+1) square: the max filter of the inverted image. @param {Uint8Array} a @param {number} w @param {number} h @param {number} r */
function minFilter(a, w, h, r) {
  const inv = a.map((v) => 255 - v);
  return maxFilter(inv, w, h, r).map((v) => 255 - v);
}

/** Separable mean over a (2r+1) square. @param {Uint8Array} a @param {number} w @param {number} h @param {number} r */
function boxFilter(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { s += a[y * w + k]; n++; }
    t[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { s += t[k * w + x]; n++; }
    o[y * w + x] = Math.round(s / n);
  }
  return o;
}

/** Dark pixels with almost no dark neighbours are dust, not ink: make them white. @param {Uint8Array} a @param {number} w @param {number} h */
function despeckle(a, w, h) {
  const dark = (/** @type {number} */ i) => a[i] < 160;
  /** @type {number[]} */
  const kill = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x;
    if (!dark(i)) continue;
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dark(i + dy * w + dx)) n++;
    if (n <= 4) kill.push(i); // a speck of up to 2x2 pixels, alone in a 5x5 window
  }
  for (const i of kill) a[i] = 255;
}
