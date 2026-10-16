import { expect, test } from 'vitest';
import { encodeUrf } from '../../src/print/urf.js';
import { ippPrintJob, ippStatus } from '../../src/print/ipp.js';

/** Reference decoder (Apple raster / PWG packbits). Returns pages of {width, height, dpi, data}. */
function decode(u) {
  expect(new TextDecoder().decode(u.slice(0, 7))).toBe('UNIRAST');
  const v = new DataView(u.buffer, u.byteOffset);
  const n = v.getUint32(8);
  let p = 12;
  const pages = [];
  for (let k = 0; k < n; k++) {
    const [bpp, , duplex, quality] = u.slice(p, p + 4);
    const width = v.getUint32(p + 12), height = v.getUint32(p + 16), dpi = v.getUint32(p + 20);
    p += 32;
    const data = new Uint8Array(width * height);
    let y = 0;
    while (y < height) {
      const rep = u[p++] + 1;
      const row = new Uint8Array(width);
      let x = 0;
      while (x < width) {
        const c = u[p++];
        if (c < 128) { row.fill(u[p++], x, x + c + 1); x += c + 1; } else { const m = 257 - c; row.set(u.subarray(p, p + m), x); p += m; x += m; }
      }
      for (let r = 0; r < rep; r++) data.set(row, (y + r) * width);
      y += rep;
    }
    pages.push({ bpp, duplex, quality, width, height, dpi, data });
  }
  expect(p).toBe(u.length);
  return pages;
}

const noisy = (w, h) => ({ width: w, height: h, data: Uint8Array.from({ length: w * h }, (_, i) => (i * 37 + (i >> 3)) % 251) });

test('round-trips noisy pixels at 300 dpi doubled to 600', () => {
  const g = noisy(7, 5);
  const [pg] = decode(encodeUrf([g], { srcDpi: 300 }));
  expect(pg).toMatchObject({ bpp: 8, duplex: 1, quality: 5, width: 14, height: 10, dpi: 600 });
  for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) expect(pg.data[y * 14 + x]).toBe(g.data[(y >> 1) * 7 + (x >> 1)]);
});

test('long runs and blank pages compress small', () => {
  const white = { width: 2480, height: 3508, data: new Uint8Array(2480 * 3508).fill(255) };
  const u = encodeUrf([white, white], { srcDpi: 300 });
  expect(decode(u)).toHaveLength(2);
  expect(u.length).toBeLessThan(200_000);
});

test('ipp print-job carries format, quality, media, then the document', () => {
  const doc = new Uint8Array([1, 2, 3]);
  const req = ippPrintJob('192.168.29.7', doc, 'scan');
  const text = new TextDecoder('latin1').decode(req);
  expect([req[0], req[1], req[2], req[3]]).toEqual([2, 0, 0, 2]); // IPP 2.0, Print-Job
  for (const s of ['ipp://192.168.29.7/ipp/print', 'image/urf', 'print-quality', 'iso_a4_210x297mm']) expect(text).toContain(s);
  expect([...req.slice(-4)]).toEqual([3, 1, 2, 3]); // end-of-attributes, then data
});

test('ipp status reads the reply code', () => {
  expect(ippStatus(new Uint8Array([2, 0, 0, 0, 0, 0, 0, 1, 3]))).toBe(0);
  expect(ippStatus(new Uint8Array([2, 0, 4, 0x0a, 0, 0, 0, 1, 3]))).toBe(0x040a);
});
