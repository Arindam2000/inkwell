import { InkwellError } from '../errors.js';
import { assemblePdf } from '../pdf/writePdf.js';
import { DPI } from '../pipeline/pipeline.js';
import { run } from '../pipeline/run.js';
import { batches, bookOrder, packPages, unpackPages } from '../print/book.js';
import { canPrintDirect, cleanupUpdate, installUpdate, onSharedFile, printDirect, scanWithCamera, sendFiles } from '../print/direct.js';
import { shrinkToHeight } from '../image/shrink.js';

/** @typedef {import('../image/types.js').Gray} Gray */
/** @typedef {import('../pipeline/run.js').Page} Page */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {'empty'|'working'|'ready'|'error'|'book-front'|'book-back'|'book-check'} state */
function show(state) {
  document.querySelectorAll('section[data-state]').forEach((s) => {
    /** @type {HTMLElement} */ (s).hidden = /** @type {HTMLElement} */ (s).dataset.state !== state;
  });
  $('home').hidden = state === 'empty';
  // Leaving the start screen adds one history step, so the phone's Back comes home instead of closing the app.
  if (state !== 'empty' && !history.state?.inner) history.pushState({ inner: true }, '');
}

/** Phone Back (or the Back button): close the big preview, else return to the start screen. */
function back() {
  if (!$('viewer').hidden) { $('viewer').hidden = true; history.pushState({ inner: true }, ''); return; }
  show('empty');
}

/** @param {Gray} g @param {string} [type] @returns {Promise<Blob>} */
async function toImage(g, type = 'image/png') {
  const c = new OffscreenCanvas(g.width, g.height);
  const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = ctx.createImageData(g.width, g.height);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i];
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c.convertToBlob({ type, quality: 0.92 });
}

/** @param {Gray} g @returns {Promise<string>} */
const toImageUrl = async (g) => URL.createObjectURL(await toImage(g));

/** The latest prepared pages (already compressed), ready for printing. */
let pages = /** @type {Page[]} */ ([]);
/** Pages the person tapped to leave out (indexes). */
const skipped = new Set();
let copies = 1;
/** The file(s) on screen, kept so a settings change can prepare them again. @type {Blob | Blob[] | null} */
let current = null;
const PREFS = 'inkwell-prefs';
/**
 * Print settings. Darkness, quality and ink saver are remembered; the rest start fresh.
 * @type {{tone: number, perSheet: 1|2|4, clean: 'auto'|'on'|'off', idCard: boolean, size: 'fit'|'actual',
 *   quality: 3|4|5, booklet: boolean, mini: 0|8|16, inkSaver: boolean}}
 */
const opts = { tone: 1, perSheet: 1, clean: 'auto', idCard: false, size: 'fit', quality: 5, booklet: false, mini: 0, inkSaver: false };
try {
  const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
  for (const k of /** @type {const} */ (['tone', 'quality', 'inkSaver'])) if (k in p) /** @type {any} */ (opts)[k] = p[k];
} catch { /* defaults */ }

/** The pages that will print, in order. */
const chosen = () => pages.filter((_, i) => !skipped.has(i));

