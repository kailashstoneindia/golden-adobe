import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const monorepoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Vite needs ESM; @golden-abode/types dist is CommonJS — bundle from source instead.
      '@golden-abode/types': path.resolve(monorepoRoot, 'packages/types/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
