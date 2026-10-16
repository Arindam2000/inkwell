/** @typedef {import('../image/types.js').Gray} Gray */

const PRINTER_DPI = 600; // the M126nw only accepts 600 x 600

/**
 * Apple raster (URF), the picture format the printer takes over Wi-Fi: 8-bit gray, one-sided.
 * Built page by page (urfHeader, then urfPage for each), so a long job never sits in memory at once.
 * Pages made at a lower dpi are enlarged by repeating pixels, so sizes stay exact.
 * @param {Gray[]} pages @param {{srcDpi: number, quality?: 3|4|5}} opts quality 5 = high
 * @returns {Uint8Array}
 */
export function encodeUrf(pages, opts) {
  return join([urfHeader(pages.length), ...pages.map((g) => urfPage(g, opts))]);
}

/** @param {number} count pages in the job */
export function urfHeader(count) {
  const head = new Uint8Array(12);
  head.set(new TextEncoder().encode('UNIRAST'));
  new DataView(head.buffer).setUint32(8, count);
  return head;
}

/** @param {Gray} g @param {{srcDpi: number, quality?: 3|4|5}} opts */
export function urfPage(g, { srcDpi, quality = 5 }) {
  const k = PRINTER_DPI / srcDpi;
  const w = g.width * k;
  const ph = new Uint8Array(32);
  ph.set([8, 0, 1, quality]); // 8 bits, sGray, one-sided, quality
  const v = new DataView(ph.buffer);
  v.setUint32(12, w); v.setUint32(16, g.height * k); v.setUint32(20, PRINTER_DPI);
  /** @type {Uint8Array[]} */
  const parts = [ph];
  const row = new Uint8Array(w);
  let y = 0;
  while (y < g.height) {
    let same = 1; // identical source rows are sent once with a repeat count
    while (y + same < g.height && same * k < 256 && rowsEqual(g, y, y + same)) same++;
    const src = g.data.subarray(y * g.width, (y + 1) * g.width);
    for (let x = 0; x < w; x++) row[x] = src[Math.floor(x / k)];
    parts.push(new Uint8Array([same * k - 1]), packLine(row));
    y += same;
  }
  return join(parts);
}

/** @param {Uint8Array[]} parts */
function join(parts) {
  let size = 0;
  for (const p of parts) size += p.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** @param {Gray} g @param {number} a @param {number} b */
function rowsEqual(g, a, b) {
  const w = g.width;
  for (let x = 0; x < w; x++) if (g.data[a * w + x] !== g.data[b * w + x]) return false;
  return true;
}

/** PackBits per line: n < 128 = next pixel n+1 times; n > 128 = 257-n raw pixels follow. @param {Uint8Array} row */
function packLine(row) {
  const out = [];
  let i = 0;
  const n = row.length;
  while (i < n) {
    let j = i;
    while (j + 1 < n && row[j + 1] === row[i] && j - i < 127) j++;
    if (j > i) { out.push(j - i, row[i]); i = j + 1; continue; }
    j = i; // a stretch of differing pixels, stopping before the next run
    while (j + 1 < n && j - i < 127 && !(j + 2 < n && row[j + 1] === row[j + 2])) j++;
    const len = j - i + 1;
    if (len === 1) out.push(0, row[i]);
    else { out.push(257 - len); for (let x = i; x <= j; x++) out.push(row[x]); }
    i = j + 1;
  }
  return Uint8Array.from(out);
}
