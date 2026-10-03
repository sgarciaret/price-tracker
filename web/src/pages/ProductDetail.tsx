import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, formatPrice, type Page, type ProductDetail as Detail, type Status } from '../api';

const STATUS: Record<Status, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'bg-green-100 text-green-800' },
  not_found: { label: 'Precio no detectado', cls: 'bg-amber-100 text-amber-800' },
  blocked: { label: 'Tienda bloquea el acceso', cls: 'bg-red-100 text-red-800' },
  error: { label: 'Error', cls: 'bg-slate-200 text-slate-700' },
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
      <div className="flex items-center gap-4">
        {product.image_url && <img src={product.image_url} alt="" className="h-20 w-20 rounded object-contain" />}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <div className="space-x-3 text-sm">
            <button onClick={renameProduct} className="text-blue-600 hover:underline">Renombrar</button>
            <button onClick={deleteProduct} className="text-red-600 hover:underline">Eliminar</button>
          </div>
        </div>
        <button
          onClick={checkAll}
          disabled={checkingAll || product.pages.length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {checkingAll ? 'Comprobando…' : 'Comprobar todas'}
        </button>
      </div>

      <form onSubmit={addPage} className="flex flex-wrap gap-2 rounded-lg border bg-white p-3">
        <input
          value={url} onChange={(e) => setUrl(e.target.value)} required type="url"
          placeholder="https://tienda.com/producto" className="min-w-64 flex-[2] rounded-md border px-3 py-2"
        />
        <input
          value={selector} onChange={(e) => setSelector(e.target.value)}
          placeholder="Selector CSS (opcional)" className="min-w-40 flex-1 rounded-md border px-3 py-2 font-mono text-sm"
        />
        <button className="rounded-md bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-900">Añadir página</button>
      </form>

      {error && <p className="text-red-600">{error}</p>}

      {product.pages.length === 0 ? (
        <p className="text-slate-500">Añade páginas de tiendas para comparar el precio.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
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
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                          {c.error_msg && <div className="mt-1 max-w-xs text-xs text-slate-500">{c.error_msg}</div>}
                          {c.method && <div className="mt-1 text-xs text-slate-400">vía {c.method}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400">Sin comprobar</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c ? formatDate(c.checked_at) : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right space-x-2">
                      <button onClick={() => checkOne(page.id)} disabled={busy} className="text-blue-600 hover:underline disabled:opacity-40">Comprobar</button>
                      <button onClick={() => editSelector(page)} className="text-slate-600 hover:underline">Selector</button>
                      <button onClick={() => removePage(page.id)} className="text-red-600 hover:underline">Quitar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
