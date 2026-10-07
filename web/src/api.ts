export type Status = 'ok' | 'not_found' | 'blocked' | 'error';

export interface Check {
  id: number; page_id: number; price: number | null; currency: string | null;
  status: Status; error_msg: string | null; method: string | null; checked_at: string;
}
export interface Page {
  id: number; product_id: number; url: string; store: string;
  css_selector: string | null; created_at: string; last_check: Check | null;
}
export interface ProductSummary {
  id: number; name: string; image_url: string | null; created_at: string;
  page_count: number; last_check_at: string | null;
  best: { price: number; currency: string; store: string } | null;
}
export interface ProductDetail {
  id: number; name: string; image_url: string | null; created_at: string; pages: Page[];
}

let onUnauthorized: (() => void) | null = null;

/**
 * El AuthProvider registra aquí el manejador de `401` (en lugar de importar `auth.tsx`,
 * que crearía un ciclo). `req()` lo invoca antes de lanzar `Error('Sesión caducada')`.
 */
export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function req<T>(method: string, url: string, body?: unknown, opts: { allowUnauthorized?: boolean } = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !opts.allowUnauthorized) {
    // Sesión caducada (o ausente): se avisa al AuthProvider y se corta la petición.
    onUnauthorized?.();
    throw new Error('Sesión caducada');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  // Un 401 aquí significa credenciales incorrectas, no sesión caducada:
  // no se dispara el manejador y el error lo pinta la pantalla de login.
  login: (email: string, password: string) =>
    req<{ authenticated: boolean }>('POST', '/api/auth/login', { email, password }, { allowUnauthorized: true }),
  logout: () => req<void>('POST', '/api/auth/logout'),
  session: () => req<{ authenticated: boolean }>('GET', '/api/auth/session'),
  listProducts: () => req<ProductSummary[]>('GET', '/api/products'),
  getProduct: (id: number) => req<ProductDetail>('GET', `/api/products/${id}`),
  createProduct: (name: string, image_url?: string) => req<ProductSummary>('POST', '/api/products', { name, image_url }),
  updateProduct: (id: number, name: string, image_url: string | null) => req('PUT', `/api/products/${id}`, { name, image_url }),
  deleteProduct: (id: number) => req<void>('DELETE', `/api/products/${id}`),
  addPage: (productId: number, url: string, css_selector?: string) =>
    req<Page>('POST', `/api/products/${productId}/pages`, { url, css_selector }),
  updatePage: (id: number, css_selector: string | null) => req<Page>('PUT', `/api/pages/${id}`, { css_selector }),
  deletePage: (id: number) => req<void>('DELETE', `/api/pages/${id}`),
  checkPage: (id: number) => req<Page>('POST', `/api/pages/${id}/check`),
  checkProduct: (id: number) => req<ProductDetail>('POST', `/api/products/${id}/check`),
};

export function formatPrice(price: number, currency = 'EUR') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

export function formatDate(isoDate: string) {
  // La API devuelve las fechas en ISO 8601 con `Z` (UTC)
  return new Date(isoDate).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
