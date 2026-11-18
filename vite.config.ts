import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages 처럼 하위 경로에 배포하면 BASE_PATH 로 지정 (예: /sudoku/)
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '스도쿠',
        short_name: '스도쿠',
        description: '드래그로 입력하는 모바일 스도쿠',
        lang: 'ko',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f5f1',
        theme_color: '#f6f5f1',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // 문제 API 는 항상 네트워크로 받는다 (오프라인이면 저장된 목록 사용)
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
});
