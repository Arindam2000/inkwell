/**
 * IPP: the printer's own language, sent over plain HTTP to port 631.
 * Print-Job = one request with the job settings, followed by the pages.
 * @param {string} host @param {Uint8Array} urf @param {string} name
 * @returns {Uint8Array}
 */
export function ippPrintJob(host, urf, name) {
  const enc = new TextEncoder();
  /** @type {number[]} */
  const b = [0x02, 0x00, 0x00, 0x02, 0, 0, 0, 1, 0x01]; // IPP 2.0, Print-Job, request 1, operation group
  /** @param {number} tag @param {string} key @param {Uint8Array} val */
  const attr = (tag, key, val) => {
    const k = enc.encode(key);
    b.push(tag, k.length >> 8, k.length & 255, ...k, val.length >> 8, val.length & 255, ...val);
  };
  const str = (/** @type {number} */ tag, /** @type {string} */ key, /** @type {string} */ v) => attr(tag, key, enc.encode(v));
  str(0x47, 'attributes-charset', 'utf-8');
  str(0x48, 'attributes-natural-language', 'en');
  str(0x45, 'printer-uri', `ipp://${host}/ipp/print`);
  str(0x42, 'requesting-user-name', 'inkwell');
  str(0x42, 'job-name', name.slice(0, 60));
  str(0x49, 'document-format', 'image/urf');
  b.push(0x02); // job group
  attr(0x23, 'print-quality', new Uint8Array([0, 0, 0, 5])); // high
  str(0x44, 'media', 'iso_a4_210x297mm');
  b.push(0x03); // end of attributes
  const out = new Uint8Array(b.length + urf.length);
  out.set(b);
  out.set(urf, b.length);
  return out;
}

/** Status code of an IPP reply: 0 = ok. @param {Uint8Array} reply */
export function ippStatus(reply) {
  return (reply[2] << 8) | reply[3];
}
