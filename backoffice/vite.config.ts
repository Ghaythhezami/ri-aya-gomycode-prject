import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // '/app/' when the backoffice is served under the marketing site (Vercel build).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: an app release no longer invalidates the browser's
        // cached copy of React, charts, i18n or the socket client.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const p = id.replace(/\\/g, '/');
          const has = (pkgs: string) => new RegExp(`/(${pkgs})/`).test(p);
          if (has('recharts|d3-[a-z-]+|victory-vendor|decimal\\.js-light')) return 'vendor-charts';
          if (has('socket\\.io-client|engine\\.io-client|socket\\.io-parser|engine\\.io-parser'))
            return 'vendor-realtime';
          if (has('i18next|react-i18next|i18next-browser-languagedetector')) return 'vendor-i18n';
          if (has('@reduxjs|redux|react-redux|immer|reselect')) return 'vendor-state';
          if (has('react|react-dom|react-router|react-router-dom|scheduler')) return 'vendor-react';
          if (has('zod|react-hook-form|@hookform')) return 'vendor-forms';
          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // 5174, not Vite's default 5173: that port is used by another local project, and
    // two dev servers on one port means whichever starts second silently drifts to
    // 5175 - leaving the API's CORS allow-list and the emailed links pointing at the
    // wrong origin. strictPort makes a genuine collision fail loudly instead.
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        // VITE_API_PROXY points the dev proxy at another local API (e.g. one wired to the
        // Python services on 4010); the default is the API on 4000.
        target: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
