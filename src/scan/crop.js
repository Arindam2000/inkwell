/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {[number, number]} Pt */

const SIDE = 400; // the page is found on a small copy, this many pixels on the long side

/**
 * Find the page's 4 corners (TL, TR, BR, BL) in a photo of a page lying on a darker surface.
 * Shrink, split bright from dark (Otsu), keep the biggest bright blob, then take its extreme corners.
 * Returns null when no convincing page is found (then the photo is used as it is).
 * @param {Gray} g @returns {Pt[] | null}
 */
export function findPage(g) {
  const k = Math.max(1, Math.ceil(Math.max(g.width, g.height) / SIDE));
  const w = Math.floor(g.width / k), h = Math.floor(g.height / k);
  const small = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) s += g.data[(y * k + yy) * g.width + x * k + xx];
    small[y * w + x] = s / (k * k);
  }
  // Two ways to see the page; keep whichever looks most like a filled four-sided shape:
  // 1. grow from the middle without crossing a sharp edge (crosses soft shadows, stops at the page border);
  // 2. everything brighter than the table (Otsu), for low-contrast borders.
  let best = null;
  for (const mask of [growInsideEdges(small, w, h), brightest(small, w, h)]) {
    const page = fillHoles(mask, w, h);
    const size = page.reduce((n, v) => n + v, 0);
    if (size < 0.35 * w * h || size > 0.97 * w * h) continue; // too small to be the page (a lit part of it?), or the page fills the photo
    const rough = extremes(page, w);
    const fill = size / Math.max(1, area(rough));
    if (fill > 0.9 && (!best || fill > best.fill)) best = { page, rough, fill };
  }
  if (!best) return null;
  const pixels = [];
  for (let i = 0; i < best.page.length; i++) if (best.page[i]) pixels.push(i);
  const quad = refine(best.rough, pixels, best.page, w, h) ?? best.rough;
  return /** @type {Pt[]} */ (quad.map(([x, y]) => [(x + 0.5) * k, (y + 0.5) * k]));
}

/**
 * Sharpen the corners: fit a straight line to each side's edge pixels (ignoring the rounded ends),
 * then intersect neighbouring sides. Extreme points alone drift on near-straight pages.
 * @param {Pt[]} q @param {number[]} pixels @param {Uint8Array} inPage 1 = page pixel @param {number} w @param {number} h
 * @returns {Pt[] | null}
 */
function refine(q, pixels, inPage, w, h) {
  /** @type {Pt[][]} */
  const sides = [[], [], [], []];
  for (const i of pixels) {
    const x = i % w, y = (i - x) / w;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !inPage[i - 1] || !inPage[i + 1] || !inPage[i - w] || !inPage[i + w];
    if (!edge) continue;
    let best = -1, bd = Infinity;
    for (let s = 0; s < 4; s++) {
      const [p, r] = [q[s], q[(s + 1) % 4]];
      const len = Math.hypot(r[0] - p[0], r[1] - p[1]) || 1;
      const along = ((x - p[0]) * (r[0] - p[0]) + (y - p[1]) * (r[1] - p[1])) / len / len;
      if (along < 0.1 || along > 0.9) continue; // corners are rounded by blur: skip the ends
      const d = Math.abs((x - p[0]) * (r[1] - p[1]) - (y - p[1]) * (r[0] - p[0])) / len;
      if (d < bd) { bd = d; best = s; }
    }
    if (best >= 0 && bd < 6) sides[best].push([x, y]);
  }
  if (sides.some((s) => s.length < 10)) return null;
  const lines = sides.map(fitLine);
  /** @type {Pt[]} */
  const out = [];
  for (let s = 0; s < 4; s++) {
    const p = cross(lines[(s + 3) % 4], lines[s]);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/** Best straight line through points (total least squares): a·x + b·y = c. @param {Pt[]} pts */
function fitLine(pts) {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy); // direction of the line
  const a = -Math.sin(angle), b = Math.cos(angle);
  return [a, b, a * mx + b * my];
}

/** Where two lines meet. @param {number[]} l1 @param {number[]} l2 @returns {Pt | null} */
function cross([a1, b1, c1], [a2, b2, c2]) {
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-6) return null;
  return [(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det];
}

/**
 * Pixels reachable from the middle without crossing a sharp edge (Sobel strength above EDGE).
 * A soft shadow has a weak edge; the page border has a strong one. @param {Uint8Array} a @param {number} w @param {number} h
 */
function growInsideEdges(a, w, h) {
  const EDGE = 160;
  const wall = new Uint8Array(a.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = a[i - w + 1] + 2 * a[i + 1] + a[i + w + 1] - a[i - w - 1] - 2 * a[i - 1] - a[i + w - 1];
    const gy = a[i + w - 1] + 2 * a[i + w] + a[i + w + 1] - a[i - w - 1] - 2 * a[i - w] - a[i - w + 1];
    if (Math.abs(gx) + Math.abs(gy) > EDGE) wall[i] = 1;
  }
  const m = flood(Math.floor(h / 2) * w + Math.floor(w / 2), (n) => !wall[n], w, h);
  // The border itself is a wall 2 pixels thick; grow by one so the outline sits on the real edge.
  const grown = m.slice();
  for (let i = 0; i < m.length; i++) if (!m[i] && (m[i - 1] || m[i + 1] || m[i - w] || m[i + w])) grown[i] = 1;
  return grown;
}

/** The biggest group of pixels brighter than the Otsu split. @param {Uint8Array} a @param {number} w @param {number} h */
function brightest(a, w, h) {
  const t = otsu(a);
  const blob = biggestBlob(a, w, h, t);
  const m = new Uint8Array(a.length);
  for (const i of blob.pixels) m[i] = 1;
  return m;
}

/** 4-connected flood from start over pixels where ok(n). @param {number} start @param {(n: number) => boolean} ok @param {number} w @param {number} h */
function flood(start, ok, w, h) {
  const m = new Uint8Array(w * h);
  if (!ok(start)) return m;
  const stack = [start];
  m[start] = 1;
  while (stack.length) {
    const i = /** @type {number} */ (stack.pop()), x = i % w;
    for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (n >= 0 && n < w * h && !m[n] && ok(n)) { m[n] = 1; stack.push(n); }
    }
  }
  return m;
}

