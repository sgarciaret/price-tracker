import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../src/auth.js';

let app: FastifyInstance;

/** Login con las credenciales de prueba (las fija `vitest.config.ts`, no el `.env` real). */
async function login(username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
}

/** Cookie de sesión recién creada, lista para reenviar en un `inject`. */
async function sessionCookie(): Promise<string> {
  const res = await login();
  if (res.statusCode !== 200) throw new Error(`El login falló: ${res.statusCode} ${res.payload}`);
  return String(res.headers['set-cookie']).split(';')[0];
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('autenticación', () => {
  it('login correcto → 200 con cookie httpOnly de 7 días', async () => {
    const res = await login();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: true });

    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
  });

  it('login incorrecto → 401 con mensaje único y sin cookie', async () => {
    const badUser = await login(process.env.ADMIN_USERNAME, 'no-es-la-password');
    expect(badUser.statusCode).toBe(401);
    expect(badUser.json()).toEqual({ error: 'Usuario o contraseña incorrectos' });
    expect(badUser.headers['set-cookie']).toBeUndefined();

    const badPass = await login('otro-usuario', process.env.ADMIN_PASSWORD);
    expect(badPass.statusCode).toBe(401);
    expect(badPass.json()).toEqual({ error: 'Usuario o contraseña incorrectos' });
  });

  it('login con el body ausente o malformado → 401 (nunca 400)', async () => {
    const empty = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
    expect(empty.statusCode).toBe(401);

    const missing = await app.inject({ method: 'POST', url: '/api/auth/login' });
    expect(missing.statusCode).toBe(401);

    const wrongTypes = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 5 } });
    expect(wrongTypes.statusCode).toBe(401);
  });

  it('todo /api exige sesión: 401 sin cookie y 200 con ella', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/products' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json()).toEqual({ error: 'No autenticado' });

    const cookie = await sessionCookie();
    const auth = await app.inject({ method: 'GET', url: '/api/products', headers: { cookie } });
    expect(auth.statusCode).toBe(200);
  });

  it('las rutas anidadas también están protegidas', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/pages/1/check' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'No autenticado' });
  });

  it('GET /api/auth/session informa del estado sin exigir sesión', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(anon.statusCode).toBe(200);
    expect(anon.json()).toEqual({ authenticated: false });

    const cookie = await sessionCookie();
    const auth = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(auth.statusCode).toBe(200);
    expect(auth.json()).toEqual({ authenticated: true });
  });

  it('una cookie manipulada no vale', async () => {
    const forged = await app.inject({
      method: 'GET',
      url: '/api/products',
      headers: { cookie: `${SESSION_COOKIE}=esto-no-es-un-token` },
    });
    expect(forged.statusCode).toBe(401);
  });

  it('una cookie caducada no vale', async () => {
    const cookie = await sessionCookie();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + SESSION_TTL_MS + 60_000);
      const res = await app.inject({ method: 'GET', url: '/api/products', headers: { cookie } });
      expect(res.statusCode).toBe(401);
    } finally {
      vi.useRealTimers();
    }

    // La sesión purgada ya no reporta autenticación
    const state = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(state.json()).toEqual({ authenticated: false });
  });

  it('logout → 204, caduca la cookie y destruye la sesión', async () => {
    const cookie = await sessionCookie();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=;`);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');

    const after = await app.inject({ method: 'GET', url: '/api/products', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('sin ADMIN_USERNAME/ADMIN_PASSWORD el servidor arranca y el login da 401 avisando en el log', async () => {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    const warn = vi.spyOn(app.log, 'warn');
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    try {
      const res = await login();
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Usuario o contraseña incorrectos' });
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_USERNAME'));
    } finally {
      if (username !== undefined) process.env.ADMIN_USERNAME = username;
      if (password !== undefined) process.env.ADMIN_PASSWORD = password;
      warn.mockRestore();
    }
  });
});
