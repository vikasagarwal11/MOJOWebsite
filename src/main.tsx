import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import './index.css';
import { registerSW } from './sw-register';
import { configureRecaptcha } from './utils/recaptcha';
import { loggingService } from './services/loggingService';
import { performanceService } from './services/performanceService';
import { initializeGlobalErrorPrevention } from './utils/globalErrorPrevention';

console.log('🚀 Main.tsx - Starting application initialization...');

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

root.render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);

// Register service worker only in production
registerSW();