// src/sw-register.ts
import { Workbox } from 'workbox-window';

export function registerSW() {
  // Only register Service Worker in production
  if ((import.meta as any).env?.DEV) {
    console.log('🔧 Development mode: Service Worker disabled');
    
    // Unregister any existing service worker in development
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          console.log('🔧 Unregistering service worker in development mode');
          registration.unregister();
        });
      });
    }
    return;
  }

  if ('serviceWorker' in navigator) {
    try {
      // Append version to bypass aggressive SW caching on some clients
      const swVersion = 'v9';
      const wb = new Workbox(`/sw.js?${swVersion}`, { scope: '/' });
      
      // Add error handling for message events
      wb.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CACHE_UPDATED') {
          console.log('📦 Cache updated');
        }
      });
      
      wb.addEventListener('waiting', () => {
        // Optional: prompt user to refresh for new version
        wb.messageSW({ type: 'SKIP_WAITING' });
      });
      
      wb.register().then(() => {
        console.log('✅ Service Worker registered successfully');
      }).catch((error) => {
        console.warn('❌ Service Worker registration failed:', error);
      });
    } catch (error) {
      console.warn('❌ Service Worker setup failed:', error);
    }
  }
}
