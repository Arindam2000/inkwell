import { defineConfig } from 'vite';

export default defineConfig({
  base: '/inkwell/',
  build: { manifest: true },
  test: { include: ['tests/**/*.test.js'] },
});
