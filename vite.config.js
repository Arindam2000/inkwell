import { defineConfig } from 'vite';

export default defineConfig({
  base: '/inkwell/',
  test: { include: ['tests/**/*.test.js'] },
});
