import { Capacitor, registerPlugin } from '@capacitor/core';
import { InkwellError } from '../errors.js';
import { ippPrintJob, ippStatus } from './ipp.js';
import { urfHeader, urfPage } from './urf.js';

/** @typedef {{width: number, height: number, bytes: Uint8Array, rotate?: boolean}} Page */

/**
 * Native side (android/.../IppPlugin.java): finds printers on the Wi-Fi and sends the job.
 * Only the Android app has it; Chrome isn't allowed to talk to devices on the home network.
 * @type {any}
 */
const Ipp = registerPlugin('Ipp');

export const canPrintDirect = () => Capacitor.isNativePlatform();

/**
 * Android app only: Google's on-device document scanner (edges, crop, auto enhance, stain removal,
 * several pages). Returns the scan as one PDF, or null if the person backed out.
 * @param {number} [pages] most pages to scan
 * @returns {Promise<Blob | null>}
 */
export async function scanWithCamera(pages = 30) {
  const { DocumentScanner } = await import('@capacitor-mlkit/document-scanner');
  try {
    const { pdf } = await DocumentScanner.scanDocument({ scannerMode: 'FULL', resultFormats: 'PDF', galleryImportAllowed: true, pageLimit: pages });
    if (!pdf) return null;
    return await (await fetch(Capacitor.convertFileSrc(pdf.uri))).blob();
  } catch (e) {
    if (/cancel/i.test(String(/** @type {Error} */ (e).message))) return null;
    throw new InkwellError("The scanner didn't open.", 'Update Google Play services, or choose a photo instead.');
  }
}

/** Android app only: a file shared to Inkwell (android/.../SharedPlugin.java). @type {any} */
const Shared = registerPlugin('Shared');

/**
 * Android app only: give files to Android's Share menu (save to Drive/Files, or send).
 * @param {{name: string, type: string, bytes: Uint8Array}[]} files
 */
export async function sendFiles(files) {
  await Shared.send({ files: files.map((f) => ({ name: f.name, type: f.type, data: toB64(f.bytes) })) });
}

/**
 * Hand each file shared to the Android app to `open`: the one it was opened with, and any shared while it runs.
 * @param {(file: Blob) => unknown} open @param {(err: InkwellError) => void} [onError] a share that can't be read
 * @returns {Promise<boolean>} true if it was opened with a file
 */
export async function onSharedFile(open, onError = () => {}) {
  const take = async () => {
    try {
      const f = await Shared.take();
      if (!f.uri) return false;
      const blob = await (await fetch(Capacitor.convertFileSrc(f.uri))).blob();
      open(new Blob([blob], { type: f.type || blob.type }));
      return true;
    } catch {
      onError(new InkwellError("Couldn't open the shared file.", 'Try "Choose photos or PDFs" instead.'));
      return false;
    }
  };
  Shared.addListener('shared', take);
  return take();
}

/** @param {Uint8Array} bytes */
const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** @param {Uint8Array} bytes */
async function inflate(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @typedef {{name: string, host: string}} Printer */

/** Printers on this Wi-Fi (IPP / AirPrint / Mopria ones). @returns {Promise<Printer[]>} */
export async function findPrinters() {
  const { printers } = await Ipp.discover();
  return printers.map((/** @type {Printer} */ p) => ({ name: p.name, host: p.host }));
}

/**
 * Any printer at all: hand the PDF to Android's own print screen, which uses whatever print services the
 * phone has (Mopria, HP, Canon, USB…). @param {Uint8Array} pdf @param {string} name
 */
export const printWithAndroid = (pdf, name) => Ipp.systemPrint({ name, data: toB64(pdf) });

/** Android's Printing settings, where its print services (Default Print Service, Mopria…) are switched on. */
export const openPrintSettings = () => Ipp.openPrintSettings();

/**
 * Print pages straight to the printer: 600 dpi, high quality, true size, no print screen.
 * Pages are unpacked and sent one at a time, so memory stays flat.
 * ponytail: photo pages are ~35 MB raw at 600 dpi; switch to PCLm (flate strips) if big photo jobs feel slow.
 * @param {(Page | null)[]} pages null = blank page @param {number} dpi @param {string} name
 * @param {string} host the printer's address
 * @param {(done: number) => void} [onProgress] @param {3|4|5} [quality] 3 draft, 4 normal, 5 best
 */
export async function printDirect(pages, dpi, name, host, onProgress = () => {}, quality = 5) {
  const { id } = await Ipp.begin();
  const send = (/** @type {Uint8Array} */ b) => Ipp.append({ id, data: toB64(b) });
  const job = ippPrintJob(host, urfHeader(pages.length), name, quality);
  await send(job);
  const size = pages.find((p) => p) ?? { width: 2480, height: 3508 };
  for (const [i, p] of pages.entries()) {
    let data = p ? await inflate(p.bytes) : new Uint8Array(size.width * size.height).fill(255);
    if (p?.rotate) data = data.reverse(); // 180° turn = pixels in reverse order
    await send(urfPage({ width: p?.width ?? size.width, height: p?.height ?? size.height, data }, { srcDpi: dpi, quality }));
    onProgress(i + 1);
  }
  let reply;
  try {
    reply = await Ipp.finish({ id, url: `http://${host}:631/ipp/print` });
  } catch {
    throw new InkwellError("Couldn't reach the printer.", 'Check the phone is on the home Wi-Fi and the printer is on, then try again.');
  }
  const status = ippStatus(Uint8Array.from(atob(reply.data), (c) => c.charCodeAt(0)));
  if (status > 0xff) throw new InkwellError('The printer said no.', `Check it has paper and no error light (code ${status.toString(16)}).`);
}

/** Android app only: download a new version inside the app and open the installer (android/.../UpdatePlugin.java). @type {any} */
const Update = registerPlugin('Update');
const APK = 'https://github.com/Arindam2000/inkwell/releases/latest/download/inkwell.apk';

/** @param {string} version @param {(pct: number) => void} onProgress -1 when the size is unknown @returns {Promise<{needsPermission?: boolean}>} */
export async function installUpdate(version, onProgress) {
  const listener = await Update.addListener('progress', (/** @type {{pct: number}} */ e) => onProgress(e.pct));
  try { return await Update.install({ url: APK, version }); } finally { listener.remove(); }
}

/** Download a new version in the background (no installer yet), with progress. @param {string} version @param {(pct: number) => void} onProgress */
export async function prefetchUpdate(version, onProgress) {
  const listener = await Update.addListener('progress', (/** @type {{pct: number}} */ e) => onProgress(e.pct));
  try { await Update.prefetch({ url: APK, version }); } finally { listener.remove(); }
}

/** Delete a downloaded update (it's installed by now, or was cancelled). */
export const cleanupUpdate = () => Update.cleanup().catch(() => {});
