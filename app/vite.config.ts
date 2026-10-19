import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['membretes/*.png', 'membretes/*.jpg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rino Docs — Portafolios TESCI',
        short_name: 'Rino Docs',
        description: 'Generador offline-first de evidencias FO-205P11000-14 y portafolios TESCI',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait-primary',
        lang: 'es-MX',
        background_color: '#1c1917',
        theme_color: '#1d4ed8',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192-v2.png?v=2', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512-v2.png?v=2', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable-v2.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Sin `png`: los iconos se piden con `?v=2` (URL nueva, que el edge no
        // tiene cacheada) y no hacen falta offline. Los membretes y el
        // apple-touch-icon entran por `includeAssets`.
        globPatterns: ['**/*.{js,css,html,jpg,svg,woff2}'],
        globIgnores: ['**/og.png'],
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'rino-images', expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['pdfjs-dist'] },
})
