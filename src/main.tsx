import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from './sw-register';
registerSW();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);