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

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
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

export function formatDate(sqlDate: string) {
  // SQLite guarda en UTC sin zona
  return new Date(sqlDate.replace(' ', 'T') + 'Z').toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
