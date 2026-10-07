import { vi } from 'vitest';
import type { AuthPort, TokenPair } from '../src/auth.js';

export const TEST_EMAIL = 'admin@test.local';
export const TEST_PASSWORD = 'test-password';
/** Vida de los access tokens falsos (como Supabase: 1 hora). */
export const ACCESS_TTL_MS = 60 * 60 * 1000;

/**
 * `AuthPort` en memoria para los tests: un único usuario, refresh tokens de un solo uso
 * (como la rotación de Supabase) y `revoked` para comprobar el logout.
 */
export function createFakeAuth() {
  let counter = 0;
  const validRefresh = new Set<string>();
  const revoked = new Set<string>();
  let userDeleted = false;

  const issue = (): TokenPair => {
    counter++;
    const pair = {
      accessToken: `access-${counter}`,
      refreshToken: `refresh-${counter}`,
      expiresAt: Date.now() + ACCESS_TTL_MS,
    };
    validRefresh.add(pair.refreshToken);
    return pair;
  };

  const port = {
    signIn: vi.fn(async (email: string, password: string) =>
      !userDeleted && email === TEST_EMAIL && password === TEST_PASSWORD ? issue() : null,
    ),
    refresh: vi.fn(async (refreshToken: string) => {
      if (userDeleted || !validRefresh.delete(refreshToken)) return null;
      return issue();
    }),
    signOut: vi.fn(async (accessToken: string) => {
      revoked.add(accessToken);
    }),
  } satisfies AuthPort;

  return {
    port,
    revoked,
    deleteUser() {
      userDeleted = true;
    },
  };
}
