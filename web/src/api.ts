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
  best_currency: string | null;
}
export interface Fx {
  base: string;
  rates: Record<string, number>;
}

export interface Alert {
  id: number;
  product_id: number;
  page_id: number | null;
  kind: 'target' | 'drop';
  price: number;
  currency: string | null;
  price_converted: number;
  comparison_currency: string;
  baseline_price: number | null;
  baseline_currency: string | null;
  baseline_converted: number | null;
  threshold: number;
  threshold_currency: string | null;
  created_at: string;
  read_at: string | null;
  product_name?: string;
}

export interface ProductSummary {
  id: number; name: string; image_url: string | null; created_at: string;
  page_count: number; last_check_at: string | null;
  best: { price: number; currency: string | null; store: string } | null;
  best_price: number | null;
  best_price_at: string | null;
  best_currency: string | null;
  stores: string[];
  last_status: Status | null;
  unread_alerts: number;
}
export interface ProductDetail {
  id: number; name: string; image_url: string | null; created_at: string; pages: Page[];
  fx: Fx;
  best_page_id: number | null;
  target_price: number | null;
  target_currency: string;
  target_drop_pct: number | null;
}

let onUnauthorized: (() => void) | null = null;
let onAlertsChanged: (() => void) | null = null;

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

export function setOnAlertsChanged(handler: (() => void) | null): void {
  onAlertsChanged = handler;
}

function notifyAlertsChanged() {
  onAlertsChanged?.();
}

async function req<T>(method: string, url: string, body?: unknown, opts: { allowUnauthorized?: boolean } = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !opts.allowUnauthorized) {
    onUnauthorized?.();
    throw new Error('Sesión caducada');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export function convertPrice(price: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): number | null {
  if (fromCurrency === toCurrency) return price;
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (fromRate == null || toRate == null || fromRate === 0) return null;
  // rates[c] = unidades de c por 1 base
  // precio en fromCurrency -> base -> toCurrency
  const inBase = price / fromRate;
  return inBase * toRate;
}

export const api = {
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
  updateProduct: async (id: number, name: string, image_url: string | null, target_price?: number | null, target_currency?: string, target_drop_pct?: number | null) => {
    const res = await req<ProductSummary>('PUT', `/api/products/${id}`, { name, image_url, target_price, target_currency, target_drop_pct });
    invalidateClientProducts(id);
    notifyAlertsChanged();
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
    notifyAlertsChanged();
    return res;
  },
  checkProduct: async (id: number) => {
    const res = await req<ProductDetail>('POST', `/api/products/${id}/check`);
    invalidateClientProducts(id);
    notifyAlertsChanged();
    return res;
  },
  listAlerts: async () => req<Alert[]>('GET', '/api/alerts'),
  markAlertRead: async (id: number) => {
    await req<void>('POST', `/api/alerts/${id}/read`);
    notifyAlertsChanged();
  },
  markAllAlertsRead: async () => {
    await req<void>('POST', '/api/alerts/read-all');
    notifyAlertsChanged();
  },
};

export function formatPrice(price: number, currency = 'EUR') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

export function convert(
  price: number | null | undefined,
  currency: string | null | undefined,
  rates: Record<string, number>,
  base: string,
): number | null {
  if (price == null || currency == null) return null;
  if (currency === base) return price;
  const rate = rates[currency];
  if (rate == null || rate === 0) return null;
  // rates[c] = unidades de c que vale 1 unidad de base
  return price / rate;
}

export function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}