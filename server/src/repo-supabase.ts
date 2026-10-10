import type { SupabaseClient } from '@supabase/supabase-js';
import type { CheckRow, PageRow, ProductDetailRow, ProductRow, ProductSummaryRow, Repo } from './repo.js';
import { getSupabase } from './supabase.js';

/** PostgREST devuelve `timestamptz` como `2026-10-06T12:00:00.123+00:00`; se normaliza a ISO con `Z`. */
const iso = (value: string) => new Date(value).toISOString();

const toProduct = (r: ProductRow): ProductRow => ({
  id: r.id,
  name: r.name,
  image_url: r.image_url,
  created_at: iso(r.created_at),
});
const toPage = (r: PageRow): PageRow => ({
  id: r.id,
  product_id: r.product_id,
  url: r.url,
  store: r.store,
  css_selector: r.css_selector,
  created_at: iso(r.created_at),
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
export function createSupabaseRepo(client: () => SupabaseClient = getSupabase): Repo {
  const from = (table: 'products' | 'pages' | 'price_checks') => client().from(table);

  return {
    async listProducts() {
      const rows = unwrap<ProductRow[]>(
        await from('products').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }),
      );
      return rows.map(toProduct);
    },
    async listProductsSummary(): Promise<ProductSummaryRow[]> {
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
        const best = ok.sort((a, b) => a.last_check.price - b.last_check.price)[0];

        let last_check_at: string | null = null;
        for (const x of pages) {
          const checkedAt = x.last_check?.checked_at ?? null;
          if (checkedAt !== null && (last_check_at === null || checkedAt > last_check_at)) {
            last_check_at = checkedAt;
          }
        }

        return {
          ...toProduct(row),
          page_count: pages.length,
          last_check_at,
          best: best ? { price: best.last_check.price, currency: best.last_check.currency, store: best.store } : null,
        };
      });
    },
    async getProduct(id) {
      const row = unwrap<ProductRow | null>(await from('products').select('*').eq('id', id).maybeSingle());
      return row ? toProduct(row) : undefined;
    },
    async getProductDetail(id: number): Promise<ProductDetailRow | undefined> {
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

      return {
        ...toProduct(row),
        pages,
      };
    },
    async createProduct(name, imageUrl) {
      return toProduct(unwrap<ProductRow>(await from('products').insert({ name, image_url: imageUrl }).select().single()));
    },
    async updateProduct(id, name, imageUrl) {
      const row = unwrap<ProductRow | null>(
        await from('products').update({ name, image_url: imageUrl }).eq('id', id).select().maybeSingle(),
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
    async insertCheck(c) {
      return toCheck(
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
    },
    async setImageIfEmpty(productId, imageUrl) {
      unwrap(
        await from('products')
          .update({ image_url: imageUrl })
          .eq('id', productId)
          .or('image_url.is.null,image_url.eq.'),
      );
    },
  };
}
