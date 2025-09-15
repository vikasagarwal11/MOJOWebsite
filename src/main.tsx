import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from './sw-register';
import { configureRecaptchaV2 } from './utils/recaptcha';
import { loggingService } from './services/loggingService';
import { performanceService } from './services/performanceService';

// Configure reCAPTCHA v2 early to prevent Enterprise probing
configureRecaptchaV2();

// Initialize performance monitoring first (no dependencies)
performanceService.initialize();

// Initialize logging service after performance service to avoid circular dependency
setTimeout(() => {
  loggingService.initialize();
}, 0);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker only in production
registerSW();