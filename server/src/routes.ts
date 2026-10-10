import type { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import pLimit from 'p-limit';
import { z } from 'zod';
import {
  createSession,
  destroySession,
  isValidSession,
  parseCookies,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type AuthPort,
} from './auth.js';
import { MemoryCache } from './cache.js';
import type { PageRow, ProductDetailRow, ProductSummaryRow, Repo } from './repo.js';
import { checkUrl } from './scraper/index.js';

const limit = pLimit(3);

/** Únicas rutas `/api` accesibles sin cookie de sesión. */
const PUBLIC_AUTH_ROUTES = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/session']);

const loginBody = z
  .object({ email: z.string().trim().catch(''), password: z.string().catch('') })
  .catch({ email: '', password: '' });

const secureDirective = () => (process.env.NODE_ENV === 'production' ? '; Secure' : '');

const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secureDirective()}`;
const clearedCookie = () => `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureDirective()}`;

const idParam = z.object({ id: z.coerce.number().int().positive() });
const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  image_url: z.url().trim().nullish().or(z.literal('').transform(() => null)),
});
const pageBody = z.object({
  url: z.url().trim().refine((u) => /^https?:/i.test(u), 'Debe ser http(s)'),
  css_selector: z.string().trim().max(500).nullish().transform((v) => v || null),
});
const pageUpdate = z.object({
  css_selector: z.string().trim().max(500).nullish().transform((v) => v || null),
});

const storeOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export interface RoutesOptions {
  repo: Repo;
  auth: AuthPort;
  cache?: MemoryCache;
}

export async function routes(app: FastifyInstance, { repo, auth, cache = new MemoryCache() }: RoutesOptions) {
  const pageWithLast = async (p: PageRow) => ({ ...p, last_check: await repo.lastCheck(p.id) });

  const invalidateProduct = (productId?: number) => {
    cache.delete('products:list');
    if (productId != null) {
      cache.delete(`products:detail:${productId}`);
    }
  };

  async function runCheck(page: PageRow) {
    const r = await limit(() => checkUrl(page.url, page.css_selector));
    const check = await repo.insertCheck({
      pageId: page.id,
      price: r.price,
      currency: r.currency,
      status: r.status,
      errorMsg: r.error,
      method: r.method,
    });
    // Autocompleta la imagen del producto si no tiene
    if (r.image && /^https?:/.test(r.image)) await repo.setImageIfEmpty(page.product_id, r.image);
    return check;
  }

  // Protege todos los endpoints /api con una cookie de sesión válida.
  // Se registra antes que ninguna ruta: Fastify solo aplica los hooks del contexto
  // a las rutas registradas después de ellos.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const path = req.url.split('?')[0];
    if (PUBLIC_AUTH_ROUTES.has(path)) return;
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (await isValidSession(auth, token)) return;
    return reply.code(401).send({ error: 'No autenticado' });
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    const e = err as { statusCode?: number; message?: string };
    app.log.error(err);
    return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno' });
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const api = app.withTypeProvider<ZodTypeProvider>();

  api.post('/api/auth/login', { schema: { body: loginBody } }, async (req, reply) => {
    const { email, password } = req.body;
    const tokens = email && password ? await auth.signIn(email, password) : null;
    if (!tokens) {
      app.log.warn({ email }, 'Login rechazado por Supabase Auth');
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos' });
    }
    return reply.code(200).header('set-cookie', sessionCookie(createSession(tokens))).send({ authenticated: true });
  });

  api.post('/api/auth/logout', async (req, reply) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      try {
        await destroySession(auth, token);
      } catch (err) {
        app.log.warn({ err }, 'No se pudo revocar el token en Supabase');
      }
    }
    return reply.code(204).header('set-cookie', clearedCookie()).send();
  });

  // No exige sesión: el frontend comprueba el estado sin disparar el manejador de 401.
  api.get('/api/auth/session', async (req) => ({
    authenticated: await isValidSession(auth, parseCookies(req.headers.cookie)[SESSION_COOKIE]),
  }));

  api.get('/api/products', async () => {
    const cached = cache.get<ProductSummaryRow[]>('products:list');
    if (cached) return cached;
    const summary = await repo.listProductsSummary();
    cache.set('products:list', summary);
    return summary;
  });

  api.post('/api/products', { schema: { body: productBody } }, async (req, reply) => {
    const body = req.body;
    const row = await repo.createProduct(body.name, body.image_url ?? null);
    invalidateProduct(row.id);
    return reply.code(201).send(row);
  });

  api.get('/api/products/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    const cacheKey = `products:detail:${id}`;
    const cached = cache.get<ProductDetailRow>(cacheKey);
    if (cached) return cached;
    const detail = await repo.getProductDetail(id);
    if (!detail) return reply.code(404).send({ error: 'Producto no encontrado' });
    cache.set(cacheKey, detail);
    return detail;
  });

  api.put('/api/products/:id', { schema: { params: idParam, body: productBody } }, async (req, reply) => {
    const { id } = req.params;
    const body = req.body;
    const row = await repo.updateProduct(id, body.name, body.image_url ?? null);
    if (!row) return reply.code(404).send({ error: 'Producto no encontrado' });
    invalidateProduct(id);
    return row;
  });

  api.delete('/api/products/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    await repo.deleteProduct(id);
    invalidateProduct(id);
    return reply.code(204).send();
  });

  api.post('/api/products/:id/pages', { schema: { params: idParam, body: pageBody } }, async (req, reply) => {
    const { id } = req.params;
    if (!(await repo.getProduct(id))) return reply.code(404).send({ error: 'Producto no encontrado' });
    const body = req.body;
    const row = await repo.createPage(id, body.url, storeOf(body.url), body.css_selector);
    invalidateProduct(id);
    return reply.code(201).send(await pageWithLast(row));
  });

  api.put('/api/pages/:id', { schema: { params: idParam, body: pageUpdate } }, async (req, reply) => {
    const { id } = req.params;
    const body = req.body;
    const row = await repo.updatePage(id, body.css_selector);
    if (!row) return reply.code(404).send({ error: 'Página no encontrada' });
    invalidateProduct(row.product_id);
    return pageWithLast(row);
  });

  api.delete('/api/pages/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    const page = await repo.getPage(id);
    await repo.deletePage(id);
    if (page) {
      invalidateProduct(page.product_id);
    }
    return reply.code(204).send();
  });

  api.post('/api/pages/:id/check', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    const page = await repo.getPage(id);
    if (!page) return reply.code(404).send({ error: 'Página no encontrada' });
    await runCheck(page);
    invalidateProduct(page.product_id);
    return pageWithLast(page);
  });

  api.post('/api/products/:id/check', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    if (!(await repo.getProduct(id))) return reply.code(404).send({ error: 'Producto no encontrado' });
    const pages = await repo.listPages(id);
    await Promise.all(pages.map(runCheck));
    invalidateProduct(id);
    const detail = await repo.getProductDetail(id);
    if (detail) {
      cache.set(`products:detail:${id}`, detail);
    }
    return detail ?? reply.code(404).send({ error: 'Producto no encontrado' });
  });
}
