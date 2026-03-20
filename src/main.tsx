import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import './index.css';
import { loggingService } from './services/loggingService';
import { performanceService } from './services/performanceService';
import { registerSW } from './sw-register';
import { initializeGlobalErrorPrevention } from './utils/globalErrorPrevention';
import { configureRecaptcha } from './utils/recaptcha';
import { FIREBASE_ENV_MISMATCH, FIREBASE_ENV_MISMATCH_DETAILS } from './config/firebase';

console.log('🚀 Main.tsx - Starting application initialization...');

// Dev-only: log Firebase Phone Auth verification failures with server response body.
// This helps diagnose auth/invalid-app-credential (often returned as a 400 with a detailed JSON error).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as any)?.url?.toString?.() || input.toString();
    const isSendVerification = url.includes('identitytoolkit.googleapis.com') && url.includes('accounts:sendVerificationCode');

    const response = await originalFetch(input as any, init);
    if (isSendVerification && !response.ok) {
      try {
        const cloned = response.clone();
        const text = await cloned.text();
        let message: string | undefined;
        try {
          const parsed = JSON.parse(text);
          message = parsed?.error?.message;
        } catch {
          // ignore JSON parse failures
        }

        // Keep it readable; Firebase returns JSON like { error: { message, status, ... } }
        console.warn('🚨 [PhoneAuth] sendVerificationCode failed', {
          status: response.status,
          statusText: response.statusText,
          url,
          message,
        });

        // Also log the raw body so it can be copied easily.
        console.warn('🚨 [PhoneAuth] Raw responseBody:', text);
      } catch (e) {
        console.warn('🚨 [PhoneAuth] Failed to read error body', e);
      }
    }

    return response;
  };
}

// Initialize global error prevention FIRST - before anything else
try {
  console.log('🛡️ Main.tsx - About to initialize global error prevention...');
  initializeGlobalErrorPrevention();
  console.log('✅ Main.tsx - Global error prevention initialized successfully');
} catch (error) {
  console.error('❌ Main.tsx - Failed to initialize global error prevention:', error);
}

// Configure reCAPTCHA based on environment (v2 for dev, Enterprise for staging/prod)
configureRecaptcha();

// Initialize performance monitoring first (no dependencies)
performanceService.initialize();

// Initialize logging service after performance service to avoid circular dependency
setTimeout(() => {
  loggingService.initialize();
}, 0);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}
const root = createRoot(container);

if (FIREBASE_ENV_MISMATCH) {
  console.error('[Firebase] Environment mismatch detected. Blocking app boot.', FIREBASE_ENV_MISMATCH_DETAILS);
  root.render(
    <StrictMode>
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-2xl w-full bg-slate-900/70 border border-red-500/40 rounded-2xl p-6 shadow-lg">
          <h1 className="text-2xl font-semibold text-red-300 mb-3">Maintenance</h1>
          <p className="text-sm text-slate-200 mb-4">
            We’re performing maintenance right now. Please check back shortly.
          </p>
          <p className="text-xs text-slate-400">
            If you need immediate help, please contact support.
          </p>
        </div>
      </div>
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </StrictMode>
  );
}

// Register service worker only in production
registerSW();
