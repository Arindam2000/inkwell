import { start } from './ui/app.js';

export const APP_NAME = 'Inkwell';

// Attach buttons during page load (no lazy import), so a tap or a shared file is never missed.
if (typeof document !== 'undefined') start();
