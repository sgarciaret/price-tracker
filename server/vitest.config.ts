import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const testDbPath = join(tmpdir(), 'price-tracker-test.db');

export default defineConfig({
  test: {
    // Los tests nunca abren data/prices.db: usan una base temporal
    env: {
      DB_PATH: testDbPath,
      // Credenciales de prueba: los tests no leen el .env real
      // (loadDotenv() solo se invoca desde src/index.ts, que no se importa aquí).
      ADMIN_USERNAME: 'test-admin',
      ADMIN_PASSWORD: 'test-password',
    },
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
    // Las suites que montan la app (api, auth) abren la misma base temporal:
    // se ejecutan una a una para que no haya dos conexiones escribiendo a la vez.
    fileParallelism: false,
  },
});
