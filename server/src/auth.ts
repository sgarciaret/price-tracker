import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'pt_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

/** token -> fecha de caducidad (epoch ms). En memoria: reiniciar el servidor cierra las sesiones. */
const sessions = new Map<string, number>();

/**
 * Lectura perezosa de `process.env` en cada llamada (no al cargar el módulo),
 * para que los tests puedan fijar o retirar las credenciales en cualquier momento.
 * Devuelve `null` si falta alguna de las dos variables.
 */
export function getCredentials(): { username: string; password: string } | null {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

// `timingSafeEqual` exige buffers de la misma longitud: se comparan los hash SHA-256
// de ambos lados para que la longitud del secreto no acorte la comparación.
function safeEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}

export function verifyCredentials(username: string, password: string): boolean {
  const creds = getCredentials();
  if (!creds) return false;
  const userOk = safeEquals(username, creds.username);
  const passOk = safeEquals(password, creds.password);
  return userOk && passOk;
}

export function createSession(): string {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

/** Descarta las sesiones caducadas (se purga en cada comprobación). */
function purgeExpired(): void {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token);
  }
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  purgeExpired();
  return sessions.has(token);
}

export function destroySession(token: string): void {
  sessions.delete(token);
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
