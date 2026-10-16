import { expect, test } from 'vitest';
import { APP_NAME } from '../src/main.js';

test('app is called Inkwell', () => {
  expect(APP_NAME).toBe('Inkwell');
});
