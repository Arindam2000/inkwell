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
const HOST_KEY = 'inkwell-printer';

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
 * Hand each file shared to the Android app to `open`: the one it was opened with, and any shared while it runs.
 * @param {(file: Blob) => unknown} open @returns {Promise<boolean>} true if it was opened with a file
 */
export async function onSharedFile(open) {
  const take = async () => {
    const f = await Shared.take();
    if (!f.data) return false;
    open(new Blob([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], { type: f.type || '' }));
    return true;
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

/** The remembered printer, or the first one found on the Wi-Fi. */
async function printerHost() {
  let host = null;
  try { host = localStorage.getItem(HOST_KEY); } catch { /* not remembered */ }
  if (host) return host;
  const { printers } = await Ipp.discover();
  if (!printers.length) throw new InkwellError("Can't find the printer.", 'Check the phone is on the home Wi-Fi and the printer is on.');
  host = printers[0].host;
  try { localStorage.setItem(HOST_KEY, /** @type {string} */ (host)); } catch { /* fine */ }
  return host;
}

/**
 * Print pages straight to the printer: 600 dpi, high quality, true size, no print screen.
 * Pages are unpacked and sent one at a time, so memory stays flat.
 * ponytail: photo pages are ~35 MB raw at 600 dpi; switch to PCLm (flate strips) if big photo jobs feel slow.
 * @param {(Page | null)[]} pages null = blank page @param {number} dpi @param {string} name
 * @param {(done: number) => void} [onProgress]
 */
export async function printDirect(pages, dpi, name, onProgress = () => {}) {
  const host = await printerHost();
  const { id } = await Ipp.begin();
  const send = (/** @type {Uint8Array} */ b) => Ipp.append({ id, data: toB64(b) });
  const job = ippPrintJob(host, urfHeader(pages.length), name);
  await send(job);
  const size = pages.find((p) => p) ?? { width: 2480, height: 3508 };
  for (const [i, p] of pages.entries()) {
    let data = p ? await inflate(p.bytes) : new Uint8Array(size.width * size.height).fill(255);
    if (p?.rotate) data = data.reverse(); // 180° turn = pixels in reverse order
    await send(urfPage({ width: p?.width ?? size.width, height: p?.height ?? size.height, data }, { srcDpi: dpi }));
    onProgress(i + 1);
  }
  let reply;
  try {
    reply = await Ipp.finish({ id, url: `http://${host}:631/ipp/print` });
  } catch {
    try { localStorage.removeItem(HOST_KEY); } catch { /* fine */ }
    throw new InkwellError("Couldn't reach the printer.", 'Check the phone is on the home Wi-Fi and the printer is on, then try again.');
  }
  const status = ippStatus(Uint8Array.from(atob(reply.data), (c) => c.charCodeAt(0)));
  if (status > 0xff) throw new InkwellError('The printer said no.', `Check it has paper and no error light (code ${status.toString(16)}).`);
}
