import type { ProductSummary } from './api';

export interface ProductFilters {
  query: string;
  store: string;
  state: 'all' | 'with_price' | 'no_checks' | 'problems';
}

export function filterProducts(products: ProductSummary[], filters: ProductFilters): ProductSummary[] {
  let result = products;

  // Búsqueda por nombre y tienda
  if (filters.query.trim()) {
    const q = filters.query.trim().toLowerCase();
    result = result.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.stores.some((s) => s.toLowerCase().includes(q)),
    );
  }

  // Filtro por tienda
  if (filters.store !== 'all') {
    result = result.filter((p) => p.stores.includes(filters.store));
  }

  // Filtro por estado
  if (filters.state !== 'all') {
    switch (filters.state) {
      case 'with_price':
        result = result.filter((p) => p.best_price != null);
        break;
      case 'no_checks':
        result = result.filter((p) => p.last_check_at == null);
        break;
      case 'problems':
        result = result.filter((p) => p.last_status && p.last_status !== 'ok');
        break;
    }
  }

  return result;
}

export function getStoreOptions(products: ProductSummary[]): string[] {
  const stores = new Set<string>();
  for (const p of products) {
    for (const s of p.stores) stores.add(s);
  }
  return Array.from(stores).sort();
}