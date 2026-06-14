import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { initFirebaseAuth } from './services/authService.ts';
import { APP_VERSION } from './config/version.ts';

// Handle Vite chunk loading errors (usually means a new version was deployed)
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

// Initialize Firebase auth listener before rendering
initFirebaseAuth();

// Expose version to console for F12 debugging
console.log(`%c🚀 TripAp Version: v${APP_VERSION}`, 'color: #10b981; font-weight: bold; font-size: 14px;');
(window as any).APP_VERSION = APP_VERSION;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
