import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AlertRow,
  CheckRow,
  PageRow,
  ProductDetailRow,
  ProductRow,
  ProductSummaryRow,
  Repo,
  Status,
} from './repo.js';
import { getSupabase } from './supabase.js';
import { convert, pickBest, type FxPort } from './fx.js';

/** PostgREST devuelve `timestamptz` como `2026-10-06T12:00:00.123+00:00`; se normaliza a ISO con `Z`. */
const iso = (value: string) => new Date(value).toISOString();

const toProduct = (r: ProductRow): ProductRow => ({
  id: r.id,
  name: r.name,
  image_url: r.image_url,
  created_at: iso(r.created_at),
  best_price: r.best_price,
  best_price_at: r.best_price_at ? iso(r.best_price_at) : null,
  best_currency: r.best_currency,
  target_price: r.target_price,
  target_currency: r.target_currency,
  target_drop_pct: r.target_drop_pct,
});
const toPage = (r: PageRow): PageRow => ({
  id: r.id,
  product_id: r.product_id,
  url: r.url,
  store: r.store,
  css_selector: r.css_selector,
  created_at: iso(r.created_at),
  best_price: r.best_price,
  best_price_at: r.best_price_at ? iso(r.best_price_at) : null,
  best_currency: r.best_currency,
});
const toCheck = (r: CheckRow): CheckRow => ({
  id: r.id,
  page_id: r.page_id,
  price: r.price,
  currency: r.currency,
  status: r.status,
  error_msg: r.error_msg,
  method: r.method,
  checked_at: iso(r.checked_at),
});
const toAlert = (r: AlertRow): AlertRow => ({
  id: r.id,
  product_id: r.product_id,
  page_id: r.page_id,
  kind: r.kind,
  price: r.price,
  currency: r.currency,
  price_converted: r.price_converted,
  comparison_currency: r.comparison_currency,
  baseline_price: r.baseline_price,
  baseline_currency: r.baseline_currency,
  baseline_converted: r.baseline_converted,
  threshold: r.threshold,
  threshold_currency: r.threshold_currency,
  created_at: iso(r.created_at),
  read_at: r.read_at ? iso(r.read_at) : null,
});

interface RawPageRow extends PageRow {
  price_checks?: CheckRow[];
}
interface RawProductRow extends ProductRow {
  pages?: RawPageRow[];
}

