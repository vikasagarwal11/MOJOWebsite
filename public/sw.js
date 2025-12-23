// Service Worker for Moms Fitness Mojo
// Enhanced PWA service worker with advanced caching strategies + Workbox helpers

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const CACHE_NAME = 'moms-fitness-mojo-v9';
const STATIC_CACHE = 'moms-fitness-mojo-static-v9';
const DYNAMIC_CACHE = 'moms-fitness-mojo-dynamic-v9';
const IMAGE_CACHE = 'moms-fitness-mojo-images-v9';
const CACHE_WHITELIST = [
  CACHE_NAME,
  STATIC_CACHE,
  DYNAMIC_CACHE,
  IMAGE_CACHE,
  'thumbnail-cache-v1',
  'hls-manifest-cache-v1',
];

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
        return cache.addAll(urlsToCache).catch((error) => {
          console.warn('Service Worker: Some static files failed to cache', error);
          // Continue even if some files fail
          return Promise.resolve();
        });
      }),
      // Pre-cache critical resources
      caches.open(CACHE_NAME).then((cache) => {
        console.log('Service Worker: Caching critical resources');
        return cache.addAll([
          '/',
          '/manifest.json'
        ]).catch((error) => {
          console.warn('Service Worker: Some critical resources failed to cache', error);
          // Continue even if some files fail
          return Promise.resolve();
        });
      })
    ]).catch((error) => {
      console.error('Service Worker: Cache installation failed', error);
      // Don't fail the installation - allow SW to activate even if caching fails
    })
  );
  // Force activation of new service worker
  self.skipWaiting().catch((error) => {
    console.warn('Service Worker: Error skipping waiting during install', error);
  });
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!CACHE_WHITELIST.includes(cacheName)) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName).catch((error) => {
                console.warn(`Service Worker: Failed to delete cache ${cacheName}`, error);
                // Continue even if cache deletion fails
                return Promise.resolve();
              });
            }
            return Promise.resolve();
          })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim().catch((error) => {
        console.warn('Service Worker: Error claiming clients', error);
        // Continue activation even if claiming fails
        return Promise.resolve();
      })
    ]).catch((error) => {
      console.error('Service Worker: Activation failed', error);
      // Allow activation to complete even if cleanup fails
    })
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

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

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

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fetch(request);
  }
  
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

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fetch(request);
  }
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    // Only cache successful responses that are not partial (206) and not HLS segments
    const isHLSSegment = url.pathname.endsWith('.ts') || url.pathname.endsWith('.m3u8') || url.pathname.includes('/hls/');
    
    if (networkResponse.ok && networkResponse.status !== 206 && !isHLSSegment) {
      // Clone response before caching (must be done before reading body)
      const responseClone = networkResponse.clone();
      
      // Try to cache, but don't block on it
      cache.put(request, responseClone).catch((cacheError) => {
        // Silently ignore cache errors - these are expected for:
        // - Large files that exceed quota
        // - Opaque responses from CORS issues
        // - Network errors during caching
        // - Responses that can't be cloned
        console.debug('Service Worker: Cache put failed (non-critical)', cacheError.message);
      });
    }
    
    return networkResponse;
  } catch (fetchError) {
    // If fetch fails, try to return cached response
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw fetchError;
  }
}

// Network-first strategy for dynamic content
async function networkFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fetch(request);
  }

  try {
    const networkResponse = await fetch(request);
    // Only cache successful responses that are not partial (206) and not HLS segments
    const isHLSSegment = url.pathname.endsWith('.ts') || url.pathname.endsWith('.m3u8') || url.pathname.includes('/hls/');
    
    if (networkResponse.ok && networkResponse.status !== 206 && !isHLSSegment) {
      // Clone response before caching (must be done before reading body)
      const responseClone = networkResponse.clone();
      
      // Try to cache, but don't block on it
      cache.put(request, responseClone).catch((cacheError) => {
        // Silently ignore cache errors - these are expected for:
        // - Large files that exceed quota
        // - Opaque responses from CORS issues
        // - Network errors during caching
        // - Responses that can't be cloned
        console.debug('Service Worker: Cache put failed (non-critical)', cacheError.message);
      });
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

// Push notifications (Firebase Cloud Messaging)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received', event);
  
  let notificationData = {
    title: 'Moms Fitness Mojo',
    body: 'New notification from Moms Fitness Mojo',
    icon: '/logo-small.png',
    badge: '/logo-small.png',
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };
  
  // Handle FCM payload (can be JSON or text)
  if (event.data) {
    try {
      // Try to parse as JSON (FCM format)
      const payload = event.data.json();
      console.log('Service Worker: FCM payload received:', payload);
      
      if (payload.notification) {
        notificationData.title = payload.notification.title || notificationData.title;
        notificationData.body = payload.notification.body || notificationData.body;
        notificationData.icon = payload.notification.icon || notificationData.icon;
      }
      
      // Include FCM data in notification data
      if (payload.data) {
        notificationData.data = {
          ...notificationData.data,
          ...payload.data,
          click_action: payload.data.click_action || payload.fcmOptions?.link || '/events'
        };
      }
    } catch (e) {
      // Fallback to text if not JSON
      const text = event.data.text();
      console.log('Service Worker: Push notification text:', text);
      notificationData.body = text || notificationData.body;
    }
  }
  
  const options = {
    ...notificationData,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      {
        action: 'explore',
        title: 'View',
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
    self.registration.showNotification(notificationData.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event);
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  const urlToOpen = notificationData.click_action || 
                    notificationData.url || 
                    '/events';
  
  if (event.action === 'explore' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // If a window is already open, focus it
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
  
  // Close action - just close the notification (already done above)
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Received message', event.data);
  
  try {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting().catch((error) => {
        console.warn('Service Worker: Error skipping waiting', error);
      });
    }
    
    if (event.data && event.data.type === 'CACHE_URLS') {
      event.waitUntil(
        cacheUrls(event.data.urls).catch((error) => {
          console.error('Service Worker: Error caching URLs', error);
        })
      );
    }
    
    // Send response back to main thread
    if (event.ports && event.ports[0]) {
      try {
        event.ports[0].postMessage({ 
          type: 'MESSAGE_RECEIVED', 
          data: event.data 
        });
      } catch (portError) {
        console.warn('Service Worker: Error posting message to port', portError);
      }
    }
  } catch (error) {
    console.error('Service Worker: Error handling message', error);
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
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          console.warn(`Service Worker: Skipping cache for ${url} – status ${response.status}`);
          return;
        }
        await cache.put(url, response.clone());
      } catch (error) {
        console.warn(`Service Worker: Network error caching ${url}`, error);
      }
    })
  );
}
