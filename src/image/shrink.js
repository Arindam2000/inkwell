/** @typedef {import('./types.js').Gray} Gray */

/**
 * Box-average shrink to a given height (for previews). Never enlarges.
 * @param {Gray} g @param {number} height @returns {Gray}
 */
export function shrinkToHeight(g, height) {
  const s = Math.min(1, height / g.height);
  const W = Math.max(1, Math.round(g.width * s)), H = Math.max(1, Math.round(g.height * s));
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor((y * g.height) / H), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * g.height) / H));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor((x * g.width) / W), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * g.width) / W));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += g.data[yy * g.width + xx];
      data[y * W + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return { width: W, height: H, data };
}
