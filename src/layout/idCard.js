/** @typedef {import('../image/types.js').Gray} Gray */

const DPI = 300;
const mm = (/** @type {number} */ v) => Math.round((v / 25.4) * DPI);
const CW = mm(85.6), CH = mm(54); // ID-1 card size (Aadhaar, PAN, bank cards)

/**
 * ID card mode: front and back of a card on one A4 sheet, each at its real size, with dashed cut lines.
 * Cards photographed upright are turned sideways first. The card is stretched to exactly fill its
 * box, since a cropped card photo is already the card's shape.
 * @param {Gray} front @param {Gray | null} back @returns {Gray}
 */
export function idCardSheet(front, back) {
  const W = mm(210), H = mm(297);
  const out = new Uint8Array(W * H).fill(255);
  const x0 = Math.round((W - CW) / 2), top = mm(25), gap = mm(15);
  [front, back].forEach((c, k) => {
    if (!c) return;
    const g = c.height > c.width ? turn(c) : c;
    const y0 = top + k * (CH + gap);
    for (let y = 0; y < CH; y++) {
      const sy = Math.min(g.height - 1, Math.floor(((y + 0.5) * g.height) / CH));
      for (let x = 0; x < CW; x++) {
        const sx = Math.min(g.width - 1, Math.floor(((x + 0.5) * g.width) / CW));
        out[(y0 + y) * W + x0 + x] = g.data[sy * g.width + sx];
      }
    }
    cutLine(out, W, x0 - mm(1.5), y0 - mm(1.5), CW + mm(3), CH + mm(3));
  });
  return { width: W, height: H, data: out };
}

/** Rotate 90° counter-clockwise. @param {Gray} g @returns {Gray} */
function turn(g) {
  const { width: w, height: h } = g;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(w - 1 - x) * h + y] = g.data[y * w + x];
  return { width: h, height: w, data };
}

/** Light dashed rectangle to cut along. @param {Uint8Array} a @param {number} W @param {number} x @param {number} y @param {number} w @param {number} h */
function cutLine(a, W, x, y, w, h) {
  const dash = (/** @type {number} */ i) => Math.floor(i / mm(2)) % 2 === 0;
  for (let i = 0; i < w; i++) if (dash(i)) { a[y * W + x + i] = 120; a[(y + h) * W + x + i] = 120; }
  for (let i = 0; i < h; i++) if (dash(i)) { a[(y + i) * W + x] = 120; a[(y + i) * W + x + w] = 120; }
}
