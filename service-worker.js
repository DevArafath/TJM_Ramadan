const CACHE_NAME = 'tjm-ramadan-v4';

const SOUND_FILES = Array.from({ length: 12 }, (_, i) => `./sounds/${i + 1}.mp3`).concat([
  './sounds/scan_duplicate.mp3',
  './sounds/scan_warning.mp3'
]);

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './master_members.json',
  './registered.json',
  './images/logo.png',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/icon-maskable-512.png',
  ...SOUND_FILES
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});