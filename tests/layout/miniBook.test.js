import { expect, test } from 'vitest';
import { miniBookPlan } from '../../src/layout/miniBook.js';

/** "3v" = page 3 upside down, "2^" = upright, "-" = blank */
const show = (side) => side.map((row) => row.map((c) => (c.page === null ? '-' : `${c.page + 1}${c.turn ? 'v' : '^'}`)).join(' '));

test('8 pages: the textbook quarto (outside 5 4 / 8 1, inside 3 6 / 2 7, top row upside down)', () => {
  const p = miniBookPlan(8, 8);
  expect(show(p.back)).toEqual(['5v 4v', '8^ 1^']);
  expect(show(p.front)).toEqual(['3v 6v', '2^ 7^']);
});

test('16 pages: every page once, each leaf has its next page on its back, folded pairs add up to 17', () => {
  const p = miniBookPlan(16, 16);
  const all = [...p.front.flat(), ...p.back.flat()].map((c) => c.page).sort((a, b) => a - b);
  expect(all).toEqual([...Array(16).keys()]);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const f = p.front[r][c].page, b = p.back[1 - r][c].page; // landscape back = flipped top to bottom
    expect(Math.abs(f - b)).toBe(1);
    expect(Math.min(f, b) % 2).toBe(0); // page 1|2, 3|4 … share a leaf
  }
  for (const side of [p.front, p.back]) for (const row of side) {
    expect(row[0].page + row[1].page).toBe(15);
    expect(row[2].page + row[3].page).toBe(15);
  }
});

test('short or long jobs: blanks fill the last book, the next book starts after the first', () => {
  expect(show(miniBookPlan(8, 5).back)).toEqual(['5v 4v', '- 1^']);
  const second = [...miniBookPlan(8, 12, 8).front.flat(), ...miniBookPlan(8, 12, 8).back.flat()].map((c) => c.page);
  expect(second.filter((x) => x !== null).sort((a, b) => a - b)).toEqual([8, 9, 10, 11]);
});
