import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, convert, formatDate, formatPrice, type Page, type ProductDetail as Detail, type Status } from '../api';
import { Alert } from '../components/ui/Alert';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';

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

  const load = useCallback(() => api.getProduct(id).then(setProduct).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

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

  const [modalOpen, setModalOpen] = useState(false);
  const [cfgName, setCfgName] = useState('');
  const [cfgTargetPrice, setCfgTargetPrice] = useState('');
  const [cfgTargetCurrency, setCfgTargetCurrency] = useState('EUR');
  const [cfgTargetDropPct, setCfgTargetDropPct] = useState('');

  const openConfig = () => {
    if (!product) return;
    setCfgName(product.name);
    setCfgTargetPrice(product.target_price != null ? String(product.target_price) : '');
    setCfgTargetCurrency(product.target_currency);
    setCfgTargetDropPct(product.target_drop_pct != null ? String(product.target_drop_pct) : '');
    setModalOpen(true);
  };

  const saveConfig = async () => {
    if (!cfgName.trim()) return;
    try {
      await api.updateProduct(
        id,
        cfgName.trim(),
        product?.image_url ?? null,
        cfgTargetPrice ? Number(cfgTargetPrice) : null,
        cfgTargetCurrency,
        cfgTargetDropPct ? Number(cfgTargetDropPct) : null,
      );
      setModalOpen(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteProduct = async () => {
    if (!confirm('¿Eliminar el producto y todas sus páginas?')) return;
    await api.deleteProduct(id);
    navigate('/');
  };

  if (!product) return <p className="text-slate-500">{error ?? 'Cargando…'}</p>;

  const fx = product.fx;

  const okPrices = product.pages
    .map((p) => p.last_check)
    .filter((c): c is NonNullable<typeof c> => c?.status === 'ok' && c.price != null)
    .map((c) => convert(c.price!, c.currency ?? 'EUR', fx.rates, fx.base))
    .filter((p): p is number => p != null);

  const sortedPages = [...product.pages].sort((a, b) => {
    const ca = a.last_check;
    const cb = b.last_check;
    const pa = ca?.status === 'ok' && ca.price != null ? convert(ca.price, ca.currency ?? 'EUR', fx.rates, fx.base) : null;
    const pb = cb?.status === 'ok' && cb.price != null ? convert(cb.price, cb.currency ?? 'EUR', fx.rates, fx.base) : null;
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return a.id - b.id;
  });

  return (
    <>
      <div className="space-y-6">
      <div>
        <Link to="/" className="inline-block rounded-control px-2 py-1 text-sm text-slate-600 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none">
          ← Volver
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {product.image_url && <img src={product.image_url} alt="" className="h-20 w-20 rounded object-contain" />}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={openConfig}>Configurar</Button>
            <Button variant="danger" size="sm" onClick={deleteProduct}>Eliminar</Button>
          </div>
        </div>
        <Button onClick={checkAll} disabled={checkingAll || product.pages.length === 0} loading={checkingAll}>
          {checkingAll ? 'Comprobando…' : 'Comprobar todas'}
        </Button>
      </div>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-slate-800">Alertas</h3>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <span>Precio objetivo: {product.target_price ? formatPrice(product.target_price, product.target_currency) : '—'}</span>
          <span>Bajada objetivo: {product.target_drop_pct ? `${product.target_drop_pct}%` : '—'}</span>
        </div>
      </Card>

      <Card>
        <form onSubmit={addPage} className="flex flex-wrap items-end gap-3 p-3">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} required type="url" placeholder="https://tienda.com/producto" aria-label="URL de la página" className="min-w-64 flex-[2]" />
          <Input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="Selector CSS (opcional)" aria-label="Selector CSS" className="min-w-40 flex-1 font-mono" />
          <Button type="submit" variant="primary">Añadir página</Button>
        </form>
      </Card>

      {error && <Alert>{error}</Alert>}

      {product.pages.length === 0 ? (
        <EmptyState>Añade páginas de tiendas para comparar el precio.</EmptyState>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Tienda</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                  <th className="px-3 py-2 text-right">Mejor precio</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedPages.map((page) => {
                  const c = page.last_check;
                  const busy = checking.has(page.id) || checkingAll;
                  const isOk = c?.status === 'ok' && c.price != null;
                  const isBest = isOk && page.id === product.best_page_id;
                  
                  const priceConverted = isOk ? convert(c.price!, c.currency ?? 'EUR', fx.rates, fx.base) : null;
                  const bestPrice = product.pages
                    .map(p => p.last_check?.status === 'ok' && p.last_check.price != null ? convert(p.last_check.price, p.last_check.currency ?? 'EUR', fx.rates, fx.base) : null)
                    .filter((p): p is number => p != null);
                  const min = bestPrice.length ? Math.min(...bestPrice) : null;

                  return (
                    <tr key={page.id} className={`border-t ${isBest ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2">
                        <a href={page.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">{page.store}</a>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {isOk ? formatPrice(c!.price!, c!.currency ?? 'EUR') : '—'}
                        {isBest && okPrices.length > 1 && <span className="ml-2 rounded bg-green-600 px-1.5 py-0.5 text-xs text-white">Mejor</span>}
                        {c?.currency != null && c.currency !== fx.base && <div className="text-xs text-slate-400">≈ {priceConverted != null ? formatPrice(priceConverted, fx.base) : 'tasa desconocida'}</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {isOk && min != null && priceConverted != null && priceConverted > min
                          ? `+${formatPrice(priceConverted - min, fx.base)}`
                          : ''}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {page.best_price != null ? (
                          <>
                            <div className="font-semibold text-green-700">{formatPrice(page.best_price, page.best_currency ?? 'EUR')}</div>
                            {page.best_price_at && <div className="text-xs text-slate-500">{formatDate(page.best_price_at)}</div>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {busy ? 'Comprobando…' : c ? <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <Button variant="secondary" size="sm" onClick={() => checkOne(page.id)} disabled={busy}>Comprobar</Button>
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

    <Modal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      title="Configurar producto"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={saveConfig}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nombre"
          value={cfgName}
          onChange={(e) => setCfgName(e.target.value)}
          placeholder="Nombre del producto"
        />
        <Input
          label="Precio objetivo"
          type="number"
          step="0.01"
          min="0"
          value={cfgTargetPrice}
          onChange={(e) => setCfgTargetPrice(e.target.value)}
          placeholder="—"
        />
        <Select
          label="Moneda del objetivo"
          value={cfgTargetCurrency}
          onChange={(e) => setCfgTargetCurrency(e.target.value)}
          options={[
            { value: 'EUR', label: 'EUR (€)' },
            { value: 'USD', label: 'USD ($)' },
            { value: 'GBP', label: 'GBP (£)' },
          ]}
        />
        <Input
          label="Bajada objetivo (%)"
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={cfgTargetDropPct}
          onChange={(e) => setCfgTargetDropPct(e.target.value)}
          placeholder="—"
        />
      </div>
    </Modal>
    </>
  );
}