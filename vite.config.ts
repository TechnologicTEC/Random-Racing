import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Several tests build whole worlds for real seeds. With every test file running at once, one of those can take more than the default 5 seconds.
    testTimeout: 20_000,
  },
});
