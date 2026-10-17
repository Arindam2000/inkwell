// Inkwell service worker: works offline, and receives files from Android's Share menu.
const APP = 'inkwell-app-v1';
const SHARED = 'inkwell-shared';
const BASE = new URL('./', self.location.href).pathname; // "/inkwell/"

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP);
    // Vite's build manifest lists every file the app can load (including the PDF reader).
    const manifest = await (await fetch(BASE + '.vite/manifest.json')).json();
    const files = new Set([BASE, BASE + 'manifest.webmanifest', BASE + 'icons/icon-192.png']);
    for (const entry of Object.values(manifest)) {
      files.add(BASE + entry.file);
      (entry.css || []).forEach((f) => files.add(BASE + f));
      (entry.assets || []).forEach((f) => files.add(BASE + f));
    }
    await cache.addAll([...files]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== APP && key !== SHARED) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === BASE + 'share') {
    event.respondWith((async () => {
      const file = (await event.request.formData()).get('file');
      if (file instanceof File) {
        const shared = await caches.open(SHARED);
        await shared.put(BASE + 'shared-file', new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
      }
      return Response.redirect(BASE + '?shared=1', 303);
    })());
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    // Page: try the network for updates, fall back to the saved copy offline.
    event.respondWith(fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(APP).then((c) => c.put(BASE, copy));
      return res;
    }).catch(async () => (await caches.match(BASE)) || Response.error()));
    return;
  }
  // Files: saved copy first (they never change; names carry a hash).
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});
