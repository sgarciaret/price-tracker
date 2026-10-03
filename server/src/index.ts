import { buildApp } from './app.js';
import { closeBrowser } from './scraper/fetcher.js';

const PORT = Number(process.env.PORT ?? 3001);
const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await closeBrowser();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: PORT, host: '127.0.0.1' });
