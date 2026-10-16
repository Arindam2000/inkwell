/** @typedef {import('../image/types.js').Gray} Gray */

const enc = new TextEncoder();

/** @param {Uint8Array} bytes */
async function deflate(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Wrap gray pages into a PDF, one page each, sized width/dpi x height/dpi inches.
 * Lossless (Flate) and /Interpolate false, so printed dots are exactly ours.
 * @param {Gray[]} pages
 * @param {number} dpi
 * @returns {Promise<Uint8Array>}
 */
export async function writePdf(pages, dpi) {
  /** @type {(Uint8Array|string)[][]} */
  const objs = [];
  const kids = [];
  objs.push(['<< /Type /Catalog /Pages 2 0 R >>']);
  objs.push([]); // pages tree, filled below
  for (const p of pages) {
    const w = ((p.width / dpi) * 72).toFixed(2);
    const h = ((p.height / dpi) * 72).toFixed(2);
    const pageId = objs.length + 1;
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    const data = await deflate(p.data);
    kids.push(`${pageId} 0 R`);
    objs.push([`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${pageId + 1} 0 R >> >> /Contents ${pageId + 2} 0 R >>`]);
    objs.push([`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, data, '\nendstream']);
    objs.push([`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  }
  objs[1] = [`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`];

  /** @type {Uint8Array[]} */
  const parts = [enc.encode('%PDF-1.4\n')];
  let size = parts[0].length;
  /** @type {number[]} */
  const offsets = [];
  const add = (/** @type {Uint8Array|string} */ x) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    size += b.length;
  };
  objs.forEach((o, i) => {
    offsets.push(size);
    add(`${i + 1} 0 obj\n`);
    o.forEach(add);
    add('\nendobj\n');
  });
  const xref = size;
  add(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join(''));
  add(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}
