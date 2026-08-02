import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    // DB-gated integration tests connect over a real network to a pooled
    // Postgres (Supabase session pooler) and may hit a cold start on the
    // free tier — the default 10s hook timeout is too tight for that.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
