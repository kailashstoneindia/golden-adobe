import path from 'node:path';
// defineConfig from vitest/config is Vite's, with the `test` block typed.
import { defineConfig } from 'vitest/config';
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
        // Override when the API is not on :3000, e.g. VITE_PROXY_TARGET=http://localhost:3001
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
