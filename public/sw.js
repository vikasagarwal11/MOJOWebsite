// Service Worker for Moms Fitness Mojo
// This is a basic service worker to prevent the MIME type error

const CACHE_NAME = 'moms-fitness-mojo-v1';
const urlsToCache = [
  '/',
  '/events',
  '/media',
  '/posts',
  '/sponsors',
  '/founder'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});
