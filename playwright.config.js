import { defineConfig } from '@playwright/test';

// Uses the installed Google Chrome so no browser download is needed.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { channel: 'chrome', baseURL: 'http://localhost:4173/inkwell/', viewport: { width: 412, height: 915 } },
  webServer: { command: 'npx vite build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/inkwell/', reuseExistingServer: true, timeout: 120_000 },
});