function getLastCheck(checks?: CheckRow[]): CheckRow | null {
  if (!checks || checks.length === 0) return null;
  const sorted = [...checks].sort(
    (a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime() || b.id - a.id,
  );
  return toCheck(sorted[0]);
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data as T;
}

/** Implementación de `Repo` sobre Supabase (service role). */
export function createSupabaseRepo(
  client: () => SupabaseClient = getSupabase,
  fx: FxPort = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1 } }) },
): Repo {
  const from = (table: 'products' | 'pages' | 'price_checks' | 'price_alerts') => client().from(table);

  return {
    async listProducts() {
      const rows = unwrap<ProductRow[]>(
        await from('products').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }),
      );
      return rows.map(toProduct);
    },
    async listProductsSummary(): Promise<ProductSummaryRow[]> {
      const rates = await fx.getRates();
      const rows = unwrap<RawProductRow[]>(
        await from('products')
          .select('*, pages(*, price_checks(*))')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      );

      return rows.map((row) => {
        const pages = (row.pages ?? [])
          .map((p) => ({
            ...toPage(p),
            last_check: getLastCheck(p.price_checks),
          }))
          .sort((a, b) => a.id - b.id);

        const ok = pages.filter(
          (x): x is typeof x & { last_check: CheckRow & { price: number } } =>
            x.last_check?.status === 'ok' && x.last_check.price != null,
        );

        // Mejor precio comparando convertidos
        const candidates = ok.map((p) => ({
          price: p.last_check.price,
          currency: p.last_check.currency,
          store: p.store,
          page_id: p.id,
        }));
        const { candidate: best, converted: bestConverted, currency: bestCurrency } = pickBest(
          candidates,
          rates.rates,
          rates.base,
        );

        let last_check_at: string | null = null;
        let last_status: Status | null = null;
        for (const x of pages) {
          const checkedAt = x.last_check?.checked_at ?? null;
          const status = x.last_check?.status ?? null;
          if (checkedAt !== null && (last_check_at === null || checkedAt > last_check_at)) {
            last_check_at = checkedAt;
            last_status = status;
          }
        }

        const stores = [...new Set(pages.map((p) => p.store))];

        return {
          ...toProduct(row),
          page_count: pages.length,
          last_check_at,
          stores,
          last_status,
          unread_alerts: 0, // se llena abajo con una query separada si hace falta
          best: best ? { price: bestConverted!, currency: bestCurrency, store: best.store } : null,
        };
      });
    },
    async getProduct(id) {
      const row = unwrap<ProductRow | null>(await from('products').select('*').eq('id', id).maybeSingle());
      return row ? toProduct(row) : undefined;
    },
    async getProductDetail(id: number): Promise<ProductDetailRow | undefined> {
      const rates = await fx.getRates();
      const row = unwrap<RawProductRow | null>(
        await from('products')
          .select('*, pages(*, price_checks(*))')
          .eq('id', id)
          .maybeSingle(),
      );
      if (!row) return undefined;

      const pages = (row.pages ?? [])
        .map((p) => ({
          ...toPage(p),
          last_check: getLastCheck(p.price_checks),
        }))
        .sort((a, b) => a.id - b.id);

      // Mejor página comparando convertidos
      const candidates = pages
        .filter((p): p is typeof p & { last_check: CheckRow & { price: number } } => p.last_check?.status === 'ok' && p.last_check.price != null)
        .map((p) => ({
          price: p.last_check.price,
          currency: p.last_check.currency,
          page_id: p.id,
        }));
      const { candidate: bestPage } = pickBest(candidates, rates.rates, rates.base);

      return {
        ...toProduct(row),
        pages,
        fx: { base: rates.base, rates: rates.rates },
        best_page_id: bestPage?.page_id ?? null,
      };
    },
    async createProduct(name, imageUrl) {
      return toProduct(
        unwrap<ProductRow>(
          await from('products').insert({ name, image_url: imageUrl, target_currency: 'EUR' }).select().single(),
        ),
      );
    },
    async updateProduct(id, name, imageUrl, targetPrice, targetCurrency, targetDropPct) {
      const updates: Partial<ProductRow> = { name, image_url: imageUrl };
      if (targetPrice !== undefined) updates.target_price = targetPrice;
      if (targetCurrency !== undefined) updates.target_currency = targetCurrency;
      if (targetDropPct !== undefined) updates.target_drop_pct = targetDropPct;
      const row = unwrap<ProductRow | null>(
        await from('products').update(updates).eq('id', id).select().maybeSingle(),
      );
      return row ? toProduct(row) : undefined;
    },
    async deleteProduct(id) {
      unwrap(await from('products').delete().eq('id', id));
    },
    async listPages(productId) {
      const rows = unwrap<PageRow[]>(await from('pages').select('*').eq('product_id', productId).order('id'));
      return rows.map(toPage);
    },
    async getPage(id) {
      const row = unwrap<PageRow | null>(await from('pages').select('*').eq('id', id).maybeSingle());
      return row ? toPage(row) : undefined;
    },
    async createPage(productId, url, store, cssSelector) {
      return toPage(
        unwrap<PageRow>(
          await from('pages').insert({ product_id: productId, url, store, css_selector: cssSelector }).select().single(),
        ),
      );
    },
    async updatePage(id, cssSelector) {
      const row = unwrap<PageRow | null>(
        await from('pages').update({ css_selector: cssSelector }).eq('id', id).select().maybeSingle(),
      );
      return row ? toPage(row) : undefined;
    },
    async deletePage(id) {
      unwrap(await from('pages').delete().eq('id', id));
    },
    async lastCheck(pageId) {
      const row = unwrap<CheckRow | null>(
        await from('price_checks')
          .select('*')
          .eq('page_id', pageId)
          .order('checked_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      return row ? toCheck(row) : null;
    },
    async lastChecks(pageId, limit) {
      const rows = unwrap<CheckRow[]>(
        await from('price_checks')
          .select('*')
          .eq('page_id', pageId)
          .order('checked_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit),
      );
      return rows.map(toCheck);
    },
    async insertCheck(c) {
      const check = toCheck(
        unwrap<CheckRow>(
          await from('price_checks')
            .insert({
              page_id: c.pageId,
              price: c.price,
              currency: c.currency,
              status: c.status,
              error_msg: c.errorMsg,
              method: c.method,
            })
            .select()
            .single(),
        ),
      );

      // Actualiza el mejor precio del producto y de la página comparando convertidos
      if (c.price != null) {
        const page = unwrap<PageRow | null>(await from('pages').select('*').eq('id', c.pageId).maybeSingle());
        if (page) {
          const product = unwrap<ProductRow | null>(
            await from('products').select('*').eq('id', page.product_id).maybeSingle(),
          );
          const rates = await fx.getRates();
          const newConverted = convert(c.price, c.currency, rates.rates, rates.base);

          // --- Mejor precio de la PÁGINA: solo compara contra su propio histórico ---
          if (newConverted != null) {
            if (page.best_price == null || newConverted < page.best_price) {
              unwrap(
                await from('pages')
                  .update({ best_price: newConverted, best_price_at: check.checked_at, best_currency: c.currency })
                  .eq('id', c.pageId),
              );
            } else if (newConverted === page.best_price) {
              unwrap(await from('pages').update({ best_price_at: check.checked_at }).eq('id', c.pageId));
            }
          }

          // --- Mejor precio del PRODUCTO: compara contra su propio histórico ---
          if (product && newConverted != null) {
            if (product.best_price == null || newConverted < product.best_price) {
              unwrap(
                await from('products')
                  .update({ best_price: newConverted, best_price_at: check.checked_at, best_currency: c.currency })
                  .eq('id', page.product_id),
              );
            } else if (newConverted === product.best_price) {
              unwrap(
                await from('products')
                  .update({ best_price_at: check.checked_at })
                  .eq('id', page.product_id),
              );
            }
          }
        }
      }

      return check;
    },
    async setImageIfEmpty(productId, imageUrl) {
      unwrap(
        await from('products')
          .update({ image_url: imageUrl })
          .eq('id', productId)
          .or('image_url.is.null,image_url.eq.'),
      );
    },
    // Alerts
    async listAlerts(limit = 100): Promise<AlertRow[]> {
      const rows = unwrap<AlertRow[]>(
        await from('price_alerts')
          .select('*, products(name)')
          .order('created_at', { ascending: false })
          .limit(limit),
      );
      return rows.map((r) => ({ ...toAlert(r), product_name: (r as AlertRow & { products?: { name: string } }).products?.name }));
    },
    async insertAlert(alert: Omit<AlertRow, 'id' | 'created_at'>): Promise<AlertRow> {
      const row = unwrap<AlertRow>(
        await from('price_alerts')
          .insert({
            product_id: alert.product_id,
            page_id: alert.page_id,
            kind: alert.kind,
            price: alert.price,
            currency: alert.currency,
            price_converted: alert.price_converted,
            comparison_currency: alert.comparison_currency,
            baseline_price: alert.baseline_price,
            baseline_currency: alert.baseline_currency,
            baseline_converted: alert.baseline_converted,
            threshold: alert.threshold,
            threshold_currency: alert.threshold_currency,
          })
          .select()
          .single(),
      );
      return toAlert(row);
    },
    async hasRecentAlert(productId: number, kind: 'target' | 'drop', hours: number): Promise<boolean> {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await from('price_alerts')
        .select('id')
        .eq('product_id', productId)
        .eq('kind', kind)
        .gte('created_at', since)
        .limit(1);
      if (error) throw new Error(`Supabase: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
    async markAlertRead(id: number): Promise<void> {
      unwrap(await from('price_alerts').update({ read_at: new Date().toISOString() }).eq('id', id));
    },
    async markAllAlertsRead(): Promise<void> {
      unwrap(await from('price_alerts').update({ read_at: new Date().toISOString() }).is('read_at', null));
    },
  };
}