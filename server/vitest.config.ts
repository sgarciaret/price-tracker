import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const testDbPath = join(tmpdir(), 'price-tracker-test.db');

export default defineConfig({
  test: {
    // Los tests nunca abren data/prices.db: usan una base temporal
    env: { DB_PATH: testDbPath },
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
