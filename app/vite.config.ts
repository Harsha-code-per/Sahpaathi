import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sahpaathi',
        short_name: 'Sahpaathi',
        description: 'Offline AI co-teacher for multigrade classrooms',
        theme_color: '#23303b',
        background_color: '#23303b',
        display: 'standalone',
        start_url: '/teacher',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      // App shell works offline; episode packs are stored separately (IndexedDB), not precached.
      workbox: { navigateFallback: '/index.html' },
    }),
  ],
  // The bundled sample episode lives in ../content (owned by M1).
  server: { fs: { allow: ['.', '../content'] } },
})
