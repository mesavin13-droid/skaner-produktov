import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Сканер продуктов',
        short_name: 'Сканер',
        description: 'Проверка состава и пищевой ценности продуктов по штрихкоду',
        theme_color: '#e9ebfa',
        background_color: '#f3f4fb',
        display: 'standalone',
        start_url: '/',
        lang: 'ru',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.openfoodfacts\.org\/.*$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'off-images', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api/product': {
        target: 'https://world.openfoodfacts.org',
        changeOrigin: true,
        rewrite: (path) => {
          const params = new URL(path, 'http://localhost').searchParams;
          const code = params.get('code') ?? '';
          return `/api/v2/product/${encodeURIComponent(code)}.json?fields=${encodeURIComponent('code,product_name,product_name_ru,brands,quantity,serving_size,image_url,image_front_url,image_front_small_url,nutriments,ingredients_text,ingredients_text_ru,ingredients_tags,additives_tags,allergens_tags,traces_tags,nutrition_grades,nutriscore_grade,nova_group,categories_tags,labels_tags,ingredients_analysis_tags,packaging_tags')}`;
        },
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'SkannerProduktov/1.0 (https://github.com/mesavin13-droid)');
          });
        },
      },
    },
  },
});
