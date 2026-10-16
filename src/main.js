import { start } from './ui/app.js';

export const APP_NAME = 'Inkwell';

// Attach buttons during page load (no lazy import), so a tap or a shared file is never missed.
if (typeof document !== 'undefined') {
  start();
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
  }
}
