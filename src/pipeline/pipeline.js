import { toner } from '../image/gray.js';
import { shrinkToHeight } from '../image/shrink.js';
import { fitA4 } from '../layout/fitA4.js';
import { assemblePdf, compressPage } from '../pdf/writePdf.js';
import { applyCurve } from '../printer/profile.js';
import { cleanScan } from '../scan/clean.js';
import { cropPage } from '../scan/crop.js';
import { idCardSheet } from '../layout/idCard.js';

/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {typeof import('../printer/profile.js').HP_M126NW} Profile */
/** @typedef {{width: number, height: number, bytes: Uint8Array}} Packed */

export const DPI = 300;
export const PREVIEW_HEIGHT = 600;

/**
 * @typedef {{tone?: number, perSheet?: 1|2|4, clean?: 'auto'|'on'|'off', idCard?: boolean,
 *   size?: 'fit'|'actual', booklet?: boolean, inkSaver?: boolean}} Options
 * tone: 1 normal, < 1 lighter, > 1 darker. clean: Magic Scan cleanup (auto = documents only, photos untouched).
 * idCard: pages are the front and back of a card, printed together at real size.
 * size: fit the A4 sheet, or print at the page's true size (PDFs). booklet: A5 booklet to fold in half.
 * inkSaver: dark pages (night-mode screenshots) flip to light.
 */

/** One page: clean-up, ink saver, lighter/darker, printer tuning, then onto A4. @param {Gray} g @param {Profile} profile @param {Options} [opts] */
export function processPage(g, profile, { tone = 1, clean = 'auto', size = 'fit', inkSaver = false } = {}) {
  const actualDpi = size === 'actual' && g.dpi ? g.dpi : 0;
  g = scan(g, clean);
  if (inkSaver) g = flipIfDark(g);
  const toned = tone === 1 ? g : applyCurve(g, Array.from({ length: 17 }, (_, i) => [i / 16, (i / 16) ** tone]));
  return fitA4(applyCurve(toned, profile.curve), { dpi: DPI, actualDpi });
}

/**
 * Magic Scan: a photo gets its page cropped out, then shadows flattened and paper made white.
 * In auto mode, anything that isn't a document is returned exactly as it came.
 * @param {Gray} g @param {'auto'|'on'|'off'} mode @returns {Gray}
 */
function scan(g, mode) {
  if (mode === 'off') return g;
  const page = (g.photo && cropPage(g)) || g;
  return cleanScan(page, { force: mode === 'on' }) ?? g;
}

/** Ink saver: a mostly dark page (dark-mode screenshot) prints as its light version. @param {Gray} g */
export function flipIfDark(g) {
  let sum = 0;
  for (let i = 0; i < g.data.length; i += 3) sum += g.data[i];
  if (sum / Math.ceil(g.data.length / 3) >= 100) return g;
  return { ...g, data: g.data.map((v) => 255 - v) };
}

/**
 * Several A4 pages on one A4 sheet: 2 = side by side then turned (page 1 on top), 4 = a 2 x 2 grid.
 * @param {(Gray | null)[]} list @param {2|4} n
 */
function nUp(list, n) {
  const pw = list.find((p) => p)?.width ?? 2480, ph = list.find((p) => p)?.height ?? 3508;
  const cols = 2, rows = n === 4 ? 2 : 1;
  const W = pw * cols, H = ph * rows;
  const data = new Uint8Array(W * H).fill(255);
  list.forEach((p, k) => {
    if (!p) return;
    const ox = (k % cols) * pw, oy = Math.floor(k / cols) * ph;
    for (let y = 0; y < p.height; y++) data.set(p.data.subarray(y * p.width, (y + 1) * p.width), (oy + y) * W + ox);
  });
  return fitA4({ width: W, height: H, data }, { dpi: DPI });
}

