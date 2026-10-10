import { buildApp } from './app.js';
import { createSupabaseAuth } from './auth.js';
import { loadDotenv } from './env.js';
import { createSupabaseRepo } from './repo-supabase.js';
import { closeBrowser } from './scraper/fetcher.js';

loadDotenv();

const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Falta configuración de Supabase en el .env: ${missing.join(', ')}. El servidor no puede arrancar.`);
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const app = await buildApp({ repo: createSupabaseRepo(), auth: createSupabaseAuth() });

const shutdown = async () => {
  await app.close();
  await closeBrowser();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: PORT, host: HOST });
