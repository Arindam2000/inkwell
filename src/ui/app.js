import { InkwellError } from '../errors.js';
import { assemblePdf } from '../pdf/writePdf.js';
import { DPI } from '../pipeline/pipeline.js';
import { run } from '../pipeline/run.js';
import { bookOrder, packPages, unpackPages } from '../print/book.js';
import { canPrintDirect, printDirect } from '../print/direct.js';

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
/** Pages the person tapped to leave out (indexes). */
const skipped = new Set();
let copies = 1;

/** The pages that will print, in order. */
const chosen = () => pages.filter((_, i) => !skipped.has(i));

function refresh() {
  const n = chosen().length;
  const plural = (/** @type {number} */ k, /** @type {string} */ w) => `${k} ${w}${k === 1 ? '' : 's'}`;
  $('copies').textContent = String(copies);
  $('summary').textContent = `${plural(n, 'page')}${copies > 1 ? ` × ${copies} copies` : ''} · ${plural(n * copies, 'sheet')}`;
  $('book').hidden = n < 2;
  /** @type {HTMLButtonElement} */ ($('print')).disabled = n === 0;
}

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

/**
 * Print: in the Android app, straight to the printer; in Chrome, hand a PDF to a print app.
 * @param {(Page & {rotate?: boolean} | null)[]} list @param {string} name
 */
async function output(list, name) {
  if (!canPrintDirect()) return handOver(assemblePdf(list, DPI), `${name}.pdf`);
  try {
    note('Sending to the printer…');
    await printDirect(list, DPI, name, (n) => note(`Sending to the printer… page ${n} of ${list.length}`));
    note('Printing ✓');
  } catch (e) {
    const err = e instanceof InkwellError ? e : new InkwellError("Couldn't print.", 'Try again.');
    note(`${err.message} ${err.hint}`);
  }
}

/** Step 2 waits in storage, so closing the app between passes loses nothing. */
async function backPages() {
  const res = await (await caches.open(SHARED)).match(BACK_KEY);
  return res ? unpackPages(new Uint8Array(await res.arrayBuffer())) : null;
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
    skipped.clear();
    copies = 1;
    $('note').hidden = true;
    const box = $('previews');
    box.querySelectorAll('img').forEach((i) => URL.revokeObjectURL(i.src));
    box.replaceChildren();
    for (const [n, g] of res.previews.entries()) {
      const btn = document.createElement('button');
      btn.className = 'page';
      btn.setAttribute('aria-pressed', 'true');
      const img = document.createElement('img');
      img.className = 'preview';
      img.alt = '';
      img.src = await toImageUrl(g);
      const cap = document.createElement('span');
      cap.className = 'cap';
      cap.textContent = `Page ${n + 1} of ${res.previews.length}`;
      btn.append(img, cap);
      btn.addEventListener('click', () => {
        skipped.has(n) ? skipped.delete(n) : skipped.add(n);
        btn.setAttribute('aria-pressed', String(!skipped.has(n)));
        refresh();
      });
      box.append(btn);
    }
    refresh();
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

  $('print-hint').hidden = canPrintDirect();
  $('minus').addEventListener('click', () => { copies = Math.max(1, copies - 1); refresh(); });
  $('plus').addEventListener('click', () => { copies = Math.min(20, copies + 1); refresh(); });
  $('print').addEventListener('click', () => output(Array.from({ length: copies }, chosen).flat(), 'inkwell'));
  $('book').addEventListener('click', () => {
    const n = Math.ceil(chosen().length / 2);
    $('sheets').textContent = `It uses ${n} sheet${n > 1 ? 's' : ''}.`;
    show('book-front');
  });
  $('book-front').addEventListener('click', () => {
    const { front } = bookOrder(chosen().length, bookSettings());
    output(front.map((i) => chosen()[i]), 'inkwell-front');
  });
  $('book-next').addEventListener('click', async () => {
    const { reverse, rotate } = bookSettings();
    const { back } = bookOrder(chosen().length, { reverse });
    const packed = packPages(back.map((i) => (i === null ? null : { ...chosen()[i], rotate })));
    await (await caches.open(SHARED)).put(BACK_KEY, new Response(/** @type {BlobPart} */ (packed)));
    show('book-back');
  });
  $('book-back').addEventListener('click', async () => {
    const back = await backPages();
    if (back) output(back, 'inkwell-back');
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

  openShared().then(async (opened) => { if (!opened && await backPages()) show('book-back'); });
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
