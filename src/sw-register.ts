// src/sw-register.ts
import { Workbox } from 'workbox-window';

export function registerSW() {
  if ('serviceWorker' in navigator) {
    const wb = new Workbox('/sw.js', { scope: '/' });
    wb.addEventListener('waiting', () => {
      // Optional: prompt user to refresh for new version
      wb.messageSW({ type: 'SKIP_WAITING' });
    });
    wb.register();
  }
}
