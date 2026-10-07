import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { REFRESH_MARGIN_MS, SESSION_COOKIE, SESSION_TTL_MS } from '../src/auth.js';
import { ACCESS_TTL_MS, createFakeAuth, TEST_EMAIL, TEST_PASSWORD } from './fake-auth.js';
import { createFakeRepo } from './fake-repo.js';

let app: FastifyInstance;
let fake: ReturnType<typeof createFakeAuth>;

/** Login contra el puerto de auth falso (nunca contra Supabase ni el `.env` real). */
async function login(email: unknown = TEST_EMAIL, password: unknown = TEST_PASSWORD) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
}

/** Cookie de sesión recién creada, lista para reenviar en un `inject`. */
async function sessionCookie(): Promise<string> {
  const res = await login();
  if (res.statusCode !== 200) throw new Error(`El login falló: ${res.statusCode} ${res.payload}`);
  return String(res.headers['set-cookie']).split(';')[0];
}

/** Adelanta el reloj (solo `Date`) para simular el paso del tiempo. */
async function withClockAt<T>(time: number, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(time);
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

beforeAll(async () => {
  fake = createFakeAuth();
  app = await buildApp({ repo: createFakeRepo(), auth: fake.port });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await app.close();
});

describe('autenticación', () => {
  it('login correcto → 200 con cookie httpOnly de 7 días', async () => {
    const res = await login();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: true });
    expect(fake.port.signIn).toHaveBeenCalledWith(TEST_EMAIL, TEST_PASSWORD);

    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
  });

  it('la cookie es un token opaco: no contiene los tokens de Supabase', async () => {
    const res = await login();
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).not.toContain('access-');
    expect(setCookie).not.toContain('refresh-');
    expect(res.payload).not.toContain('access-');
  });

  it('login incorrecto → 401 con mensaje único y sin cookie', async () => {
    const badPass = await login(TEST_EMAIL, 'no-es-la-password');
    expect(badPass.statusCode).toBe(401);
    expect(badPass.json()).toEqual({ error: 'Usuario o contraseña incorrectos' });
    expect(badPass.headers['set-cookie']).toBeUndefined();

    const badEmail = await login('otro@test.local', TEST_PASSWORD);
    expect(badEmail.statusCode).toBe(401);
    expect(badEmail.json()).toEqual({ error: 'Usuario o contraseña incorrectos' });
  });

  it('login con el body ausente o malformado → 401 (nunca 400) y sin llamar a Supabase', async () => {
    const empty = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
    expect(empty.statusCode).toBe(401);

    const missing = await app.inject({ method: 'POST', url: '/api/auth/login' });
    expect(missing.statusCode).toBe(401);

    const wrongTypes = await login(5, TEST_PASSWORD);
    expect(wrongTypes.statusCode).toBe(401);

    expect(fake.port.signIn).not.toHaveBeenCalled();
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

  it('una cookie caducada (7 días) no vale', async () => {
    const cookie = await sessionCookie();
    const res = await withClockAt(Date.now() + SESSION_TTL_MS + 60_000, () =>
      app.inject({ method: 'GET', url: '/api/products', headers: { cookie } }),
    );
    expect(res.statusCode).toBe(401);

    const state = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(state.json()).toEqual({ authenticated: false });
  });

  it('un access token con más de 60 s de vida no se refresca', async () => {
    const cookie = await sessionCookie();
    const res = await withClockAt(Date.now() + ACCESS_TTL_MS - REFRESH_MARGIN_MS - 5_000, () =>
      app.inject({ method: 'GET', url: '/api/products', headers: { cookie } }),
    );
    expect(res.statusCode).toBe(200);
    expect(fake.port.refresh).not.toHaveBeenCalled();
  });

  it('un access token a punto de caducar se refresca solo y la petición responde 200', async () => {
    const cookie = await sessionCookie();
    const res = await withClockAt(Date.now() + ACCESS_TTL_MS - 30_000, () =>
      app.inject({ method: 'GET', url: '/api/products', headers: { cookie } }),
    );
    expect(res.statusCode).toBe(200);
    expect(fake.port.refresh).toHaveBeenCalledTimes(1);
  });

  it('peticiones simultáneas comparten un único refresco', async () => {
    const cookie = await sessionCookie();
    const results = await withClockAt(Date.now() + ACCESS_TTL_MS + 1_000, () =>
      Promise.all([1, 2, 3].map(() => app.inject({ method: 'GET', url: '/api/products', headers: { cookie } }))),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(fake.port.refresh).toHaveBeenCalledTimes(1);
  });

  it('si el refresco falla (usuario borrado en Supabase), la siguiente petición protegida da 401', async () => {
    const local = createFakeAuth();
    const isolated = await buildApp({ repo: createFakeRepo(), auth: local.port });
    try {
      const res = await isolated.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const cookie = String(res.headers['set-cookie']).split(';')[0];
      local.deleteUser();

      const after = await withClockAt(Date.now() + ACCESS_TTL_MS, () =>
        isolated.inject({ method: 'GET', url: '/api/products', headers: { cookie } }),
      );
      expect(after.statusCode).toBe(401);
      expect(after.json()).toEqual({ error: 'No autenticado' });

      const state = await isolated.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
      expect(state.json()).toEqual({ authenticated: false });
    } finally {
      await isolated.close();
    }
  });

  it('logout → 204, caduca la cookie, revoca el token en Supabase y destruye la sesión', async () => {
    const cookie = await sessionCookie();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=;`);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
    expect(fake.port.signOut).toHaveBeenCalledTimes(1);
    expect(fake.revoked.has(fake.port.signOut.mock.calls[0][0])).toBe(true);

    const after = await app.inject({ method: 'GET', url: '/api/products', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('logout responde 204 aunque Supabase falle al revocar', async () => {
    const cookie = await sessionCookie();
    fake.port.signOut.mockRejectedValueOnce(new Error('sin red'));
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(res.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/products', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });
});
