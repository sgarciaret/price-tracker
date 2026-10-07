import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { createAuthClient, getSupabase } from './supabase.js';

export const SESSION_COOKIE = 'pt_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
/** Si al access token le queda menos que esto, se refresca antes de atender la petición. */
export const REFRESH_MARGIN_MS = 60_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Caducidad del access token (epoch ms). */
  expiresAt: number;
}

/** Puerto de autenticación: Supabase Auth en producción, un falso en los tests. */
export interface AuthPort {
  signIn(email: string, password: string): Promise<TokenPair | null>;
  refresh(refreshToken: string): Promise<TokenPair | null>;
  signOut(accessToken: string): Promise<void>;
}

interface Session extends TokenPair {
  /** Caducidad de la cookie (7 días desde el login). */
  sessionExpiresAt: number;
}

/**
 * token de cookie -> tokens de Supabase. En memoria: reiniciar el servidor cierra las sesiones.
 * Los tokens de Supabase nunca salen del servidor; el navegador solo ve el token opaco de la cookie.
 */
const sessions = new Map<string, Session>();
/** Refrescos en curso: varias peticiones simultáneas de la misma sesión comparten uno solo. */
const refreshing = new Map<string, Promise<boolean>>();

export function createSession(tokens: TokenPair): string {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { ...tokens, sessionExpiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

/** Descarta las sesiones caducadas (se purga en cada comprobación). */
function purgeExpired(): void {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.sessionExpiresAt <= now) sessions.delete(token);
  }
}

async function refreshSession(auth: AuthPort, token: string, session: Session): Promise<boolean> {
  try {
    const tokens = await auth.refresh(session.refreshToken);
    if (!tokens) {
      sessions.delete(token);
      return false;
    }
    sessions.set(token, { ...tokens, sessionExpiresAt: session.sessionExpiresAt });
    return true;
  } catch {
    sessions.delete(token);
    return false;
  }
}

/**
 * Válida si la entrada existe y la cookie no ha caducado. Si al access token le quedan
 * menos de 60 s, se refresca con el refresh token; si el refresco falla, la sesión se borra.
 */
export async function isValidSession(auth: AuthPort, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  purgeExpired();
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt - Date.now() >= REFRESH_MARGIN_MS) return true;

  let pending = refreshing.get(token);
  if (!pending) {
    pending = refreshSession(auth, token, session).finally(() => refreshing.delete(token));
    refreshing.set(token, pending);
  }
  return pending;
}

/** Borra la sesión local y revoca el token en Supabase (los errores de red no impiden el logout). */
export async function destroySession(auth: AuthPort, token: string): Promise<void> {
  const session = sessions.get(token);
  sessions.delete(token);
  if (session) await auth.signOut(session.accessToken);
}

const toPair = (s: { access_token: string; refresh_token: string; expires_at?: number; expires_in: number }): TokenPair => ({
  accessToken: s.access_token,
  refreshToken: s.refresh_token,
  expiresAt: s.expires_at ? s.expires_at * 1000 : Date.now() + s.expires_in * 1000,
});

/** Implementación de `AuthPort` sobre Supabase Auth. */
export function createSupabaseAuth(admin: () => SupabaseClient = getSupabase): AuthPort {
  return {
    async signIn(email, password) {
      // Cliente aparte: iniciar sesión en el cliente compartido cambiaría el rol de sus consultas.
      const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
      if (error || !data.session) return null;
      return toPair(data.session);
    },
    async refresh(refreshToken) {
      const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) return null;
      return toPair(data.session);
    },
    async signOut(accessToken) {
      const { error } = await admin().auth.admin.signOut(accessToken, 'local');
      if (error) throw error;
    },
  };
}

/** Parseo manual de la cabecera `cookie`, sin dependencias (`@fastify/cookie`). */
export function parseCookies(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw; // valor con escape inválido: se usa tal cual
    }
  }
  return cookies;
}
