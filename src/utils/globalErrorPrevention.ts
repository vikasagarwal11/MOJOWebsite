/**
 * Global Error Prevention Utilities (safe minimal version)
 * Sets up basic global error/rejection handlers without risky prototype patches.
 */

import { loggingService } from '../services/loggingService';

export function initializeGlobalErrorPrevention() {
  try {
    console.log('🛡️ Initializing global error prevention (safe mode)...');

    // Uncaught errors
    window.addEventListener('error', (event) => {
      try {
        console.error('GLOBAL ERROR CAUGHT:', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
        });
        loggingService.logErrorEvent(event.error || new Error(String(event.message)), {
          component: 'GlobalErrorHandler',
          severity: 'high',
        });
      } catch {}
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      try {
        console.error('UNHANDLED PROMISE REJECTION:', {
          reason: event.reason,
        });
        loggingService.logErrorEvent(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
          component: 'GlobalPromiseRejection',
          severity: 'high',
        });
        event.preventDefault();
      } catch {}
    });

    console.log('✅ Global error prevention initialized');
  } catch (e) {
    // Never throw from here
    console.warn('Global error prevention initialization failed:', e);
  }
}

