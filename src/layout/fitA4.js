/** @typedef {import('../image/types.js').Gray} Gray */

/** Rotate 90 degrees clockwise. @param {Gray} g @returns {Gray} */
function rotateCW(g) {
  const { width: w, height: h } = g;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[x * h + (h - 1 - y)] = g.data[y * w + x];
  return { width: h, height: w, data };
}

/**
 * Fit a page onto portrait A4 (white background, centered, proportions kept).
 * Landscape inputs are turned upright first so they fill the sheet.
 * @param {Gray} src
 * @param {{dpi?: number, marginMm?: number}} [opts]
 * @returns {Gray}
 */
export function fitA4(src, { dpi = 300, marginMm = 5 } = {}) {
  const g = src.width > src.height ? rotateCW(src) : src;
  const W = Math.round((210 / 25.4) * dpi), H = Math.round((297 / 25.4) * dpi);
  const m = Math.round((marginMm / 25.4) * dpi);
  const s = Math.min((W - 2 * m) / g.width, (H - 2 * m) / g.height);
  const tw = Math.round(g.width * s), th = Math.round(g.height * s);
  const ox = Math.floor((W - tw) / 2), oy = Math.floor((H - th) / 2);
  const out = new Uint8Array(W * H).fill(255);
  // ponytail: plain bilinear; aliasing on >2x downscales, add box-filter pre-shrink if moiré shows on prints
  for (let y = 0; y < th; y++) {
    const sy = Math.min(g.height - 1, Math.max(0, (y + 0.5) / s - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(g.height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(g.width - 1, Math.max(0, (x + 0.5) / s - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(g.width - 1, x0 + 1), fx = sx - x0;
      const a = g.data[y0 * g.width + x0], b = g.data[y0 * g.width + x1];
      const c = g.data[y1 * g.width + x0], d = g.data[y1 * g.width + x1];
      out[(oy + y) * W + ox + x] = Math.round((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
    }
  }
  return { width: W, height: H, data: out };
}
