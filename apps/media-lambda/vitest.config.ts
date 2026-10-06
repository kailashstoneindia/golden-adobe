import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    // The handler specs talk to a real MinIO and a stub HTTP server.
    testTimeout: 30_000,
  },
});
