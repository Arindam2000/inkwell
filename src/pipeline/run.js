import { InkwellError } from '../errors.js';
import { readFile } from '../input/readFile.js';

/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {{width: number, height: number, bytes: Uint8Array}} Page */

const PAGE_TIMEOUT_MS = 20_000;
const TOO_SLOW = () => new InkwellError('This took too long.', 'Try a smaller photo or fewer pages.');
const BROKE = () => new InkwellError('Something went wrong while preparing the print.', 'Try again, or try another file.');

/** The worker stays between runs, holding the last file's cleaned pages. */
let worker = /** @type {Worker | null} */ (null);
/** What the worker holds: which file(s), cleaned which way, how many pages. */
let held = { file: /** @type {Blob | Blob[] | null} */ (null), key: '', pages: 0 };

/**
 * Prepare a file for printing in a background worker, so the screen never freezes.
 * The same file again with only quick settings changed (darkness, size, layout) skips reading and clean-up.
 * @param {Blob | Blob[]} file one file, or several read one after another (ID card front + back)
 * @param {(done: number, total: number | null) => void} onProgress
 * @param {import('./pipeline.js').Options} [opts] lighter/darker, pages per sheet
 * @returns {Promise<{pdf: Uint8Array, pages: Page[], previews: Gray[], tonerPct: number}>}
 */
export async function run(file, onProgress, opts = {}) {
  const key = opts.idCard ? 'card' : opts.clean ?? 'auto';
  const reuse = !!worker && held.file === file && held.key === key;
  const w = (worker ??= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
  /** @param {any} msg @param {Transferable[]} transfer */
  const ask = (msg, transfer) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(TOO_SLOW()), PAGE_TIMEOUT_MS);
    w.onmessage = (e) => {
      clearTimeout(timer);
      e.data.type === 'error' ? reject(BROKE()) : resolve(e.data);
    };
    w.onerror = () => { clearTimeout(timer); reject(BROKE()); };
    w.postMessage(msg, transfer);
  });
  try {
    /** @type {Gray[]} */
    const previews = [];
    held.file = null; // until this run finishes, the worker's pages can't be trusted
    await ask({ type: 'start', opts, reuse }, []);
    let read = 0;
    /** @param {any} msg @param {Transferable[]} transfer */
    const page = async (msg, transfer) => {
      const r = /** @type {{preview: Gray | null}} */ (await ask(msg, transfer));
      if (r.preview) previews.push(r.preview);
      onProgress(++read, null);
    };
    if (reuse) for (let index = 0; index < held.pages; index++) await page({ type: 'again', index }, []);
    else for (const f of Array.isArray(file) ? file : [file]) for await (const gray of readFile(f)) await page({ type: 'page', gray }, [gray.data.buffer]);
    const done = /** @type {{pdf: Uint8Array, pages: Page[], tonerPct: number, previews: Gray[]}} */ (await ask({ type: 'finish' }, []));
    previews.push(...done.previews);
    held = { file, key, pages: read };
    return { pdf: done.pdf, pages: done.pages, previews, tonerPct: done.tonerPct };
  } catch (e) {
    w.terminate(); // a stuck or broken worker starts fresh next time
    worker = null;
    throw e;
  }
}
