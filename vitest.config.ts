import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests for pure lib/ logic. Node environment (no DOM / React Native) — we
// only test framework-agnostic functions here. The `@/` alias mirrors the app's
// tsconfig path so tests import the same way the app does.
//
// Edge-function mappers are included too. They run on Deno in production, but
// the mapping modules are deliberately written free of Deno globals so the
// recipient/copy rules — which cannot be exercised without a device and a live
// project — are still covered by this runner.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
