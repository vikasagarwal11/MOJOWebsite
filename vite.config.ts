// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Temporarily disabled PWA to fix caching issues
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
    //   manifest: {
    //     name: 'Mom Fitness Mojo',
    //     short_name: 'MFM',
    //     theme_color: '#ffffff',
    //     background_color: '#ffffff',
    //     display: 'standalone',
    //     start_url: '/',
    //     icons: [
    //       { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    //       { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
    //     ]
    //   },
    //   workbox: {
    //     cleanupOutdatedCaches: true,
    //     navigateFallback: '/index.html',
    //     runtimeCaching: [
    //       // Thumbs & posters → cache-first, longish TTL
    //       {
    //         urlPattern: ({ url }) =>
    //           url.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i) ||
    //           url.pathname.includes('/thumb') ||
    //           url.search.includes('thumb=1'),
    //         handler: 'CacheFirst',
    //         options: {
    //           cacheName: 'img-thumbs',
    //           expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30d
    //           cacheableResponse: { statuses: [0, 200] }
    //         }
    //       },
    //       // Responsive images (xs/sm/md/lg) → SWR for freshness
    //       {
    //         urlPattern: ({ url }) =>
    //           url.hostname.endsWith('firebasestorage.googleapis.com') ||
    //           url.hostname.endsWith('storage.googleapis.com'),
    //         handler: 'StaleWhileRevalidate',
    //         options: {
    //           cacheName: 'media-responsive',
    //           expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7d
    //           cacheableResponse: { statuses: [0, 200] }
    //         }
    //       },
    //       // HLS playlists + segments (m3u8, ts, m4s) → short SWR
    //       {
    //         urlPattern: ({ url }) =>
    //           url.pathname.match(/\.(m3u8|ts|m4s)$/i),
    //         handler: 'StaleWhileRevalidate',
    //         options: {
    //           cacheName: 'hls-cache',
    //           expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 }, // 1h
    //           cacheableResponse: { statuses: [0, 200] }
    //         }
    //       },
    //       // API/Firestore hosting (if any REST endpoints / SSR assets)
    //       {
    //         urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
    //         handler: 'NetworkFirst',
    //         options: {
    //           cacheName: 'api',
    //           networkTimeoutSeconds: 3,
    //           cacheableResponse: { statuses: [0, 200] }
    //         }
    //       }
    //     ]
    //   }
    // })
  ],
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 5175, // Use port 5175 (current running port)
    strictPort: false, // Allow port fallback
    open: false // Don't auto-open browser
  }
});
