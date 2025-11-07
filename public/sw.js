// Service Worker for Moms Fitness Mojo
// Enhanced PWA service worker with advanced caching strategies + Workbox helpers

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const CACHE_NAME = 'moms-fitness-mojo-v8';
const STATIC_CACHE = 'moms-fitness-mojo-static-v8';
const DYNAMIC_CACHE = 'moms-fitness-mojo-dynamic-v8';
const IMAGE_CACHE = 'moms-fitness-mojo-images-v8';

// Static assets to cache immediately
const urlsToCache = [
  '/',
  '/events',
  '/media',
  '/posts',
  '/sponsors',
  '/founder',
  '/manifest.json',
  '/logo.png',
  '/logo-small.png',
  '/logo.svg'
];

// Cache strategies
const CACHE_STRATEGIES = {
  static: 'cache-first',    // For static assets
  dynamic: 'network-first', // For API calls
  images: 'cache-first',    // For images
  fonts: 'cache-first'      // For fonts
};

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(urlsToCache);
      }),
      // Pre-cache critical resources
      caches.open(CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching critical resources');
        return cache.addAll([
          '/',
          '/manifest.json'
        ]);
      })
    ]).catch((error) => {
      console.error('Service Worker: Cache installation failed', error);
    })
  );
  // Force activation of new service worker
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheName.includes('moms-fitness-mojo-v8')) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ])
  );
});

let thumbnailStrategy = null;
let hlsManifestStrategy = null;

if (self.workbox) {
  workbox.setConfig({ debug: false });
  const { strategies, expiration, cacheableResponse } = workbox;

  thumbnailStrategy = new strategies.StaleWhileRevalidate({
    cacheName: 'thumbnail-cache-v1',
    plugins: [
      new expiration.ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
      new cacheableResponse.CacheableResponsePlugin({
        statuses: [200],
      }),
    ],
  });

  hlsManifestStrategy = new strategies.NetworkFirst({
    cacheName: 'hls-manifest-cache-v1',
    networkTimeoutSeconds: 4,
    plugins: [
      new expiration.ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: 60 * 10, // 10 minutes
      }),
      new cacheableResponse.CacheableResponsePlugin({
        statuses: [200],
      }),
    ],
  });
}

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (thumbnailStrategy && url.pathname.includes('/thumbnails/')) {
    event.respondWith(thumbnailStrategy.handle({ event, request: event.request }));
    return;
  }

  if (hlsManifestStrategy && url.pathname.endsWith('.m3u8')) {
    event.respondWith(hlsManifestStrategy.handle({ event, request: event.request }));
    return;
  }
  
  // 🔥 CRITICAL: Bypass service worker for HLS segment content
  // Segments use HTTP 206 (Partial Content) which can't be cached
  // Only bypass files in /hls/ folders that end with .ts (not all .ts files)
  const isHlsSegment = url.pathname.includes('/hls/') && url.pathname.endsWith('.ts');
  
  if (isHlsSegment) {
    // Let HLS requests pass through to network without caching
    event.respondWith(fetch(event.request));
    return;
  }
  
  const isImage = url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
  const isAPI = url.pathname.startsWith('/api/') || url.hostname.includes('firebase');
  const isStatic = url.pathname.match(/\.(js|css|html|json)$/i);

  event.respondWith(
    getCachedResponse(event.request, isImage, isAPI, isStatic)
  );
});

// Advanced caching strategies
async function getCachedResponse(request, isImage, isAPI, isStatic) {
  const url = new URL(request.url);
  
  try {
    if (isImage) {
      return await cacheFirstStrategy(request, IMAGE_CACHE);
    } else if (isAPI) {
      return await networkFirstStrategy(request, DYNAMIC_CACHE);
    } else if (isStatic) {
      return await cacheFirstStrategy(request, STATIC_CACHE);
    } else {
      return await networkFirstStrategy(request, DYNAMIC_CACHE);
    }
  } catch (error) {
    console.error('Service Worker: Fetch failed', error);
    
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await caches.match('/');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    // Return a generic offline response
    return new Response('Offline - Please check your connection', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cache-first strategy for static assets
async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  const networkResponse = await fetch(request);
  // Only cache successful responses that are not partial (206) and not HLS segments
  const url = new URL(request.url);
  const isHLSSegment = url.pathname.endsWith('.ts') || url.pathname.endsWith('.m3u8') || url.pathname.includes('/hls/');
  
  if (networkResponse.ok && networkResponse.status !== 206 && !isHLSSegment) {
    try {
      cache.put(request, networkResponse.clone());
    } catch (cacheError) {
      // Ignore cache errors (e.g., partial responses)
      console.log('Service Worker: Cache put failed (expected for some content)', cacheError);
    }
  }
  
  return networkResponse;
}

// Network-first strategy for dynamic content
async function networkFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    // Only cache successful responses that are not partial (206) and not HLS segments
    const url = new URL(request.url);
    const isHLSSegment = url.pathname.endsWith('.ts') || url.pathname.endsWith('.m3u8') || url.pathname.includes('/hls/');
    
    if (networkResponse.ok && networkResponse.status !== 206 && !isHLSSegment) {
      try {
        cache.put(request, networkResponse.clone());
      } catch (cacheError) {
        // Ignore cache errors (e.g., partial responses)
        console.log('Service Worker: Cache put failed (expected for some content)', cacheError);
      }
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New notification from Moms Fitness Mojo',
    icon: '/logo-small.png',
    badge: '/logo-small.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Event',
        icon: '/logo-small.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/logo-small.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Moms Fitness Mojo', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/events')
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Received message', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      cacheUrls(event.data.urls)
    );
  }
  
  // Send response back to main thread
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({ 
      type: 'MESSAGE_RECEIVED', 
      data: event.data 
    });
  }
});

// Helper functions
async function doBackgroundSync() {
  console.log('Service Worker: Performing background sync');
  // Implement background sync logic here
  // e.g., sync offline form submissions, cache updates, etc.
}

async function cacheUrls(urls) {
  const cache = await caches.open(STATIC_CACHE);
  return cache.addAll(urls);
}
