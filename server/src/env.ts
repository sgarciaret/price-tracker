import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Carga `<raíz>/.env` en `process.env` con el cargador nativo de Node (`process.loadEnvFile`),
 * sin dependencias de npm. Si el fichero no existe, la app arranca igual: el login responderá 401.
 *
 * Se llama desde `index.ts`, nunca desde `app.ts`: los tests importan `buildApp()` y usan
 * las credenciales de `vitest.config.ts`, no las del `.env` real.
 */
export function loadDotenv(): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    if (!existsSync(envPath)) return;
    console.warn(`No se pudo leer el fichero ${envPath}:`, err);
  }
}
