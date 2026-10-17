import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

// mode 'app' = the Android app build (served from the app itself, at /).
export default defineConfig(({ mode }) => ({
  base: mode === 'app' ? '/' : '/inkwell/',
  build: { manifest: true, outDir: mode === 'app' ? 'dist-app' : 'dist' },
  define: { __APP_VERSION__: JSON.stringify(version) },
  // The PDF reader loads on demand; pre-bundle it so the dev server doesn't reload the page the first time.
  optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.mjs'] },
  test: { include: ['tests/**/*.test.js'] },
}));
