import { InkwellError } from '../errors.js';
import { run } from '../pipeline/run.js';

/** @typedef {import('../image/types.js').Gray} Gray */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {'empty'|'working'|'ready'|'error'} state */
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

/** The latest prepared PDF, ready for printing (W3). */
export let lastPdf = /** @type {Uint8Array | null} */ (null);

/** @param {Blob} file */
export async function prepare(file) {
  show('working');
  $('progress').textContent = 'Getting it ready…';
  try {
    const res = await run(file, (done) => { $('progress').textContent = `Getting it ready… page ${done}`; });
    lastPdf = res.pdf;
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
  const input = /** @type {HTMLInputElement} */ ($('file'));
  const pick = () => { input.value = ''; input.click(); };
  $('choose').addEventListener('click', pick);
  $('again').addEventListener('click', pick);
  $('retry').addEventListener('click', () => show('empty'));
  input.addEventListener('change', () => { if (input.files?.[0]) prepare(input.files[0]); });
}
