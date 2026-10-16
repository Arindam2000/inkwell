/**
 * Book printing (both sides) on a printer that only prints one side.
 * Pass 1 prints the fronts (pages 1, 3, 5…). The person puts the stack back, blank side up,
 * and pass 2 prints the backs. An odd page count gets a blank back so every sheet goes through.
 * reverse: the printer stacks sheets face down, so the last front comes back on top and is fed first.
 * @param {number} n pages
 * @param {{reverse?: boolean}} [opts]
 * @returns {{front: number[], back: (number | null)[]}} page indexes (0-based); null = blank page
 */
export function bookOrder(n, { reverse = true } = {}) {
  const front = [];
  const back = [];
  for (let i = 0; i < n; i += 2) {
    front.push(i);
    back.push(i + 1 < n ? i + 1 : null);
  }
  if (reverse) back.reverse();
  return { front, back };
}
