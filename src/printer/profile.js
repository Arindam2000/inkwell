/** @typedef {import('../image/types.js').Gray} Gray */

/**
 * What the family's printer can and can't do, measured on paper.
 * curve: [input, output] pairs (0 = black, 1 = white). Lifts the darkest tones so they
 * don't merge into black, and keeps the lightest from vanishing.
 * Values: spike-01 estimate; replaced by spike-03 ramp readings.
 */
export const HP_M126NW = {
  name: 'HP LaserJet Pro MFP M126nw',
  dpi: 600,
  minDot: 2,
  curve: [[0, 0], [0.06, 0.22], [0.94, 0.86], [1, 1]],
  /** @type {{xMm: number, yMm: number} | null} */
  drift: null,
};

/**
 * Apply a piecewise-linear tone curve. Returns a new image.
 * @param {Gray} g @param {number[][]} curve @returns {Gray}
 */
export function applyCurve(g, curve) {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let k = 1;
    while (k < curve.length - 1 && curve[k][0] < x) k++;
    const [x0, y0] = curve[k - 1], [x1, y1] = curve[k];
    lut[i] = Math.round(255 * (y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)));
  }
  const data = new Uint8Array(g.data.length);
  for (let i = 0; i < data.length; i++) data[i] = lut[g.data[i]];
  return { width: g.width, height: g.height, data };
}
