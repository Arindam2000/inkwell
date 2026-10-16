import { InkwellError } from '../errors.js';
import { assemblePdf } from '../pdf/writePdf.js';
import { DPI } from '../pipeline/pipeline.js';
import { run } from '../pipeline/run.js';
import { bookOrder } from '../print/book.js';

/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {import('../pipeline/run.js').Page} Page */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {'empty'|'working'|'ready'|'error'|'book-front'|'book-back'|'book-check'} state */
function show(state) {
  document.querySelectorAll('section[data-state]').forEach((s) => {
    /** @type {HTMLElement} */ (s).hidden = /** @type {HTMLElement} */ (s).dataset.state !== state;
  });
}

/** @param {Gray} g @returns {Promise<string>} */
async function toImageUrl(g) {
  const c = new OffscreenCanvas(g.width, g.height);
  const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = ctx.createImageData(g.width, g.height);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i];
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return URL.createObjectURL(await c.convertToBlob({ type: 'image/png' }));
}

/** The latest prepared pages (already compressed), ready for printing. */
let pages = /** @type {Page[]} */ ([]);

const SHARED = 'inkwell-shared';
const BACK_KEY = import.meta.env.BASE_URL + 'book-back';
const SETTINGS = 'inkwell-book';

/** How this printer stacks and turns sheets; learned from the "how did it come out" question. */
function bookSettings() {
  try { return { reverse: true, rotate: false, ...JSON.parse(localStorage.getItem(SETTINGS) || '{}') }; } catch { return { reverse: true, rotate: false }; }
}
/** @param {{reverse: boolean, rotate: boolean}} s */
function saveBookSettings(s) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* private mode: just not remembered */ }
}

/**
 * Give the PDF to Android (share sheet → a print app). Falls back to a download.
 * @param {Uint8Array} bytes @param {string} name
 */
async function handOver(bytes, name) {
  const file = new File([/** @type {BlobPart} */ (bytes)], name, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) {
      if (/** @type {Error} */ (e).name === 'AbortError') return;
    }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/** Step 2 waits in storage, so closing the app between passes loses nothing. */
async function backPdf() {
  const res = await (await caches.open(SHARED)).match(BACK_KEY);
  return res ? new Uint8Array(await res.arrayBuffer()) : null;
}

async function endBook() {
  await (await caches.open(SHARED)).delete(BACK_KEY);
}

/** @param {string} text */
function note(text) {
  $('note').textContent = text;
  $('note').hidden = false;
}

/** @param {Blob} file */
export async function prepare(file) {
  show('working');
  $('progress').textContent = 'Getting it ready…';
  try {
    const res = await run(file, (done) => { $('progress').textContent = `Getting it ready… page ${done}`; });
    pages = res.pages;
    $('book').hidden = pages.length < 2;
    $('note').hidden = true;
    const box = $('previews');
    box.querySelectorAll('img').forEach((i) => URL.revokeObjectURL(i.src));
    box.replaceChildren();
    for (const [n, g] of res.previews.entries()) {
      const img = document.createElement('img');
      img.className = 'preview';
      img.alt = `Page ${n + 1} preview`;
      img.src = await toImageUrl(g);
      box.append(img);
    }
    $('toner').textContent = `Toner: ${Math.round(res.tonerPct)}%`;
    show('ready');
  } catch (e) {
    const err = e instanceof InkwellError ? e : new InkwellError('Something went wrong.', 'Try another file.');
    $('err-msg').textContent = err.message;
    $('err-hint').textContent = err.hint;
    show('error');
  }
}

export function start() {
  const chrome = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? '?';
  $('about').textContent = `Inkwell v${__APP_VERSION__} · Chrome ${chrome}`;
  const input = /** @type {HTMLInputElement} */ ($('file'));
  const pick = () => { input.value = ''; input.click(); };
  $('choose').addEventListener('click', pick);
  $('again').addEventListener('click', pick);
  $('retry').addEventListener('click', () => show('empty'));
  input.addEventListener('change', () => { if (input.files?.[0]) prepare(input.files[0]); });

  $('print').addEventListener('click', () => handOver(assemblePdf(pages, DPI), 'inkwell.pdf'));
  $('book').addEventListener('click', () => {
    const n = Math.ceil(pages.length / 2);
    $('sheets').textContent = `It uses ${n} sheet${n > 1 ? 's' : ''}.`;
    show('book-front');
  });
  $('book-front').addEventListener('click', () => {
    const { front } = bookOrder(pages.length, bookSettings());
    handOver(assemblePdf(front.map((i) => pages[i]), DPI), 'inkwell-front.pdf');
  });
  $('book-next').addEventListener('click', async () => {
    const { reverse, rotate } = bookSettings();
    const { back } = bookOrder(pages.length, { reverse });
    const pdf = assemblePdf(back.map((i) => (i === null ? null : { ...pages[i], rotate })), DPI);
    await (await caches.open(SHARED)).put(BACK_KEY, new Response(/** @type {BlobPart} */ (pdf)));
    show('book-back');
  });
  $('book-back').addEventListener('click', async () => {
    const pdf = await backPdf();
    if (pdf) handOver(pdf, 'inkwell-back.pdf');
  });
  $('book-done').addEventListener('click', async () => { await endBook(); show('book-check'); });
  const cancel = async () => { await endBook(); show(pages.length ? 'ready' : 'empty'); };
  $('book-cancel').addEventListener('click', cancel);
  $('book-cancel2').addEventListener('click', cancel);
  $('fix-ok').addEventListener('click', () => {
    note('Great. Book printing is set up for this printer.');
    show(pages.length ? 'ready' : 'empty');
  });
  /** @param {'reverse'|'rotate'} key */
  const fix = (key) => {
    const s = bookSettings();
    s[key] = !s[key];
    saveBookSettings(s);
    note('Got it. Your next book print will come out right.');
    show(pages.length ? 'ready' : 'empty');
  };
  $('fix-turn').addEventListener('click', () => fix('rotate'));
  $('fix-order').addEventListener('click', () => fix('reverse'));

  openShared().then(async (opened) => { if (!opened && await backPdf()) show('book-back'); });
}

/** A file shared from Drive/WhatsApp arrives via the service worker; open it once, then forget it. */
async function openShared() {
  if (new URLSearchParams(location.search).get('shared') !== '1') return false;
  history.replaceState(null, '', location.pathname);
  const cache = await caches.open('inkwell-shared');
  const key = import.meta.env.BASE_URL + 'shared-file';
  const res = await cache.match(key);
  if (!res) return false;
  const blob = await res.blob();
  await cache.delete(key);
  await prepare(blob);
  return true;
}
