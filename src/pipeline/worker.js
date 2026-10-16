import { HP_M126NW } from '../printer/profile.js';
import { compressPage } from '../pdf/writePdf.js';
import { Job, prepPage } from './pipeline.js';

/**
 * Thin message adapter: 'start' → settings, 'page' → processed preview (null while a 2-per-sheet pair waits),
 * 'again' → the same page from memory with new settings, 'finish' → the PDF.
 * Cleaned-up pages are kept (compressed), so changing darkness, size or layout skips reading and clean-up.
 */
let job = new Job(HP_M126NW);
/** @type {{width: number, height: number, bytes: Uint8Array, photo?: boolean, dpi?: number}[]} */
let kept = [];

/** @param {{width: number, height: number, bytes: Uint8Array}} p */
async function unpack(p) {
  const stream = new Blob([/** @type {BlobPart} */ (p.bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

self.onmessage = async (/** @type {MessageEvent} */ e) => {
  const msg = e.data;
  try {
    if (msg.type === 'start') {
      job = new Job(HP_M126NW, msg.opts);
      if (!msg.reuse) kept = [];
      self.postMessage({ type: 'started' });
    } else if (msg.type === 'page' || msg.type === 'again') {
      let g;
      if (msg.type === 'again') {
        const k = kept[msg.index];
        g = { width: k.width, height: k.height, data: await unpack(k), photo: k.photo, dpi: k.dpi };
      } else {
        // ID cards keep the photo as it came (they crop it themselves); everything else keeps the cleaned page.
        g = job.opts.idCard ? msg.gray : prepPage(msg.gray, job.opts.clean);
        kept.push({ ...(await compressPage(g)), photo: g.photo, dpi: g.dpi });
      }
      const { preview } = await job.add(g, !job.opts.idCard);
      self.postMessage({ type: 'page', preview }, { transfer: preview ? [preview.data.buffer] : [] });
    } else if (msg.type === 'finish') {
      const previews = await job.flush();
      const { pdf, pages, tonerPct } = job.finish();
      job = new Job(HP_M126NW);
      self.postMessage({ type: 'pdf', pdf, pages, tonerPct, previews }, { transfer: [pdf.buffer, ...pages.map((p) => p.bytes.buffer), ...previews.map((p) => p.data.buffer)] });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
