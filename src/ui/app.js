import { InkwellError } from '../errors.js';
import { assemblePdf } from '../pdf/writePdf.js';
import { DPI } from '../pipeline/pipeline.js';
import { run } from '../pipeline/run.js';
import { batches, bookOrder, packPages, unpackPages } from '../print/book.js';
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
const BOOK_KEY = import.meta.env.BASE_URL + 'book';
const SETTINGS = 'inkwell-book';
const BATCH = 'inkwell-book-batch';

/** The book being printed (its chosen pages) and which batch we're on. Saved, so closing the app loses nothing. */
let book = /** @type {Page[]} */ ([]);
let batchNo = 0;

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

/** @param {number} b */
function setBatch(b) {
  batchNo = b;
}

/** Reload a book left half-printed when the app closed; returns the screen to reopen. @returns {Promise<false|'book-front'|'book-back'>} */
async function savedBook() {
  const res = await (await caches.open(SHARED)).match(BOOK_KEY);
  if (!res) return false;
  book = /** @type {Page[]} */ (unpackPages(new Uint8Array(await res.arrayBuffer())));
  try {
    const at = JSON.parse(localStorage.getItem(BATCH) || '{}');
    batchNo = at.b || 0;
    return at.screen === 'book-back' ? 'book-back' : 'book-front';
  } catch { batchNo = 0; return 'book-front'; }
}

async function endBook() {
  await (await caches.open(SHARED)).delete(BOOK_KEY);
  book = [];
}

/** This batch's pages, and its fronts and backs in printer order. */
function batchJob() {
  const [a, b] = batches(book.length)[batchNo];
  const part = book.slice(a, b);
  const { reverse, rotate } = bookSettings();
  const { front, back } = bookOrder(part.length, { reverse });
  return {
    a, b, sheets: front.length,
    front: front.map((i) => part[i]),
    back: back.map((i) => (i === null ? null : { ...part[i], rotate })),
  };
}

/** @param {'book-front'|'book-back'} screen */
function showBook(screen) {
  const total = batches(book.length).length;
  const { a, b, sheets } = batchJob();
  const label = total > 1 ? `Batch ${batchNo + 1} of ${total} · pages ${a + 1}–${b}` : '';
  $('bf-batch').textContent = label;
  $('bb-batch').textContent = label;
  $('bf-text').textContent = `Print the fronts (pages ${a + 1}, ${a + 3}…). It uses ${sheets} sheet${sheets > 1 ? 's' : ''}.`;
  $('bb-count').textContent = String(sheets);
  try { localStorage.setItem(BATCH, JSON.stringify({ b: batchNo, screen })); } catch { /* fine */ }
  show(screen);
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
  $('book').addEventListener('click', async () => {
    book = chosen();
    setBatch(0);
    await (await caches.open(SHARED)).put(BOOK_KEY, new Response(/** @type {BlobPart} */ (packPages(book))));
    showBook('book-front');
  });
  $('book-front').addEventListener('click', () => output(batchJob().front, 'inkwell-front'));
  $('book-next').addEventListener('click', () => showBook('book-back'));
  $('book-back').addEventListener('click', () => output(batchJob().back, 'inkwell-back'));
  $('book-done').addEventListener('click', () => show('book-check'));
  const leave = () => show(pages.length ? 'ready' : 'empty');
  const cancel = async () => { await endBook(); leave(); };
  $('book-cancel').addEventListener('click', cancel);
  $('book-cancel2').addEventListener('click', cancel);
  $('fix-ok').addEventListener('click', async () => {
    if (batchNo + 1 < batches(book.length).length) {
      setBatch(batchNo + 1);
      note('Next batch. Put fresh paper in the tray.');
      return showBook('book-front');
    }
    await endBook();
    note('Book done ✓');
    leave();
  });
  /** Something went wrong: maybe learn the printer's flip, then reprint only this batch. @param {'reverse'|'rotate'|null} key */
  const redo = (key) => {
    if (key) {
      const s = bookSettings();
      s[key] = !s[key];
      saveBookSettings(s);
    }
    note(`${key ? 'Got it, fixed for every book from now on. ' : ''}Reprint this batch on fresh paper.`);
    showBook('book-front');
  };
  $('fix-turn').addEventListener('click', () => redo('rotate'));
  $('fix-order').addEventListener('click', () => redo('reverse'));
  $('fix-mixed').addEventListener('click', () => redo(null));

  openShared().then(async (opened) => {
    const at = opened ? false : await savedBook();
    if (at) showBook(at);
  });
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
