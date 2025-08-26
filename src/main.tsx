import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from './sw-register';
import { configureRecaptchaV2 } from './utils/recaptcha';

// Configure reCAPTCHA v2 early to prevent Enterprise probing
configureRecaptchaV2();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerSW();