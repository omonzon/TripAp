import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-*.png'],
      manifest: {
        name: 'TravelPlatform',
        short_name: 'TravelApp',
        description: 'AI-Driven Multi-Tenant Travel Planning Platform',
        theme_color: '#1e40af',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'weather-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 } },
          },
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'geocoding-cache', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 } },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  resolve: { alias: { '@': '/src' } },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-zustand': ['zustand'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'json', 'html'] },
  },
});