function refresh() {
  const n = chosen().length;
  const plural = (/** @type {number} */ k, /** @type {string} */ w) => `${k} ${w}${k === 1 ? '' : 's'}`;
  $('copies').textContent = String(copies);
  const what = opts.mini ? `mini book: ${plural(n, 'side')}` : opts.booklet ? `booklet: ${plural(n, 'side')}` : opts.perSheet > 1 ? `${plural(n, 'sheet')} (${opts.perSheet} pages each)` : plural(n, 'page');
  $('summary').textContent = `${what}${copies > 1 ? ` × ${copies} copies` : ''} · ${plural(n * copies, 'sheet')}`;
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
    await printDirect(list, DPI, name, (n) => note(`Sending to the printer… page ${n} of ${list.length}`), opts.quality);
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

/** Skip or keep page n, and show it everywhere. @param {number} n */
function toggle(n) {
  skipped.has(n) ? skipped.delete(n) : skipped.add(n);
  document.querySelectorAll('#previews .pill')[n]?.setAttribute('aria-pressed', String(!skipped.has(n)));
  if (!$('viewer').hidden) view(n);
  refresh();
}

/** Unpack one prepared page back to pixels. @param {Page} p @returns {Promise<Gray>} */
async function pixels(p) {
  const stream = new Blob([/** @type {BlobPart} */ (p.bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return { width: p.width, height: p.height, data: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

let viewing = 0;
/** Full-screen preview of page n: exactly what will print. @param {number} n */
async function view(n) {
  viewing = (n + pages.length) % pages.length;
  const shown = viewing;
  $('viewer').hidden = false;
  $('viewer-cap').textContent = `Page ${shown + 1} of ${pages.length}${skipped.has(shown) ? ' · Skipped' : ''}`;
  $('v-skip').textContent = skipped.has(shown) ? 'Print this page' : 'Skip this page';
  const img = /** @type {HTMLImageElement} */ ($('viewer-img'));
  const url = await toImageUrl(shrinkToHeight(await pixels(pages[shown]), 1600));
  if (shown !== viewing) return URL.revokeObjectURL(url); // the person already moved on
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = url;
}

/**
 * Save the pages that will print, as one PDF or as JPEG pictures: through the Share menu (to Drive,
 * Files, WhatsApp) in the Android app, as downloads in Chrome. @param {'pdf'|'jpg'} kind
 */
async function save(kind) {
  const list = chosen();
  /** @type {{name: string, type: string, bytes: Uint8Array}[]} */
  const files = [];
  if (kind === 'pdf') files.push({ name: 'inkwell.pdf', type: 'application/pdf', bytes: assemblePdf(list, DPI) });
  else for (const [i, p] of list.entries()) {
    const jpg = await toImage(await pixels(p), 'image/jpeg');
    files.push({ name: `inkwell-${i + 1}.jpg`, type: 'image/jpeg', bytes: new Uint8Array(await jpg.arrayBuffer()) });
  }
  if (canPrintDirect()) return sendFiles(files);
  for (const f of files) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([/** @type {BlobPart} */ (f.bytes)], { type: f.type })), download: f.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }
}

/** @param {Blob | Blob[]} file @param {boolean} [idCard] front + back of a card, on one sheet */
export async function prepare(file, idCard = false) {
  // A setting changed on screen: stay put and update in place instead of a full "getting ready" screen.
  const again = file === current && !(/** @type {HTMLElement} */ (document.querySelector('section[data-state="ready"]'))).hidden;
  if (file !== current) copies = 1;
  current = file;
  opts.idCard = idCard;
  if (busy) { redo = true; return; } // taps while working: only the latest settings get prepared
  busy = true;
  const status = again ? $('summary') : $('progress');
  if (again) $('app').classList.add('busy'); else show('working');
  status.textContent = 'Getting it ready…';
  try {
    const res = await run(file, (done) => { status.textContent = `Getting it ready… page ${done}`; }, opts);
    pages = res.pages;
    skipped.clear();
    $('note').hidden = true;
    const box = $('previews');
    box.querySelectorAll('img').forEach((i) => URL.revokeObjectURL(i.src));
    box.replaceChildren();
    for (const [n, g] of res.previews.entries()) {
      const label = `${opts.booklet || opts.mini ? 'Side' : opts.perSheet > 1 ? 'Sheet' : 'Page'} ${n + 1} of ${res.previews.length}`;
      const fig = document.createElement('div');
      fig.className = 'page';
      const open = document.createElement('button');
      open.className = 'open';
      open.setAttribute('aria-label', `See ${label.toLowerCase()} big`);
      const img = document.createElement('img');
      img.className = 'preview';
      img.alt = '';
      img.src = await toImageUrl(g);
      const cap = document.createElement('span');
      cap.className = 'cap';
      cap.textContent = label;
      open.append(img, cap);
      open.addEventListener('click', () => view(n));
      const pill = document.createElement('button');
      pill.className = 'pill';
      pill.textContent = '✓';
      pill.setAttribute('aria-label', label);
      pill.setAttribute('aria-pressed', 'true');
      pill.addEventListener('click', () => toggle(n));
      fig.append(open, pill);
      box.append(fig);
    }
    refresh();
    $('toner').textContent = `Toner: ${Math.round(res.tonerPct)}%`;
    show('ready');
  } catch (e) {
    const err = e instanceof InkwellError ? e : new InkwellError('Something went wrong.', 'Try another file.');
    $('err-msg').textContent = err.message;
    $('err-hint').textContent = err.hint;
    show('error');
  } finally {
    $('app').classList.remove('busy');
    busy = false;
    if (redo) { redo = false; prepare(/** @type {Blob | Blob[]} */ (current), opts.idCard); }
  }
}
let busy = false, redo = false;

export function start() {
  const chrome = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? '?';
  $('about').textContent = `Inkwell v${__APP_VERSION__} · Chrome ${chrome}`;
  const input = /** @type {HTMLInputElement} */ ($('file'));
  const pick = () => { input.value = ''; input.click(); };
  $('choose').addEventListener('click', pick);
  $('again').addEventListener('click', pick);
  $('retry').addEventListener('click', () => show('empty'));
  // Back and Home: straight to the start screen, without waiting on the history (a quick next pick can't be undone).
  const home = () => { history.replaceState(null, ''); show('empty'); };
  $('back').addEventListener('click', home);
  $('home').addEventListener('click', home);
  addEventListener('popstate', back);
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    if (files.length) prepare(files.length === 1 ? files[0] : files);
  });
  $('fold-test').addEventListener('click', async () => prepare(await numbered(opts.mini || 8)));
  checkUpdate();

  $('print-hint').hidden = canPrintDirect();
  $('save-pdf').addEventListener('click', () => save('pdf'));
  $('save-img').addEventListener('click', () => save('jpg'));
  $('v-close').addEventListener('click', () => { $('viewer').hidden = true; });
  $('v-prev').addEventListener('click', () => view(viewing - 1));
  $('v-next').addEventListener('click', () => view(viewing + 1));
  $('v-skip').addEventListener('click', () => toggle(viewing));
  $('scan').hidden = !canPrintDirect();
  const idInput = /** @type {HTMLInputElement} */ ($('id-files'));
  $('idcard').addEventListener('click', async () => {
    if (!canPrintDirect()) { idInput.value = ''; idInput.click(); return; }
    note('Scan the front, then the back.');
    try {
      const scan = await scanWithCamera(2);
      if (scan) prepare(scan, true);
    } catch (e) {
      const err = /** @type {InkwellError} */ (e);
      note(`${err.message} ${err.hint}`);
    }
  });
  idInput.addEventListener('change', () => {
    const files = [...(idInput.files ?? [])].slice(0, 2);
    if (files.length) prepare(files.length === 1 ? files[0] : files, true);
  });
  $('scan').addEventListener('click', async () => {
    try {
      const scan = await scanWithCamera();
      if (scan) prepare(scan);
    } catch (e) {
      const err = /** @type {InkwellError} */ (e);
      note(`${err.message} ${err.hint}`);
    }
  });
  /** Show the chosen button in each group as pressed. */
  const mark = () => document.querySelectorAll('[data-opt]').forEach((b) => {
    const { opt = '', val = '' } = /** @type {HTMLElement} */ (b).dataset;
    b.setAttribute('aria-pressed', String(String(/** @type {any} */ (opts)[opt]) === val));
  });
  mark();
  document.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
    const { opt = '', val = '' } = /** @type {HTMLElement} */ (b).dataset;
    /** @type {any} */ (opts)[opt] = val === 'true' ? true : val === 'false' ? false : /^[\d.]+$/.test(val) ? Number(val) : val;
    if (opt === 'mini' && opts.mini) opts.booklet = false; // one way of folding at a time
    if (opt === 'booklet' && opts.booklet) opts.mini = 0;
    try { localStorage.setItem(PREFS, JSON.stringify({ tone: opts.tone, quality: opts.quality, inkSaver: opts.inkSaver })); } catch { /* fine */ }
    mark();
    if (opt !== 'quality' && current) prepare(current, opts.idCard); // previews always show exactly what will print
  }));
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

  (canPrintDirect() ? onSharedFile(prepare) : openShared()).then(async (opened) => {
    const at = opened ? false : await savedBook();
    if (at) showBook(at);
  });
}

