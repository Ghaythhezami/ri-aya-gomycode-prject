import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
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
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