/** @param {Packed} p @returns {Promise<Gray>} */
async function unpack(p) {
  const stream = new Blob([/** @type {BlobPart} */ (p.bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return { width: p.width, height: p.height, data: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

/**
 * Booklet order: pages padded to a multiple of 4, then for each sheet the outside (last, first)
 * and the inside (second, second-to-last). Printed both sides and folded, it reads 1, 2, 3…
 * @param {number} n pages @returns {[number | null, number | null][]} sides, each [left, right]; null = blank
 */
export function bookletSides(n) {
  const N = Math.ceil(n / 4) * 4;
  const at = (/** @type {number} */ i) => (i < n ? i : null);
  /** @type {[number | null, number | null][]} */
  const sides = [];
  for (let s = 0; s < N / 4; s++) {
    sides.push([at(N - 1 - 2 * s), at(2 * s)]);
    sides.push([at(2 * s + 1), at(N - 2 - 2 * s)]);
  }
  return sides;
}

/** Collects pages one at a time; full-size pixels are dropped as soon as each page is compressed. */
export class Job {
  /** @param {Profile} profile @param {Options} [opts] */
  constructor(profile, opts = {}) {
    this.profile = profile;
    this.opts = opts;
    /** @type {Gray[]} pages waiting to share a sheet */
    this.pending = [];
    /** @type {Packed[]} booklet: every page, kept until the order is known */
    this.held = [];
    /** @type {Packed[]} */
    this.pages = [];
    this.tonerSum = 0;
  }

  /** A finished page or sheet, or no preview yet while pages wait to share a sheet. @param {Gray} g */
  async add(g) {
    if (this.opts.idCard) return this.addCard(g);
    const page = processPage(g, this.profile, this.opts);
    if (this.opts.booklet) { this.held.push(await compressPage(page)); return { preview: null, tonerPct: 0 }; }
    const n = this.opts.perSheet ?? 1;
    if (n === 1) return this.keep(page);
    this.pending.push(page);
    if (this.pending.length < n) return { preview: null, tonerPct: 0 };
    const sheet = nUp(this.pending, /** @type {2|4} */ (n));
    this.pending = [];
    return this.keep(sheet);
  }

  /** ID card: crop the card out of a photo, keep its picture as it is (no paper clean-up), pair front + back. @param {Gray} g */
  async addCard(g) {
    const { tone = 1 } = this.opts;
    const c = (g.photo && cropPage(g)) || g;
    const toned = tone === 1 ? c : applyCurve(c, Array.from({ length: 17 }, (_, i) => [i / 16, (i / 16) ** tone]));
    const card = applyCurve(toned, this.profile.curve);
    if (!this.pending.length) { this.pending.push(card); return { preview: null, tonerPct: 0 }; }
    const sheet = idCardSheet(this.pending[0], card);
    this.pending = [];
    return this.keep(sheet);
  }

  /** Finish what's waiting: a part-filled sheet, a card with no back, or the whole booklet. @returns {Promise<Gray[]>} previews */
  async flush() {
    /** @type {Gray[]} */
    const previews = [];
    if (this.opts.booklet) {
      for (const side of bookletSides(this.held.length)) {
        const [l, r] = await Promise.all(side.map((i) => (i === null ? null : unpack(this.held[i]))));
        previews.push(/** @type {Gray} */ ((await this.keep(nUp([l, r], 2))).preview));
      }
      this.held = [];
    } else if (this.pending.length) {
      const sheet = this.opts.idCard ? idCardSheet(this.pending[0], null) : nUp(this.pending, /** @type {2|4} */ (this.opts.perSheet));
      previews.push(/** @type {Gray} */ ((await this.keep(sheet)).preview));
    }
    this.pending = [];
    return previews;
  }

  /** @param {Gray} page @returns {Promise<{preview: Gray | null, tonerPct: number}>} */
  async keep(page) {
    const tonerPct = toner(page);
    this.tonerSum += tonerPct;
    this.pages.push(await compressPage(page));
    return { preview: shrinkToHeight(page, PREVIEW_HEIGHT), tonerPct };
  }

  finish() {
    return { pdf: assemblePdf(this.pages, DPI), pages: this.pages, tonerPct: this.tonerSum / Math.max(1, this.pages.length) };
  }
}

/**
 * Process every page in order: the next page is read only after the previous one is done.
 * @param {AsyncIterable<Gray>} pages @param {Profile} profile
 * @param {(done: number) => void} onProgress @param {Options} [opts]
 */
export async function processAll(pages, profile, onProgress, opts = {}) {
  const job = new Job(profile, opts);
  /** @type {Gray[]} */
  const previews = [];
  let done = 0;
  for await (const g of pages) {
    const { preview } = await job.add(g);
    if (preview) previews.push(preview);
    onProgress(++done);
  }
  previews.push(...(await job.flush()));
  return { ...job.finish(), previews };
}
