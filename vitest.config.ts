import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests for pure lib/ logic. Node environment (no DOM / React Native) — we
// only test framework-agnostic functions here. The `@/` alias mirrors the app's
// tsconfig path so tests import the same way the app does.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
