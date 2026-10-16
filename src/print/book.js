/**
 * Book printing (both sides) on a printer that only prints one side.
 * Pass 1 prints the fronts (pages 1, 3, 5…). The person puts the stack back, blank side up,
 * and pass 2 prints the backs. An odd page count gets a blank back so every sheet goes through.
 * reverse: the printer stacks sheets face down, so the last front comes back on top and is fed first.
 * @param {number} n pages
 * @param {{reverse?: boolean}} [opts]
 * @returns {{front: number[], back: (number | null)[]}} page indexes (0-based); null = blank page
 */
export function bookOrder(n, { reverse = true } = {}) {
  const front = [];
  const back = [];
  for (let i = 0; i < n; i += 2) {
    front.push(i);
    back.push(i + 1 < n ? i + 1 : null);
  }
  if (reverse) back.reverse();
  return { front, back };
}

/** @typedef {{width: number, height: number, bytes: Uint8Array, rotate?: boolean}} Page */

/**
 * Pack the back pages into one blob, so step 2 survives the app closing.
 * Layout: 4-byte header length, JSON header, then each page's bytes.
 * @param {(Page | null)[]} pages @returns {Uint8Array}
 */
export function packPages(pages) {
  const head = new TextEncoder().encode(JSON.stringify(pages.map((p) => p && { w: p.width, h: p.height, n: p.bytes.length, r: !!p.rotate })));
  const out = new Uint8Array(4 + head.length + pages.reduce((s, p) => s + (p ? p.bytes.length : 0), 0));
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  let at = 4 + head.length;
  for (const p of pages) if (p) { out.set(p.bytes, at); at += p.bytes.length; }
  return out;
}

/** @param {Uint8Array} u @returns {(Page | null)[]} */
export function unpackPages(u) {
  const len = new DataView(u.buffer, u.byteOffset).getUint32(0);
  /** @type {({w: number, h: number, n: number, r: boolean} | null)[]} */
  const head = JSON.parse(new TextDecoder().decode(u.subarray(4, 4 + len)));
  let at = 4 + len;
  return head.map((m) => {
    if (!m) return null;
    const bytes = u.slice(at, at + m.n);
    at += m.n;
    return { width: m.w, height: m.h, bytes, rotate: m.r };
  });
}

/**
 * Split a book into batches of `size` pages (5 sheets by default), printed fronts-then-backs one batch
 * at a time. If the printer pulls two sheets at once, only that batch is lost, and it's easy to check.
 * Batches are even, so only the last one can need a blank back.
 * @param {number} n pages @param {number} [size] @returns {[number, number][]} [start, end) page indexes
 */
export function batches(n, size = 10) {
  const out = [];
  for (let i = 0; i < n; i += size) out.push(/** @type {[number, number]} */ ([i, Math.min(n, i + size)]));
  return out;
}
