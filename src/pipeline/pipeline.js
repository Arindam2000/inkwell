import { toner } from '../image/gray.js';
import { shrinkToHeight } from '../image/shrink.js';
import { fitA4 } from '../layout/fitA4.js';
import { assemblePdf, compressPage } from '../pdf/writePdf.js';
import { applyCurve } from '../printer/profile.js';

/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {typeof import('../printer/profile.js').HP_M126NW} Profile */

export const DPI = 300;
export const PREVIEW_HEIGHT = 600;

/** One page: printer tuning, then fit to A4. @param {Gray} g @param {Profile} profile */
export function processPage(g, profile) {
  return fitA4(applyCurve(g, profile.curve), { dpi: DPI });
}

/** Collects pages one at a time; full-size pixels are dropped as soon as each page is compressed. */
export class Job {
  /** @param {Profile} profile */
  constructor(profile) {
    this.profile = profile;
    /** @type {{width: number, height: number, bytes: Uint8Array}[]} */
    this.pages = [];
    this.tonerSum = 0;
  }

  /** @param {Gray} g @returns {Promise<{preview: Gray, tonerPct: number}>} */
  async add(g) {
    const page = processPage(g, this.profile);
    const tonerPct = toner(page);
    this.tonerSum += tonerPct;
    this.pages.push(await compressPage(page));
    return { preview: shrinkToHeight(page, PREVIEW_HEIGHT), tonerPct };
  }

  finish() {
    return { pdf: assemblePdf(this.pages, DPI), tonerPct: this.tonerSum / Math.max(1, this.pages.length) };
  }
}

/**
 * Process every page in order: the next page is read only after the previous one is done.
 * @param {AsyncIterable<Gray>} pages @param {Profile} profile
 * @param {(done: number) => void} onProgress
 */
export async function processAll(pages, profile, onProgress) {
  const job = new Job(profile);
  /** @type {Gray[]} */
  const previews = [];
  for await (const g of pages) {
    previews.push((await job.add(g)).preview);
    onProgress(previews.length);
  }
  return { ...job.finish(), previews };
}