/** Fill holes (text, stamps) so only the page outline counts: whatever the outside can't reach is page. @param {Uint8Array} m @param {number} w @param {number} h */
function fillHoles(m, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) for (const i of [x, (h - 1) * w + x]) if (!m[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
  for (let y = 0; y < h; y++) for (const i of [y * w, y * w + w - 1]) if (!m[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = /** @type {number} */ (stack.pop()), x = i % w;
    for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (n >= 0 && n < w * h && !m[n] && !outside[n]) { outside[n] = 1; stack.push(n); }
    }
  }
  return outside.map((v) => 1 - v);
}

/** Extreme points: TL, TR, BR, BL. @param {Uint8Array} m @param {number} w @returns {Pt[]} */
function extremes(m, w) {
  /** @type {Pt[]} */
  const q = [[0, 0], [0, 0], [0, 0], [0, 0]]; // TL TR BR BL
  let mn = Infinity, mx = -Infinity, md = -Infinity, nd = Infinity;
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    const x = i % w, y = (i - x) / w;
    if (x + y < mn) { mn = x + y; q[0] = [x, y]; }
    if (x - y > md) { md = x - y; q[1] = [x, y]; }
    if (x + y > mx) { mx = x + y; q[2] = [x, y]; }
    if (x - y < nd) { nd = x - y; q[3] = [x, y]; }
  }
  return q;
}

/** Area of a polygon (shoelace). @param {Pt[]} q */
function area(q) {
  let s = 0;
  for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
}

/** Otsu's threshold: the gray level that best splits the image into two groups. @param {Uint8Array} a */
function otsu(a) {
  const hist = new Float64Array(256);
  for (const v of a) hist[v]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB || wB === a.length) continue;
    sB += i * hist[i];
    const mB = sB / wB, mF = (sum - sB) / (a.length - wB);
    const between = wB * (a.length - wB) * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

/** Largest 4-connected group of pixels brighter than t. @param {Uint8Array} a @param {number} w @param {number} h @param {number} t */
function biggestBlob(a, w, h, t) {
  const seen = new Uint8Array(a.length);
  /** @type {number[]} */
  let best = [];
  for (let s = 0; s < a.length; s++) {
    if (seen[s] || a[s] <= t) continue;
    const pixels = [s];
    seen[s] = 1;
    for (let j = 0; j < pixels.length; j++) {
      const i = pixels[j], x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n >= 0 && n < a.length && !seen[n] && a[n] > t) { seen[n] = 1; pixels.push(n); }
      }
    }
    if (pixels.length > best.length) best = pixels;
  }
  return { pixels: best, size: best.length };
}

/**
 * Flatten the page inside quad (TL, TR, BR, BL) onto a w x h image: a perspective warp, bilinear sampling.
 * @param {Gray} g @param {Pt[]} quad @param {number} w @param {number} h @returns {Gray}
 */
export function warpPage(g, quad, w, h) {
  const m = homography([[0, 0], [w, 0], [w, h], [0, h]], quad);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x + 0.5, v = y + 0.5;
    const z = m[6] * u + m[7] * v + 1;
    const sx = Math.min(g.width - 1, Math.max(0, (m[0] * u + m[1] * v + m[2]) / z - 0.5));
    const sy = Math.min(g.height - 1, Math.max(0, (m[3] * u + m[4] * v + m[5]) / z - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(g.width - 1, x0 + 1), y1 = Math.min(g.height - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0, W = g.width, d = g.data;
    const a = d[y0 * W + x0], b = d[y0 * W + x1], c = d[y1 * W + x0], e = d[y1 * W + x1];
    out[y * w + x] = (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
  }
  return { width: w, height: h, data: out };
}

/** 3x3 perspective map (8 numbers, last = 1) sending each `from` point to its `to` point. @param {Pt[]} from @param {Pt[]} to */
export function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const m = new Array(8).fill(0);
  for (let r = 7; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < 8; k++) s -= A[r][k] * m[k];
    m[r] = s / A[r][r];
  }
  return m;
}

/**
 * Crop and flatten the page out of a photo, at its own resolution. A4-shaped pages (within 6%) are
 * snapped to exact A4 proportions. Returns null if no page is found.
 * @param {Gray} g @returns {Gray | null}
 */
export function cropPage(g) {
  const q = findPage(g);
  if (!q) return null;
  const d = (/** @type {Pt} */ a, /** @type {Pt} */ b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let w = Math.max(d(q[0], q[1]), d(q[3], q[2])), h = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const r = Math.max(w, h) / Math.min(w, h);
  if (Math.abs(r - Math.SQRT2) / Math.SQRT2 < 0.06) {
    if (h > w) h = w * Math.SQRT2; else w = h * Math.SQRT2;
  }
  return warpPage(g, q, Math.round(w), Math.round(h));
}
