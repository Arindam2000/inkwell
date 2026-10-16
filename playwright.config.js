import { defineConfig } from '@playwright/test';

// Uses the installed Google Chrome so no browser download is needed.
// The dev server serves both the app and src/ modules, so browser-only code is tested in real Chrome.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { channel: 'chrome', baseURL: 'http://localhost:5173/inkwell/', viewport: { width: 412, height: 915 } },
  webServer: { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173/inkwell/', reuseExistingServer: true, timeout: 120_000 },
});
