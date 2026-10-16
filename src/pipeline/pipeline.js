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

export const DPI = 300;
export const PREVIEW_HEIGHT = 600;

/**
 * @typedef {{tone?: number, perSheet?: 1|2, clean?: 'auto'|'on'|'off', idCard?: boolean}} Options
 * tone: 1 normal, < 1 lighter, > 1 darker. clean: Magic Scan cleanup (auto = documents only, photos untouched).
 * idCard: pages are the front and back of a card, printed together at real size.
 */

/** One page: lighter/darker, printer tuning, then fit to A4. @param {Gray} g @param {Profile} profile @param {Options} [opts] */
export function processPage(g, profile, { tone = 1, clean = 'auto' } = {}) {
  g = scan(g, clean);
  const toned = tone === 1 ? g : applyCurve(g, Array.from({ length: 17 }, (_, i) => [i / 16, (i / 16) ** tone]));
  return fitA4(applyCurve(toned, profile.curve), { dpi: DPI });
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

/** Two A4 pages side by side, then turned and shrunk onto one A4 sheet: page 1 on top. @param {Gray} a @param {Gray | null} b */
function twoUp(a, b) {
  const W = a.width * 2, H = a.height;
  const data = new Uint8Array(W * H).fill(255);
  for (let y = 0; y < H; y++) {
    data.set(a.data.subarray(y * a.width, (y + 1) * a.width), y * W);
    if (b) data.set(b.data.subarray(y * b.width, (y + 1) * b.width), y * W + a.width);
  }
  return fitA4({ width: W, height: H, data }, { dpi: DPI });
}

/** Collects pages one at a time; full-size pixels are dropped as soon as each page is compressed. */
export class Job {
  /** @param {Profile} profile @param {Options} [opts] */
  constructor(profile, opts = {}) {
    this.profile = profile;
    this.opts = opts;
    /** @type {Gray | null} first half of a 2-per-sheet pair */
    this.pending = null;
    /** @type {{width: number, height: number, bytes: Uint8Array}[]} */
    this.pages = [];
    this.tonerSum = 0;
  }

  /** A finished page or sheet; with 2 per sheet, the first of each pair waits (no preview yet). @param {Gray} g */
  async add(g) {
    if (this.opts.idCard) return this.addCard(g);
    const page = processPage(g, this.profile, this.opts);
    if (this.opts.perSheet !== 2) return this.keep(page);
    if (!this.pending) { this.pending = page; return { preview: null, tonerPct: 0 }; }
    const sheet = twoUp(this.pending, page);
    this.pending = null;
    return this.keep(sheet);
  }

  /** ID card: crop the card out of a photo, keep its picture as it is (no paper clean-up), pair front + back. @param {Gray} g */
  async addCard(g) {
    const { tone = 1 } = this.opts;
    const c = (g.photo && cropPage(g)) || g;
    const toned = tone === 1 ? c : applyCurve(c, Array.from({ length: 17 }, (_, i) => [i / 16, (i / 16) ** tone]));
    const card = applyCurve(toned, this.profile.curve);
    if (!this.pending) { this.pending = card; return { preview: null, tonerPct: 0 }; }
    const sheet = idCardSheet(this.pending, card);
    this.pending = null;
    return this.keep(sheet);
  }

  /** Any leftover odd page shares its sheet with a blank (ID card: a front with no back). */
  async flush() {
    if (!this.pending) return null;
    const sheet = this.opts.idCard ? idCardSheet(this.pending, null) : twoUp(this.pending, null);
    this.pending = null;
    return this.keep(sheet);
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
  const last = await job.flush();
  if (last?.preview) previews.push(last.preview);
  return { ...job.finish(), previews };
}
