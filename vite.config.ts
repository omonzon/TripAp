import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
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
  server: {
    watch: {
      // Exclude directories that Vite shouldn't watch (prevents EBUSY errors on OneDrive-locked files)
      ignored: ['**/.agents/**', '**/dist/**', '**/node_modules/**', '**/.git/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'vendor-i18n';
          if (id.includes('node_modules/zustand')) return 'vendor-zustand';
          return undefined;
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
