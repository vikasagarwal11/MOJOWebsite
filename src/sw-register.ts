// src/sw-register.ts
import { Workbox } from 'workbox-window';

export function registerSW() {
  // Only register Service Worker in production
  if (import.meta.env.DEV) {
    console.log('🔧 Development mode: Service Worker disabled');
    return;
  }

  if ('serviceWorker' in navigator) {
    const wb = new Workbox('/sw.js', { scope: '/' });
    wb.addEventListener('waiting', () => {
      // Optional: prompt user to refresh for new version
      wb.messageSW({ type: 'SKIP_WAITING' });
    });
    wb.register();
  }
}
