import type { SupabaseClient } from '@supabase/supabase-js';
import type { CheckRow, PageRow, ProductRow, Repo } from './repo.js';
import { getSupabase } from './supabase.js';

/** PostgREST devuelve `timestamptz` como `2026-10-06T12:00:00.123+00:00`; se normaliza a ISO con `Z`. */
const iso = (value: string) => new Date(value).toISOString();

const toProduct = (r: ProductRow): ProductRow => ({ ...r, created_at: iso(r.created_at) });
const toPage = (r: PageRow): PageRow => ({ ...r, created_at: iso(r.created_at) });
const toCheck = (r: CheckRow): CheckRow => ({ ...r, checked_at: iso(r.checked_at) });

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
    async getProduct(id) {
      const row = unwrap<ProductRow | null>(await from('products').select('*').eq('id', id).maybeSingle());
      return row ? toProduct(row) : undefined;
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
