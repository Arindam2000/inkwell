import { packPages, unpackPages } from '../print/book.js';

/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {import('../pipeline/run.js').Page} Page */
/** @typedef {{pages: Page[], previews: Gray[], tonerPct: number}} Result */

/**
 * Files already prepared, kept on the phone (Cache Storage) between uses: opening the same PDF again with
 * the same settings skips reading and clean-up entirely. The last 8 are kept; older ones are dropped.
 */
const STORE = 'inkwell-results';
const INDEX = 'inkwell-results-index';
const KEEP = 8;

/**
 * A fingerprint of the file(s): size plus a hash of the start and end (quick even for big PDFs).
 * @param {Blob | Blob[]} file @returns {Promise<string>}
 */
export async function fileKey(file) {
  const parts = [];
  for (const f of Array.isArray(file) ? file : [file]) {
    const bytes = new Uint8Array(await new Blob([f.slice(0, 262_144), f.slice(-65_536)]).arrayBuffer());
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
    parts.push(`${f.size}-${[...hash].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
  }
  return parts.join('+');
}

const url = (/** @type {string} */ key, /** @type {string} */ part) => `/remembered/${encodeURIComponent(key)}/${part}`;

/** The remembered result, or null. @param {string} key @returns {Promise<Result | null>} */
export async function recall(key) {
  try {
    const cache = await caches.open(STORE);
    const [p, v] = await Promise.all([cache.match(url(key, 'pages')), cache.match(url(key, 'previews'))]);
    if (!p || !v) return null;
    const pages = /** @type {Page[]} */ (unpackPages(new Uint8Array(await p.arrayBuffer())));
    const previews = unpackPages(new Uint8Array(await v.arrayBuffer())).map((g) => ({ width: g?.width ?? 0, height: g?.height ?? 0, data: g?.bytes ?? new Uint8Array() }));
    touch(key);
    return { pages, previews, tonerPct: Number(p.headers.get('x-toner')) || 0 };
  } catch { return null; }
}

/** Remember a result (quietly; a full phone just means it isn't remembered). @param {string} key @param {Result} res */
export async function keep(key, res) {
  try {
    const cache = await caches.open(STORE);
    const previews = res.previews.map((g) => ({ width: g.width, height: g.height, bytes: g.data }));
    await cache.put(url(key, 'pages'), new Response(/** @type {BlobPart} */ (packPages(res.pages)), { headers: { 'x-toner': String(res.tonerPct) } }));
    await cache.put(url(key, 'previews'), new Response(/** @type {BlobPart} */ (packPages(previews))));
    for (const old of touch(key)) {
      await cache.delete(url(old, 'pages'));
      await cache.delete(url(old, 'previews'));
    }
  } catch { /* not remembered */ }
}

/** Move `key` to the newest place; returns the keys that no longer fit. @param {string} key */
function touch(key) {
  /** @type {string[]} */
  let list = [];
  try { list = JSON.parse(localStorage.getItem(INDEX) || '[]'); } catch { /* start fresh */ }
  list = [...list.filter((k) => k !== key), key];
  const gone = list.slice(0, Math.max(0, list.length - KEEP));
  try { localStorage.setItem(INDEX, JSON.stringify(list.slice(-KEEP))); } catch { /* fine */ }
  return gone;
}
