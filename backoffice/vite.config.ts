import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // '/app/' when the backoffice is served under the marketing site (Vercel build).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
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
