import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sahpaathi',
        short_name: 'Sahpaathi',
        description: 'Offline AI co-teacher for multigrade classrooms',
        theme_color: '#172524',
        background_color: '#172524',
        display: 'standalone',
        start_url: '/teacher',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // App shell works offline; episode packs are stored separately (IndexedDB), not precached.
      workbox: {
        navigateFallback: '/index.html',
        // Fonts too, so every script renders offline (about 370 KB, fetched in the background after the first visit).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only the subsets we show: Latin for Figtree/Bricolage, one script file per Noto family.
        // The desk tools and the landing page load online only: a classroom phone never downloads them (recharts alone is ~120 KB gz).
        globIgnores: [
          '**/*{cyrillic,greek,vietnamese}*',
          '**/noto-sans-*-latin-*',
          '**/apple-touch-icon.png',
          '**/icon-512*.png',
          '**/assets/{Admin,Studio,Landing}-*',
        ],
      },
    }),
  ],
  // The bundled sample episode lives in ../content (owned by M1).
  server: { fs: { allow: ['.', '../content'] } },
})
