import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Carga `<raíz>/.env` en `process.env` con el cargador nativo de Node (`process.loadEnvFile`),
 * sin dependencias de npm. Si el fichero no existe, la app no arranca: `index.ts` exige
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 * Se llama desde `index.ts` y desde los scripts, nunca desde `app.ts`: los tests importan
 * `buildApp()` con repo y auth falsos y no deben leer el `.env` real.
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
