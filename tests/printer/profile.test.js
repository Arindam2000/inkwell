import { expect, test } from 'vitest';
import { HP_M126NW, applyCurve } from '../../src/printer/profile.js';

const ramp = () => ({ width: 256, height: 1, data: Uint8Array.from({ length: 256 }, (_, i) => i) });

test('black stays black, white stays white', () => {
  const out = applyCurve(ramp(), HP_M126NW.curve);
  expect(out.data[0]).toBe(0);
  expect(out.data[255]).toBe(255);
});

test('output never goes down as input goes up', () => {
  const out = applyCurve(ramp(), HP_M126NW.curve).data;
  for (let i = 1; i < 256; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
});

test('curve points are hit', () => {
  const out = applyCurve(ramp(), [[0, 0], [0.06, 0.22], [0.94, 0.86], [1, 1]]).data;
  expect(Math.abs(out[Math.round(0.06 * 255)] - Math.round(0.22 * 255))).toBeLessThanOrEqual(1);
});

test('input is untouched', () => {
  const r = ramp();
  applyCurve(r, HP_M126NW.curve);
  expect(r.data[100]).toBe(100);
});

test('profile respects the 2-dot minimum', () => {
  expect(HP_M126NW.minDot).toBe(2);
  expect(HP_M126NW.dpi).toBe(600);
});
