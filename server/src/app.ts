import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './routes.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, { origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] });
  await app.register(routes);

  // En modo "start", sirve el frontend compilado si existe
  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api') ? reply.code(404).send({ error: 'No encontrado' }) : reply.sendFile('index.html'),
    );
  }

  return app;
}
