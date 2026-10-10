import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseAuth, type AuthPort } from './auth.js';
import { MemoryCache } from './cache.js';
import type { Repo } from './repo.js';
import { createSupabaseRepo } from './repo-supabase.js';
import { routes } from './routes.js';

export interface AppDeps {
  repo?: Repo;
  auth?: AuthPort;
  cache?: MemoryCache;
}

export async function buildApp({ repo = createSupabaseRepo(), auth = createSupabaseAuth(), cache }: AppDeps = {}) {
  const app = Fastify({ logger: { level: 'info' } });

  const allowedOrigins: (string | RegExp)[] = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https:\/\/.*\.onrender\.com$/,
  ];
  if (process.env.RENDER_EXTERNAL_URL) {
    allowedOrigins.push(process.env.RENDER_EXTERNAL_URL.replace(/\/$/, ''));
  }
  if (process.env.CORS_ORIGIN) {
    for (const origin of process.env.CORS_ORIGIN.split(',')) {
      const trimmed = origin.trim().replace(/\/$/, '');
      if (trimmed) allowedOrigins.push(trimmed);
    }
  }

  await app.register(cors, { origin: allowedOrigins });
  await app.register(routes, { repo, auth, cache });

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
