import { expect, test } from 'vitest';
import { toGray, toner } from '../../src/image/gray.js';

test('pure red becomes 54, white stays 255', () => {
  const g = toGray(new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255]), 2, 1);
  expect([...g.data]).toEqual([54, 255]);
});

test('toner: all black 100, all white 0', () => {
  expect(toner({ width: 2, height: 1, data: new Uint8Array([0, 0]) })).toBe(100);
  expect(toner({ width: 2, height: 1, data: new Uint8Array([255, 255]) })).toBe(0);
});
