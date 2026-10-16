import { InkwellError } from '../errors.js';
import { readFile } from '../input/readFile.js';

/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {{width: number, height: number, bytes: Uint8Array}} Page */

const PAGE_TIMEOUT_MS = 20_000;
const TOO_SLOW = () => new InkwellError('This took too long.', 'Try a smaller photo or fewer pages.');
const BROKE = () => new InkwellError('Something went wrong while preparing the print.', 'Try again, or try another file.');

/**
 * Prepare a file for printing in a background worker, so the screen never freezes.
 * @param {Blob} file
 * @param {(done: number, total: number | null) => void} onProgress
 * @returns {Promise<{pdf: Uint8Array, pages: Page[], previews: Gray[], tonerPct: number}>}
 */
export async function run(file, onProgress) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  /** @param {any} msg @param {Transferable[]} transfer */
  const ask = (msg, transfer) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(TOO_SLOW()), PAGE_TIMEOUT_MS);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      e.data.type === 'error' ? reject(BROKE()) : resolve(e.data);
    };
    worker.onerror = () => { clearTimeout(timer); reject(BROKE()); };
    worker.postMessage(msg, transfer);
  });
  try {
    /** @type {Gray[]} */
    const previews = [];
    for await (const gray of readFile(file)) {
      const r = /** @type {{preview: Gray}} */ (await ask({ type: 'page', gray }, [gray.data.buffer]));
      previews.push(r.preview);
      onProgress(previews.length, null);
    }
    const done = /** @type {{pdf: Uint8Array, pages: Page[], tonerPct: number}} */ (await ask({ type: 'finish' }, []));
    return { pdf: done.pdf, pages: done.pages, previews, tonerPct: done.tonerPct };
  } finally {
    worker.terminate();
  }
}
