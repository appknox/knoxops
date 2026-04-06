import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/seed.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
  },
});
