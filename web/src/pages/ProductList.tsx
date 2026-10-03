import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatPrice, type ProductSummary } from '../api';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { DEFAULT_SORT, isValidSortKey, sortProducts, SORT_OPTIONS, type SortKey } from '../productSort';

const SORT_STORAGE_KEY = 'productList:sort';

function readStoredSort(): SortKey {
  try {
    const stored = sessionStorage.getItem(SORT_STORAGE_KEY);
    return isValidSortKey(stored) ? stored : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function ProductList() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(readStoredSort);

  const changeSort = (key: SortKey) => {
    setSort(key);
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, key);
    } catch {
      setSort(DEFAULT_SORT);
    }
  };

  const load = () => api.listProducts().then(setProducts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

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

      <div className="flex items-center justify-end gap-2">
        <label htmlFor="product-sort" className="text-xs font-medium text-slate-600">
          Ordenar por
        </label>
        <select
          id="product-sort"
          value={sort}
          onChange={(e) => changeSort(e.target.value as SortKey)}
          className="rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error && <Alert>{error}</Alert>}

      {products === null ? (
        <p className="text-slate-500">Cargando…</p>
      ) : products.length === 0 ? (
        <EmptyState>Todavía no hay productos. Añade uno para empezar.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sortProducts(products, sort).map((p) => (
            <li key={p.id}>
              <Card className="transition-shadow hover:shadow-pop">
                <Link to={`/products/${p.id}`} className="flex gap-3 p-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="h-16 w-16 rounded object-contain" />
                  ) : (
                    <div className="h-16 w-16 rounded bg-slate-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-sm text-slate-500">{p.page_count} página{p.page_count === 1 ? '' : 's'}</p>
                    {p.best ? (
                      <p className="text-sm">
                        Mejor: <span className="font-semibold text-green-700">{formatPrice(p.best.price, p.best.currency)}</span>{' '}
                        <span className="text-slate-500">en {p.best.store}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">Sin precios comprobados</p>
                    )}
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