/** Big page numbers, one per page: fold a test sheet before using real pages. @param {number} n */
async function numbered(n) {
  const pics = [];
  for (let i = 1; i <= n; i++) {
    const c = new OffscreenCanvas(1240, 1754);
    const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d'));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 700px sans-serif';
    ctx.fillText(String(i), 620, 1050);
    ctx.font = '90px sans-serif';
    ctx.fillText('top ↑', 620, 200);
    pics.push(await c.convertToBlob({ type: 'image/png' }));
  }
  if (!opts.mini) opts.mini = 8;
  opts.booklet = false;
  document.querySelectorAll('[data-opt="mini"]').forEach((b) => b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.val === String(opts.mini))));
  return pics;
}

/**
 * Android app only, quietly on every start: a newer version on GitHub shows an "Update" button.
 * Tapping it downloads the new app inside Inkwell (no Chrome), then Android asks once to install it
 * (it never lets an app update itself silently). The download is deleted on the next start.
 */
async function checkUpdate() {
  if (!canPrintDirect()) return; // the website updates by itself
  cleanupUpdate();
  try {
    const rel = await (await fetch('https://api.github.com/repos/Arindam2000/inkwell/releases/latest')).json();
    const latest = /v(\d+\.\d+\.\d+)/.exec(rel.name ?? '')?.[1];
    if (!latest || !newer(latest, __APP_VERSION__)) return;
    const b = /** @type {HTMLButtonElement} */ ($('update'));
    const ready = `Update to v${latest}`;
    b.textContent = ready;
    b.hidden = false;
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const res = await installUpdate((pct) => { b.textContent = pct < 0 ? 'Downloading…' : `Downloading… ${pct}%`; });
        b.textContent = ready;
        if (res.needsPermission) note('Turn on "Allow from this source" for Inkwell, come back, then tap Update again.');
      } catch {
        b.textContent = ready;
        note("Couldn't download the update. Check the Wi-Fi and tap Update again.");
      }
      b.disabled = false;
    });
  } catch { /* offline: try next time */ }
}

/** @param {string} a @param {string} b */
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

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
