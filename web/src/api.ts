export type Status = 'ok' | 'not_found' | 'blocked' | 'error';

export interface Check {
  id: number; page_id: number; price: number | null; currency: string | null;
  status: Status; error_msg: string | null; method: string | null; checked_at: string;
}
export interface Page {
  id: number; product_id: number; url: string; store: string;
  css_selector: string | null; created_at: string; last_check: Check | null;
  best_price: number | null;
  best_price_at: string | null;
}
export interface ProductSummary {
  id: number; name: string; image_url: string | null; created_at: string;
  page_count: number; last_check_at: string | null;
  best: { price: number; currency: string; store: string } | null;
  best_price: number | null;         // Nuevo: precio más bajo histórico
  best_price_at: string | null;      // Nuevo: fecha del mejor precio histórico
}
export interface ProductDetail {
  id: number; name: string; image_url: string | null; created_at: string; pages: Page[];
}

let onUnauthorized: (() => void) | null = null;

const CLIENT_CACHE_TTL_MS = 30 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const clientCache = new Map<string, CacheEntry<unknown>>();

function getFromCache<T>(key: string): T | undefined {
  const entry = clientCache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    clientCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setInCache<T>(key: string, value: T, ttlMs: number = CLIENT_CACHE_TTL_MS): void {
  clientCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearClientCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    clientCache.clear();
    return;
  }
  for (const key of Array.from(clientCache.keys())) {
    if (key.startsWith(keyPrefix)) {
      clientCache.delete(key);
    }
  }
}

function invalidateClientProducts(productId?: number) {
  clientCache.delete('products:list');
  if (productId != null) {
    clientCache.delete(`products:detail:${productId}`);
  } else {
    for (const key of Array.from(clientCache.keys())) {
      if (key.startsWith('products:detail:')) {
        clientCache.delete(key);
      }
    }
  }
}

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
  logout: async () => {
    clearClientCache();
    return req<void>('POST', '/api/auth/logout');
  },
  session: () => req<{ authenticated: boolean }>('GET', '/api/auth/session'),
  listProducts: async () => {
    const cached = getFromCache<ProductSummary[]>('products:list');
    if (cached) return cached;
    const res = await req<ProductSummary[]>('GET', '/api/products');
    setInCache('products:list', res);
    return res;
  },
  getProduct: async (id: number) => {
    const key = `products:detail:${id}`;
    const cached = getFromCache<ProductDetail>(key);
    if (cached) return cached;
    const res = await req<ProductDetail>('GET', `/api/products/${id}`);
    setInCache(key, res);
    return res;
  },
  createProduct: async (name: string, image_url?: string) => {
    const res = await req<ProductSummary>('POST', '/api/products', { name, image_url });
    invalidateClientProducts(res.id);
    return res;
  },
  updateProduct: async (id: number, name: string, image_url: string | null) => {
    const res = await req<ProductSummary>('PUT', `/api/products/${id}`, { name, image_url });
    invalidateClientProducts(id);
    return res;
  },
  deleteProduct: async (id: number) => {
    await req<void>('DELETE', `/api/products/${id}`);
    invalidateClientProducts(id);
  },
  addPage: async (productId: number, url: string, css_selector?: string) => {
    const res = await req<Page>('POST', `/api/products/${productId}/pages`, { url, css_selector });
    invalidateClientProducts(productId);
    return res;
  },
  updatePage: async (id: number, css_selector: string | null) => {
    const res = await req<Page>('PUT', `/api/pages/${id}`, { css_selector });
    invalidateClientProducts(res.product_id);
    return res;
  },
  deletePage: async (id: number) => {
    await req<void>('DELETE', `/api/pages/${id}`);
    invalidateClientProducts();
  },
  checkPage: async (id: number) => {
    const res = await req<Page>('POST', `/api/pages/${id}/check`);
    invalidateClientProducts(res.product_id);
    return res;
  },
  checkProduct: async (id: number) => {
    const res = await req<ProductDetail>('POST', `/api/products/${id}/check`);
    invalidateClientProducts(id);
    return res;
  },
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
