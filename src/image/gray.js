/** @typedef {import('./types.js').Gray} Gray */

/**
 * RGBA pixels -> gray using Rec. 709 weights on the sRGB values.
 * @param {Uint8ClampedArray} rgba @param {number} width @param {number} height
 * @returns {Gray}
 */
export function toGray(rgba, width, height) {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = Math.round(0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]);
  }
  return { width, height, data };
}

/** Percent of the page covered by toner (0-100). @param {Gray} g */
export function toner(g) {
  let sum = 0;
  for (let i = 0; i < g.data.length; i++) sum += g.data[i];
  return 100 * (1 - sum / g.data.length / 255);
}
