import type { FastifyInstance } from 'fastify';
import pLimit from 'p-limit';
import { z } from 'zod';
import { db, type CheckRow, type PageRow, type ProductRow } from './db.js';
import { checkUrl } from './scraper/index.js';

const limit = pLimit(3);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  image_url: z.string().trim().url().nullish().or(z.literal('').transform(() => null)),
});
const pageBody = z.object({
  url: z.string().trim().url().refine((u) => /^https?:/i.test(u), 'Debe ser http(s)'),
  css_selector: z.string().trim().max(500).nullish().transform((v) => v || null),
});
const pageUpdate = z.object({
  css_selector: z.string().trim().max(500).nullish().transform((v) => v || null),
});

const storeOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
const getPage = db.prepare('SELECT * FROM pages WHERE id = ?');
const pagesOf = db.prepare('SELECT * FROM pages WHERE product_id = ? ORDER BY id');
const lastCheck = db.prepare('SELECT * FROM price_checks WHERE page_id = ? ORDER BY checked_at DESC, id DESC LIMIT 1');
const insertCheck = db.prepare(
  'INSERT INTO price_checks (page_id, price, currency, status, error_msg, method) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
);

function pageWithLast(p: PageRow) {
  return { ...p, last_check: (lastCheck.get(p.id) as CheckRow | undefined) ?? null };
}

function productDetail(id: number) {
  const product = getProduct.get(id) as ProductRow | undefined;
  if (!product) return null;
  const pages = (pagesOf.all(id) as unknown as PageRow[]).map(pageWithLast);
  return { ...product, pages };
}

async function runCheck(page: PageRow) {
  const r = await limit(() => checkUrl(page.url, page.css_selector));
  const check = insertCheck.get(page.id, r.price, r.currency, r.status, r.error, r.method) as unknown as CheckRow;
  // Autocompleta la imagen del producto si no tiene
  if (r.image && /^https?:/.test(r.image)) {
    db.prepare('UPDATE products SET image_url = ? WHERE id = ? AND (image_url IS NULL OR image_url = \'\')').run(r.image, page.product_id);
  }
  return check;
}

export async function routes(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    const e = err as { statusCode?: number; message?: string };
    app.log.error(err);
    return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno' });
  });

  app.get('/api/products', async () => {
    const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC, id DESC').all() as unknown as ProductRow[];
    return products.map((p) => {
      const pages = (pagesOf.all(p.id) as unknown as PageRow[]).map(pageWithLast);
      const ok = pages.filter((x) => x.last_check?.status === 'ok' && x.last_check.price != null);
      const best = ok.sort((a, b) => a.last_check!.price! - b.last_check!.price!)[0];
      return {
        ...p,
        page_count: pages.length,
        best: best ? { price: best.last_check!.price, currency: best.last_check!.currency, store: best.store } : null,
      };
    });
  });

  app.post('/api/products', async (req, reply) => {
    const body = productBody.parse(req.body);
    const row = db.prepare('INSERT INTO products (name, image_url) VALUES (?, ?) RETURNING *').get(body.name, body.image_url ?? null);
    return reply.code(201).send(row);
  });

  app.get('/api/products/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const detail = productDetail(id);
    return detail ?? reply.code(404).send({ error: 'Producto no encontrado' });
  });

  app.put('/api/products/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = productBody.parse(req.body);
    const row = db.prepare('UPDATE products SET name = ?, image_url = ? WHERE id = ? RETURNING *').get(body.name, body.image_url ?? null, id);
    return row ?? reply.code(404).send({ error: 'Producto no encontrado' });
  });

  app.delete('/api/products/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return reply.code(204).send();
  });

  app.post('/api/products/:id/pages', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!getProduct.get(id)) return reply.code(404).send({ error: 'Producto no encontrado' });
    const body = pageBody.parse(req.body);
    const row = db
      .prepare('INSERT INTO pages (product_id, url, store, css_selector) VALUES (?, ?, ?, ?) RETURNING *')
      .get(id, body.url, storeOf(body.url), body.css_selector) as unknown as PageRow;
    return reply.code(201).send(pageWithLast(row));
  });

  app.put('/api/pages/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = pageUpdate.parse(req.body);
    const row = db.prepare('UPDATE pages SET css_selector = ? WHERE id = ? RETURNING *').get(body.css_selector, id) as PageRow | undefined;
    return row ? pageWithLast(row) : reply.code(404).send({ error: 'Página no encontrada' });
  });

  app.delete('/api/pages/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    db.prepare('DELETE FROM pages WHERE id = ?').run(id);
    return reply.code(204).send();
  });

  app.post('/api/pages/:id/check', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const page = getPage.get(id) as PageRow | undefined;
    if (!page) return reply.code(404).send({ error: 'Página no encontrada' });
    await runCheck(page);
    return pageWithLast(page);
  });

  app.post('/api/products/:id/check', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!getProduct.get(id)) return reply.code(404).send({ error: 'Producto no encontrado' });
    const pages = pagesOf.all(id) as unknown as PageRow[];
    await Promise.all(pages.map(runCheck));
    return productDetail(id);
  });
}
