import { HP_M126NW } from '../printer/profile.js';
import { Job } from './pipeline.js';

/** Thin message adapter: 'page' → processed preview, 'finish' → the PDF. */
let job = new Job(HP_M126NW);

self.onmessage = async (/** @type {MessageEvent} */ e) => {
  const msg = e.data;
  try {
    if (msg.type === 'page') {
      const { preview, tonerPct } = await job.add(msg.gray);
      self.postMessage({ type: 'page', preview, tonerPct }, { transfer: [preview.data.buffer] });
    } else if (msg.type === 'finish') {
      const { pdf, tonerPct } = job.finish();
      job = new Job(HP_M126NW);
      self.postMessage({ type: 'pdf', pdf, tonerPct }, { transfer: [pdf.buffer] });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
