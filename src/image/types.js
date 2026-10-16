/**
 * An 8-bit grayscale image: 0 = black, 255 = white, row-major.
 * photo: it came from a camera photo (may need cropping), not a PDF page.
 * dpi: pixels per inch when the real size is known (PDF pages), for true-size printing.
 * @typedef {{ width: number, height: number, data: Uint8Array, photo?: boolean, dpi?: number }} Gray
 */
export {};
