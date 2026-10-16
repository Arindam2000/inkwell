/**
 * Mini book: one A4 sheet printed on both sides, folded in half 2 times (8 pages, A6)
 * or 3 times (16 pages, A7), stapled on the last fold and trimmed on the other folded edges.
 *
 * The page order isn't a table copied from somewhere: we fold a virtual sheet the way a person
 * does (every fold brings the left or top half over on top) and read the pages off the stack.
 */

/** @typedef {{page: number | null, turn: boolean}} Cell page index (null = blank) and whether it prints upside down */
/** @typedef {{cols: number, rows: number, landscape: boolean, front: Cell[][], back: Cell[][]}} Plan rows of cells per side */

/** How each size is folded. V = left half over the right, H = top half over the bottom. */
const FOLDS = {
  8: { cols: 2, rows: 2, landscape: false, steps: 'HV' },
  16: { cols: 4, rows: 2, landscape: true, steps: 'VHV' },
};

/**
 * Where each page goes on the sheet, for pages first..first+size-1 of n.
 * Backs follow Inkwell's book print: the back is the front turned over on the long edge of the
 * portrait sheet. A landscape sheet is turned upright to print, so its back flips top-to-bottom.
 * @param {8|16} size @param {number} n pages in total @param {number} [first]
 * @returns {Plan}
 */
export function miniBookPlan(size, n, first = 0) {
  const { cols, rows, landscape, steps } = FOLDS[size];
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ c, r, x: c, y: r, z: 0, fx: false, fy: false, folds: 0 });
  let W = cols, H = rows, layers = 1;
  for (const s of steps) {
    const v = s === 'V', half = (v ? W : H) / 2;
    for (const k of cells) {
      if ((v ? k.x : k.y) < half) {
        if (v) { k.x = W - 1 - k.x; k.fx = !k.fx; } else { k.y = H - 1 - k.y; k.fy = !k.fy; }
        k.z = 2 * layers - 1 - k.z;
        k.folds++;
      }
      if (v) k.x -= half; else k.y -= half;
    }
    if (v) W = half; else H = half;
    layers *= 2;
  }
  /** @type {() => Cell[][]} */
  const grid = () => Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ page: null, turn: false })));
  const front = grid(), back = grid();
  const at = (/** @type {number} */ i) => (first + i < n && i < size ? first + i : null);
  // Top leaf first: its upper face is the next page, its lower face the one after.
  [...cells].sort((a, b) => b.z - a.z).forEach((k, leaf) => {
    const frontUp = k.folds % 2 === 0;
    for (const isFront of [true, false]) {
      const up = isFront === frontUp;
      // Mirrors between how the face is printed and how the reader sees it; two mirrors = upside down.
      let mx = k.fx !== !up, my = k.fy; // a lower face is seen after turning the leaf over the spine
      if (!isFront) { if (landscape) my = !my; else mx = !mx; }
      if (mx !== my) throw new Error('fold plan would print a page mirrored');
      const cell = { page: at(2 * leaf + (up ? 0 : 1)), turn: mx };
      if (isFront) front[k.r][k.c] = cell;
      else if (landscape) back[rows - 1 - k.r][k.c] = cell;
      else back[k.r][cols - 1 - k.c] = cell;
    }
  });
  return { cols, rows, landscape, front, back };
}
