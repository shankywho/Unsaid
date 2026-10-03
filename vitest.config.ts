import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setupEnv.ts'],
    // Integration tests share one Postgres/Redis/Qdrant; run files serially.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
