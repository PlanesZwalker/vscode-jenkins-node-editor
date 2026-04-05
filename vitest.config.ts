// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/suite/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/parser/**', 'src/shared/**'],
      exclude: ['src/webview/**', 'src/extension/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: { '@': '/src/webview' },
  },
});
