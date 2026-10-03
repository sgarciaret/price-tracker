import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatPrice, type ProductSummary } from '../api';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';

export function ProductList() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

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

      {error && <Alert>{error}</Alert>}

      {products === null ? (
        <p className="text-slate-500">Cargando…</p>
      ) : products.length === 0 ? (
        <EmptyState>Todavía no hay productos. Añade uno para empezar.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {products.map((p) => (
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
