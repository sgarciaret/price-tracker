import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createFakeAuth, TEST_EMAIL, TEST_PASSWORD } from './fake-auth.js';
import { createFakeRepo } from './fake-repo.js';

let app: FastifyInstance;
let productId = 0;
let pageId = 0;
let sessionCookie = '';

// Todas las peticiones de esta suite van autenticadas con la cookie del login de beforeAll.
function inject(opts: InjectOptions) {
  return app.inject({ ...opts, headers: { ...opts.headers, cookie: sessionCookie } });
}

beforeAll(async () => {
  // Repo y auth en memoria: los tests no hacen red ni tocan ninguna base de datos
  app = await buildApp({ repo: createFakeRepo(), auth: createFakeAuth().port });

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (login.statusCode !== 200) throw new Error(`No se pudo iniciar sesión en los tests: ${login.payload}`);
  sessionCookie = String(login.headers['set-cookie']).split(';')[0];
});

afterAll(async () => {
  await app.close();
});

describe('productos', () => {
  it('crea un producto (201)', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/products',
      payload: { name: '  Monitor Dell U2723QE  ' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Monitor Dell U2723QE');
    expect(body.image_url).toBeNull();
    productId = body.id;
  });

  it('rechaza un producto sin nombre (400)', async () => {
    const res = await inject({ method: 'POST', url: '/api/products', payload: { name: '   ' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('name');
  });

  it('lista los productos (200)', async () => {
    const res = await inject({ method: 'GET', url: '/api/products' });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(Array.isArray(list)).toBe(true);
    const created = list.find((p: { id: number }) => p.id === productId);
    expect(created).toBeDefined();
    expect(created.page_count).toBe(0);
    expect(created.best).toBeNull();
  });

  it('devuelve el detalle de un producto (200)', async () => {
    const res = await inject({ method: 'GET', url: `/api/products/${productId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(productId);
    expect(body.pages).toEqual([]);
  });

  it('devuelve 404 en un producto inexistente', async () => {
    const res = await inject({ method: 'GET', url: '/api/products/999999' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Producto no encontrado' });
  });

  it('actualiza un producto (200)', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/products/${productId}`,
      payload: { name: 'Monitor Dell U2723QE (editado)', image_url: 'https://img.example.com/monitor.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Monitor Dell U2723QE (editado)');
    expect(res.json().image_url).toBe('https://img.example.com/monitor.jpg');
  });

  it('devuelve 404 al actualizar un producto inexistente', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/products/999999',
      payload: { name: 'Nada' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('páginas', () => {
  it('añade una página válida (201)', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/products/${productId}/pages`,
      payload: { url: 'https://www.tienda.example.com/monitor', css_selector: '.precio' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.url).toBe('https://www.tienda.example.com/monitor');
    expect(body.store).toBe('tienda.example.com');
    expect(body.css_selector).toBe('.precio');
    expect(body.last_check).toBeNull();
    pageId = body.id;
  });

  it('rechaza una URL que no es http(s) (400 con «Debe ser http(s)»)', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/products/${productId}/pages`,
      payload: { url: 'ftp://tienda.example.com/monitor' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Debe ser http(s)');
  });

  it('devuelve 404 al añadir una página a un producto inexistente', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/products/999999/pages',
      payload: { url: 'https://tienda.example.com/otro' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Producto no encontrado' });
  });

  it('edita el selector de una página (200)', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/pages/${pageId}`,
      payload: { css_selector: '#precio-final' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().css_selector).toBe('#precio-final');
  });

  it('borra una página (204) y luego da 404', async () => {
    const del = await inject({ method: 'DELETE', url: `/api/pages/${pageId}` });
    expect(del.statusCode).toBe(204);

    const again = await inject({ method: 'PUT', url: `/api/pages/${pageId}`, payload: { css_selector: '.otro' } });
    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: 'Página no encontrada' });
  });
});

describe('borrado de productos', () => {
  it('borra el producto (204) y después el detalle da 404', async () => {
    const del = await inject({ method: 'DELETE', url: `/api/products/${productId}` });
    expect(del.statusCode).toBe(204);

    const again = await inject({ method: 'GET', url: `/api/products/${productId}` });
    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: 'Producto no encontrado' });
  });
});
