import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
  base: '/inkwell/',
  build: { manifest: true },
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: { include: ['tests/**/*.test.js'] },
});
