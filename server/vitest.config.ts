import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests inyectan repo y auth falsos en buildApp(): sin red, sin base de datos y sin leer el .env.
    include: ['test/**/*.test.ts'],
  },
});
