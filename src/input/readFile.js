// Legacy build: polyfills newer JS (e.g. Uint8Array.toHex) that old Chrome on the Mi A1 lacks.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { InkwellError } from '../errors.js';
import { toGray } from '../image/gray.js';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/** @typedef {import('../image/types.js').Gray} Gray */

GlobalWorkerOptions.workerSrc = workerUrl;

const UNKNOWN = () => new InkwellError("Inkwell can't open this kind of file.", 'Share a photo or a PDF instead.');
const BAD_PDF = () => new InkwellError('This PDF is locked or damaged.', 'Open it in Drive, then share it again.');

/** @param {Blob} file @returns {Promise<'pdf'|'image'|null>} */
async function kind(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const s = String.fromCharCode(...head);
  if (s.startsWith('%PDF')) return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  if (s.startsWith('\xff\xd8\xff') || s.startsWith('\x89PNG') || s.slice(8, 12) === 'WEBP' || s.slice(4, 12).startsWith('ftyp')) return 'image';
  return null;
}

/** @param {CanvasImageSource} src @param {number} w @param {number} h @returns {Gray} */
function grayOf(src, w, h) {
  const c = new OffscreenCanvas(w, h);
  const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return toGray(ctx.getImageData(0, 0, w, h).data, w, h);
}

/**
 * Read a photo or PDF, one page at a time, as gray images.
 * Photos are turned upright (EXIF) and shrunk to at most maxPixels.
 * @param {Blob & {name?: string}} file
 * @param {{pdfDpi?: number, maxPixels?: number}} [opts]
 * @returns {AsyncGenerator<Gray>}
 */
export async function* readFile(file, { pdfDpi = 200, maxPixels = 24_000_000 } = {}) {
  const k = await kind(file);
  if (k === 'image') {
    let bmp;
    try {
      // ponytail: decodes full size before shrinking; peak memory = one full photo. Fine up to ~50 MP.
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw UNKNOWN();
    }
    const s = Math.min(1, Math.sqrt(maxPixels / (bmp.width * bmp.height)));
    const w = Math.floor(bmp.width * s), h = Math.floor(bmp.height * s);
    const g = grayOf(bmp, w, h);
    bmp.close();
    yield g;
    return;
  }
  if (k !== 'pdf') throw UNKNOWN();

  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    throw BAD_PDF();
  }
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: pdfDpi / 72 });
      const w = Math.floor(viewport.width), h = Math.floor(viewport.height);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
      yield toGray(ctx.getImageData(0, 0, w, h).data, w, h);
    }
  } finally {
    await task.destroy();
  }
}
