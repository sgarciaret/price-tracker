import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, formatPrice, type Page, type ProductDetail as Detail, type Status } from '../api';
import { Alert } from '../components/ui/Alert';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';

const STATUS: Record<Status, { label: string; tone: BadgeTone }> = {
  ok: { label: 'OK', tone: 'success' },
  not_found: { label: 'Precio no detectado', tone: 'warning' },
  blocked: { label: 'Tienda bloquea el acceso', tone: 'danger' },
  error: { label: 'Error', tone: 'neutral' },
};

export function ProductDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [product, setProduct] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<Set<number>>(new Set());
  const [checkingAll, setCheckingAll] = useState(false);
  const [url, setUrl] = useState('');
  const [selector, setSelector] = useState('');

  const load = () => api.getProduct(id).then(setProduct).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const replacePage = (page: Page) =>
    setProduct((p) => (p ? { ...p, pages: p.pages.map((x) => (x.id === page.id ? page : x)) } : p));

  const checkOne = async (pageId: number) => {
    setChecking((s) => new Set(s).add(pageId));
    try {
      replacePage(await api.checkPage(pageId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking((s) => { const n = new Set(s); n.delete(pageId); return n; });
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    setError(null);
    try {
      setProduct(await api.checkProduct(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCheckingAll(false);
    }
  };

  const addPage = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const page = await api.addPage(id, url.trim(), selector.trim() || undefined);
      setUrl(''); setSelector(''); setError(null);
      setProduct((p) => (p ? { ...p, pages: [...p.pages, page] } : p));
      checkOne(page.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removePage = async (pageId: number) => {
    if (!confirm('¿Eliminar esta página?')) return;
    await api.deletePage(pageId);
    setProduct((p) => (p ? { ...p, pages: p.pages.filter((x) => x.id !== pageId) } : p));
  };

  const editSelector = async (page: Page) => {
    const value = prompt('Selector CSS del precio (vacío para quitarlo):', page.css_selector ?? '');
    if (value === null) return;
    replacePage(await api.updatePage(page.id, value.trim() || null));
  };

  const renameProduct = async () => {
    if (!product) return;
    const name = prompt('Nuevo nombre:', product.name);
    if (!name?.trim()) return;
    await api.updateProduct(id, name.trim(), product.image_url);
    load();
  };

  const deleteProduct = async () => {
    if (!confirm('¿Eliminar el producto y todas sus páginas?')) return;
    await api.deleteProduct(id);
    navigate('/');
  };

  if (!product) return <p className="text-slate-500">{error ?? 'Cargando…'}</p>;

  const okPrices = product.pages
    .map((p) => p.last_check)
    .filter((c): c is NonNullable<typeof c> => c?.status === 'ok' && c.price != null)
    .map((c) => c.price!);
  const min = okPrices.length ? Math.min(...okPrices) : null;

  const sorted = [...product.pages].sort((a, b) => {
    const pa = a.last_check?.status === 'ok' ? a.last_check.price ?? Infinity : Infinity;
    const pb = b.last_check?.status === 'ok' ? b.last_check.price ?? Infinity : Infinity;
    return pa - pb || a.id - b.id;
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/"
          className="inline-block rounded-control px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          ← Volver
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {product.image_url && <img src={product.image_url} alt="" className="h-20 w-20 rounded object-contain" />}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={renameProduct}>Renombrar</Button>
            <Button variant="danger" size="sm" onClick={deleteProduct}>Eliminar</Button>
          </div>
        </div>
        <Button onClick={checkAll} disabled={checkingAll || product.pages.length === 0} loading={checkingAll}>
          {checkingAll ? 'Comprobando…' : 'Comprobar todas'}
        </Button>
      </div>

      <Card>
        <form onSubmit={addPage} className="flex flex-wrap items-end gap-3 p-3">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            type="url"
            placeholder="https://tienda.com/producto"
            aria-label="URL de la página"
            className="min-w-64 flex-[2]"
          />
          <Input
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="Selector CSS (opcional)"
            aria-label="Selector CSS"
            className="min-w-40 flex-1 font-mono"
          />
          <Button type="submit" variant="primary">Añadir página</Button>
        </form>
      </Card>

      {error && <Alert>{error}</Alert>}

      {product.pages.length === 0 ? (
        <EmptyState>Añade páginas de tiendas para comparar el precio.</EmptyState>
      ) : (
        <Card>
          <h2 className="border-b border-border px-4 py-3 text-base font-semibold text-slate-800">
            Comparación de precios
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Tienda</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Comprobado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((page) => {
                  const c = page.last_check;
                  const busy = checking.has(page.id) || checkingAll;
                  const isOk = c?.status === 'ok' && c.price != null;
                  const isBest = isOk && min != null && c!.price === min;
                  const diff = isOk && min != null ? c!.price! - min : null;
                  return (
                    <tr key={page.id} className={`border-t ${isBest ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2">
                        <a href={page.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
                          {page.store}
                        </a>
                        {page.css_selector && <div className="font-mono text-xs text-slate-400">{page.css_selector}</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {isOk ? formatPrice(c!.price!, c!.currency ?? 'EUR') : '—'}
                        {isBest && okPrices.length > 1 && <span className="ml-2 rounded bg-green-600 px-1.5 py-0.5 text-xs text-white">Mejor</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {diff != null && diff > 0
                          ? `+${formatPrice(diff, c!.currency ?? 'EUR')} (+${((diff / min!) * 100).toFixed(1)}%)`
                          : ''}
                      </td>
                      <td className="px-3 py-2">
                        {busy ? (
                          <span className="text-slate-500">Comprobando…</span>
                        ) : c ? (
                          <div>
                            <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                            {c.error_msg && <div className="mt-1 max-w-xs text-xs text-slate-500">{c.error_msg}</div>}
                            {c.method && <div className="mt-1 text-xs text-slate-400">vía {c.method}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-400">Sin comprobar</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c ? formatDate(c.checked_at) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right space-x-2">
                        <Button variant="secondary" size="sm" onClick={() => checkOne(page.id)} disabled={busy}>Comprobar</Button>
                        <Button variant="secondary" size="sm" onClick={() => editSelector(page)}>Selector</Button>
                        <Button variant="danger" size="sm" onClick={() => removePage(page.id)}>Quitar</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
