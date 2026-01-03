// src/sw-register.ts
import { Workbox } from 'workbox-window';

/**
 * Detects if the app is running in a webview or iframe environment
 * (e.g., Cursor IDE, VS Code webview, embedded iframes)
 */
function isWebViewOrIframe(): boolean {
  try {
    // Check if running in an iframe
    if (window.self !== window.top) {
      return true;
    }
    
    // Check for common webview user agents (case-insensitive)
    const userAgent = navigator.userAgent.toLowerCase();
    const webviewIndicators = [
      'webview',
      'wv',
      'electron',
      'cursor',
      'vscode',
      'code-server',
      'vscode-webview', // VS Code specific
      'cursor-webview'  // Cursor specific
    ];
    
    if (webviewIndicators.some(indicator => userAgent.includes(indicator))) {
      return true;
    }
    
    // Additional check: Cursor/VS Code often have specific window properties
    // @ts-ignore - checking for IDE-specific properties
    if (window.chrome && (window.chrome.runtime?.id || window.chrome.webview)) {
      return true;
    }
    
    // Check for Electron environment (used by many IDEs)
    // @ts-ignore
    if (window.process && window.process.versions && window.process.versions.electron) {
      return true;
    }
    
    return false;
  } catch (error) {
    // If we can't access window.top or other checks fail,
    // we're likely in a restricted environment (webview/iframe)
    return true;
  }
}

/**
 * Checks if the document is in a valid state for Service Worker registration
 */
function isDocumentReady(): boolean {
  try {
    // Document must be in 'interactive' or 'complete' state
    return document.readyState === 'interactive' || document.readyState === 'complete';
  } catch (error) {
    return false;
  }
}

/**
 * Waits for the document to be ready before proceeding
 */
function waitForDocumentReady(callback: () => void, maxWaitTime = 5000): void {
  if (isDocumentReady()) {
    callback();
    return;
  }

  let timeoutId: ReturnType<typeof setTimeout>;
  let listener: (() => void) | null = null;

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (listener) {
      document.removeEventListener('DOMContentLoaded', listener);
      window.removeEventListener('load', listener);
    }
  };

  // Set a maximum wait time to prevent infinite waiting
  timeoutId = setTimeout(() => {
    cleanup();
    console.warn('⚠️ Service Worker: Document ready timeout, attempting registration anyway');
    callback();
  }, maxWaitTime);

  // Wait for DOMContentLoaded or load event
  listener = () => {
    if (isDocumentReady()) {
      cleanup();
      callback();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', listener, { once: true });
  }
  window.addEventListener('load', listener, { once: true });
}

export function registerSW() {
  // Wrap everything in try-catch to prevent errors from bubbling up to Cursor
  try {
    // EARLY EXIT: Skip registration in webview/iframe environments FIRST
    // This prevents any ServiceWorker code from running in Cursor's webview
    if (isWebViewOrIframe()) {
      // Silently skip - don't log to avoid console noise in IDE
      return;
    }

    // Only register Service Worker in production
    if ((import.meta as any).env?.DEV) {
      console.log('🔧 Development mode: Service Worker disabled');
      
      // Safely unregister any existing service worker in development
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => {
            registrations.forEach((registration) => {
              registration.unregister().catch(() => {
                // Silently ignore unregister errors
              });
            });
          })
          .catch(() => {
            // Silently ignore registration retrieval errors
          });
      }
      return;
    }

  // Check if Service Worker is supported
  if (!('serviceWorker' in navigator)) {
    console.log('🔧 Service Worker not supported in this browser');
    return;
  }

  // Wait for document to be ready before registering
  waitForDocumentReady(() => {
    // Double-check document state before registration
    if (!isDocumentReady()) {
      console.warn('⚠️ Service Worker: Document still not ready, skipping registration');
      return;
    }

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
        // Check for specific error types
        if (error instanceof DOMException) {
          if (error.name === 'InvalidStateError') {
            console.warn('⚠️ Service Worker: Document in invalid state, registration skipped');
            return;
          }
          if (error.name === 'SecurityError') {
            console.warn('⚠️ Service Worker: Security error (possibly HTTPS required or CORS issue)');
            return;
          }
        }
        console.warn('❌ Service Worker registration failed:', error);
      });
    } catch (error) {
      // Handle synchronous errors during setup
      if (error instanceof DOMException && error.name === 'InvalidStateError') {
        console.warn('⚠️ Service Worker: Document in invalid state during setup');
        return;
      }
      console.warn('❌ Service Worker setup failed:', error);
    }
  });
  } catch (error) {
    // Catch any unexpected errors to prevent them from reaching Cursor's webview
    // This is a safety net for any errors we might have missed
    if (error instanceof Error && error.name === 'InvalidStateError') {
      // Silently ignore InvalidStateError - this is expected in webviews
      return;
    }
    // For other errors, log but don't throw
    console.debug('Service Worker: Registration prevented due to environment restrictions');
  }
}
