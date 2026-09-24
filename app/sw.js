'use strict';

// __APP_VERSION__ подставляется при сборке образа (см. Dockerfile).
// Новая версия => новый кэш => клиенты получают обновление.
const VERSION = '__APP_VERSION__';
const CACHE_PREFIX = 'wheel-of-names-';
const CACHE = CACHE_PREFIX + VERSION;

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Cache-first: приложение работает офлайн, обновление приходит с новой версией sw.js
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const scopePath = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate') {
    const p = url.pathname;
    if (p === scopePath || p === scopePath + 'index.html') {
      event.respondWith(caches.match('./').then((res) => res || fetch(req)));
    }
    return;
  }

  event.respondWith(caches.match(req, { ignoreSearch: true }).then((res) => res || fetch(req)));
});
