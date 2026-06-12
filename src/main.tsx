import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { initFirebaseAuth } from './services/authService.ts';

// Handle Vite chunk loading errors (usually means a new version was deployed)
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

// Initialize Firebase auth listener before rendering
initFirebaseAuth();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
