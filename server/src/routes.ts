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
import type { PageRow, Repo } from './repo.js';
import { checkUrl } from './scraper/index.js';

const limit = pLimit(3);

/** Únicas rutas `/api` accesibles sin cookie de sesión. */
const PUBLIC_AUTH_ROUTES = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/session']);

const loginBody = z
  .object({ email: z.string().trim().catch(''), password: z.string().catch('') })
  .catch({ email: '', password: '' });

const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
const clearedCookie = `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;

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
}

export async function routes(app: FastifyInstance, { repo, auth }: RoutesOptions) {
  const pageWithLast = async (p: PageRow) => ({ ...p, last_check: await repo.lastCheck(p.id) });
  const pagesWithLast = async (productId: number) => Promise.all((await repo.listPages(productId)).map(pageWithLast));

  async function productDetail(id: number) {
    const product = await repo.getProduct(id);
    if (!product) return null;
    return { ...product, pages: await pagesWithLast(id) };
  }

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
    return reply.code(204).header('set-cookie', clearedCookie).send();
  });

  // No exige sesión: el frontend comprueba el estado sin disparar el manejador de 401.
  api.get('/api/auth/session', async (req) => ({
    authenticated: await isValidSession(auth, parseCookies(req.headers.cookie)[SESSION_COOKIE]),
  }));

  api.get('/api/products', async () => {
    const products = await repo.listProducts();
    return Promise.all(products.map(async (p) => {
      const pages = await pagesWithLast(p.id);
      const ok = pages.filter((x) => x.last_check?.status === 'ok' && x.last_check.price != null);
      const best = ok.sort((a, b) => a.last_check!.price! - b.last_check!.price!)[0];
      let last_check_at: string | null = null;
      for (const x of pages) {
        const checkedAt = x.last_check?.checked_at ?? null;
        if (checkedAt !== null && (last_check_at === null || checkedAt > last_check_at)) last_check_at = checkedAt;
      }
      return {
        ...p,
        page_count: pages.length,
        last_check_at,
        best: best ? { price: best.last_check!.price, currency: best.last_check!.currency, store: best.store } : null,
      };
    }));
  });

  api.post('/api/products', { schema: { body: productBody } }, async (req, reply) => {
    const body = req.body;
    const row = await repo.createProduct(body.name, body.image_url ?? null);
    return reply.code(201).send(row);
  });

  api.get('/api/products/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    const detail = await productDetail(id);
    return detail ?? reply.code(404).send({ error: 'Producto no encontrado' });
  });

  api.put('/api/products/:id', { schema: { params: idParam, body: productBody } }, async (req, reply) => {
    const { id } = req.params;
    const body = req.body;
    const row = await repo.updateProduct(id, body.name, body.image_url ?? null);
    return row ?? reply.code(404).send({ error: 'Producto no encontrado' });
  });

  api.delete('/api/products/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    await repo.deleteProduct(id);
    return reply.code(204).send();
  });

  api.post('/api/products/:id/pages', { schema: { params: idParam, body: pageBody } }, async (req, reply) => {
    const { id } = req.params;
    if (!(await repo.getProduct(id))) return reply.code(404).send({ error: 'Producto no encontrado' });
    const body = req.body;
    const row = await repo.createPage(id, body.url, storeOf(body.url), body.css_selector);
    return reply.code(201).send(await pageWithLast(row));
  });

  api.put('/api/pages/:id', { schema: { params: idParam, body: pageUpdate } }, async (req, reply) => {
    const { id } = req.params;
    const body = req.body;
    const row = await repo.updatePage(id, body.css_selector);
    return row ? pageWithLast(row) : reply.code(404).send({ error: 'Página no encontrada' });
  });

  api.delete('/api/pages/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    await repo.deletePage(id);
    return reply.code(204).send();
  });

  api.post('/api/pages/:id/check', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    const page = await repo.getPage(id);
    if (!page) return reply.code(404).send({ error: 'Página no encontrada' });
    await runCheck(page);
    return pageWithLast(page);
  });

  api.post('/api/products/:id/check', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params;
    if (!(await repo.getProduct(id))) return reply.code(404).send({ error: 'Producto no encontrado' });
    const pages = await repo.listPages(id);
    await Promise.all(pages.map(runCheck));
    return productDetail(id);
  });
}
