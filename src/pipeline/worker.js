import { HP_M126NW } from '../printer/profile.js';
import { Job } from './pipeline.js';

/** Thin message adapter: 'start' → settings, 'page' → processed preview (null while a 2-per-sheet pair waits), 'finish' → the PDF. */
let job = new Job(HP_M126NW);

self.onmessage = async (/** @type {MessageEvent} */ e) => {
  const msg = e.data;
  try {
    if (msg.type === 'start') {
      job = new Job(HP_M126NW, msg.opts);
      self.postMessage({ type: 'started' });
    } else if (msg.type === 'page') {
      const { preview } = await job.add(msg.gray);
      self.postMessage({ type: 'page', preview }, { transfer: preview ? [preview.data.buffer] : [] });
    } else if (msg.type === 'finish') {
      const last = await job.flush();
      const { pdf, pages, tonerPct } = job.finish();
      const preview = last?.preview ?? null;
      job = new Job(HP_M126NW);
      self.postMessage({ type: 'pdf', pdf, pages, tonerPct, preview }, { transfer: [pdf.buffer, ...pages.map((p) => p.bytes.buffer), ...(preview ? [preview.data.buffer] : [])] });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
