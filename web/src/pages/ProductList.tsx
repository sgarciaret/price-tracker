import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatPrice, formatDate, type ProductSummary } from '../api';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DEFAULT_SORT, isValidSortKey, sortProducts, SORT_OPTIONS, type SortKey } from '../productSort';
import { filterProducts, getStoreOptions, type ProductFilters } from '../productFilter';

const SORT_STORAGE_KEY = 'productList:sort';
const FILTERS_STORAGE_KEY = 'productList:filters';

function readStoredSort(): SortKey {
  try {
    const stored = sessionStorage.getItem(SORT_STORAGE_KEY);
    return isValidSortKey(stored) ? stored : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

function readStoredFilters(): ProductFilters {
  try {
    const stored = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore storage errors
  }
  return { query: '', store: 'all', state: 'all' };
}

export function ProductList() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(readStoredSort);
  const [filters, setFilters] = useState<ProductFilters>(readStoredFilters);

  const changeSort = (key: SortKey) => {
    setSort(key);
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, key);
    } catch {
      setSort(DEFAULT_SORT);
    }
  };

  const updateFilters = (patch: Partial<ProductFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const load = useCallback(() => api.listProducts().then(setProducts).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createProduct(name.trim());
      setName('');
      setError(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filtered = products ? filterProducts(products, filters) : null;
  const stores = products ? getStoreOptions(products) : [];
  const totalCount = products?.length ?? 0;
  const filteredCount = filtered?.length ?? 0;

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del producto (p. ej. Sony WH-1000XM5)"
          className="flex-1"
          aria-label="Nombre del producto"
        />
        <Button type="submit" variant="primary">Añadir producto</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Buscar por nombre o tienda…"
          value={filters.query}
          onChange={(e) => updateFilters({ query: e.target.value })}
          className="flex-1 min-w-[200px]"
          aria-label="Buscar productos"
        />
        <Select
          value={filters.store}
          onChange={(e) => updateFilters({ store: e.target.value })}
          options={[{ value: 'all', label: 'Todas las tiendas' }, ...stores.map((s) => ({ value: s, label: s }))]}
          className="min-w-[180px]"
        />
        <Select
          value={filters.state}
          onChange={(e) => updateFilters({ state: e.target.value as ProductFilters['state'] })}
          options={[
            { value: 'all', label: 'Todos los estados' },
            { value: 'with_price', label: 'Con precio' },
            { value: 'no_checks', label: 'Sin comprobaciones' },
            { value: 'problems', label: 'Con problemas' },
          ]}
          className="min-w-[180px]"
        />
        <label htmlFor="product-sort" className="text-xs font-medium text-slate-600">Ordenar por</label>
        <select
          id="product-sort"
          value={sort}
          onChange={(e) => changeSort(e.target.value as SortKey)}
          className="rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {error && <Alert>{error}</Alert>}

      {products === null ? (
        <p className="text-slate-500">Cargando…</p>
      ) : filtered === null ? null : filtered.length === 0 ? (
        totalCount === 0 ? (
          <EmptyState>Aún no hay productos. Añade uno para empezar.</EmptyState>
        ) : (
          <EmptyState>Aún no hay productos. Añade uno para empezar.</EmptyState>
        )
      ) : (
        <>
          <p className="text-sm text-slate-500">{filteredCount} de {totalCount} productos</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {sortProducts(filtered, sort).map((p) => (
              <li key={p.id}>
                <Card className="transition-shadow hover:shadow-pop">
                  <Link to={`/products/${p.id}`} className="flex gap-3 p-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-16 w-16 rounded object-contain" />
                    ) : (
                      <div className="h-16 w-16 rounded bg-slate-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-medium">{p.name}</p>
                        {p.unread_alerts > 0 && (
                          <span className="flex-shrink-0 bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                            {p.unread_alerts} alerta{p.unread_alerts === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{p.page_count} página{p.page_count === 1 ? '' : 's'}</p>
                      {p.best ? (
                        <p className="text-sm mt-1">
                          Precio más bajo: <span className="font-semibold text-green-700">{formatPrice(p.best.price, p.best.currency ?? 'EUR')}</span>{' '}
                          <span className="text-slate-500">en {p.best.store}</span>
                          {p.best_currency && p.best.currency !== p.best_currency && (
                            <span className="text-slate-400 ml-1">({p.best_currency})</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-400 mt-1">Sin precios comprobados</p>
                      )}
                      {p.best_price != null && p.best_price_at && (
                        <p className="text-xs text-slate-500 mt-1">
                          Histórico: <span className="font-medium text-slate-700">{formatPrice(p.best_price, p.best_currency ?? 'EUR')}</span>{' '}
                          <span className="text-slate-400">({formatDate(p.best_price_at)})</span>
                        </p>
                      )}
                    </div>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}