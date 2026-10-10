import type { CheckRow, PageRow, ProductDetailRow, ProductRow, ProductSummaryRow, Repo } from '../src/repo.js';

/** `Repo` en memoria para los tests: sin red ni base de datos. */
export function createFakeRepo(): Repo {
  const products: ProductRow[] = [];
  const pages: PageRow[] = [];
  const checks: CheckRow[] = [];
  let nextId = 1;
  const now = () => new Date().toISOString();

  return {
    async listProducts() {
      return [...products].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    },
    async listProductsSummary(): Promise<ProductSummaryRow[]> {
      const list = await this.listProducts();
      return Promise.all(
        list.map(async (p) => {
          const pPages = await this.listPages(p.id);
          const pagesWithLast = await Promise.all(
            pPages.map(async (page) => ({
              ...page,
              last_check: await this.lastCheck(page.id),
            })),
          );
          const ok = pagesWithLast.filter((x) => x.last_check?.status === 'ok' && x.last_check.price != null);
          const best = ok.sort((a, b) => a.last_check!.price! - b.last_check!.price!)[0];
          let last_check_at: string | null = null;
          for (const x of pagesWithLast) {
            const checkedAt = x.last_check?.checked_at ?? null;
            if (checkedAt !== null && (last_check_at === null || checkedAt > last_check_at)) {
              last_check_at = checkedAt;
            }
          }
          return {
            ...p,
            page_count: pagesWithLast.length,
            last_check_at,
            best: best ? { price: best.last_check!.price!, currency: best.last_check!.currency, store: best.store } : null,
          };
        }),
      );
    },
    async getProduct(id) {
      return products.find((p) => p.id === id);
    },
    async getProductDetail(id: number): Promise<ProductDetailRow | undefined> {
      const product = await this.getProduct(id);
      if (!product) return undefined;
      const pPages = await this.listPages(id);
      const pagesWithLast = await Promise.all(
        pPages.map(async (page) => ({
          ...page,
          last_check: await this.lastCheck(page.id),
        })),
      );
      return {
        ...product,
        pages: pagesWithLast,
      };
    },
    async createProduct(name, imageUrl) {
      const row: ProductRow = { id: nextId++, name, image_url: imageUrl, created_at: now() };
      products.push(row);
      return { ...row };
    },
    async updateProduct(id, name, imageUrl) {
      const row = products.find((p) => p.id === id);
      if (!row) return undefined;
      Object.assign(row, { name, image_url: imageUrl });
      return { ...row };
    },
    async deleteProduct(id) {
      const i = products.findIndex((p) => p.id === id);
      if (i >= 0) products.splice(i, 1);
      for (const page of pages.filter((p) => p.product_id === id)) await this.deletePage(page.id);
    },
    async listPages(productId) {
      return pages.filter((p) => p.product_id === productId).sort((a, b) => a.id - b.id);
    },
    async getPage(id) {
      return pages.find((p) => p.id === id);
    },
    async createPage(productId, url, store, cssSelector) {
      const row: PageRow = { id: nextId++, product_id: productId, url, store, css_selector: cssSelector, created_at: now() };
      pages.push(row);
      return { ...row };
    },
    async updatePage(id, cssSelector) {
      const row = pages.find((p) => p.id === id);
      if (!row) return undefined;
      row.css_selector = cssSelector;
      return { ...row };
    },
    async deletePage(id) {
      const i = pages.findIndex((p) => p.id === id);
      if (i >= 0) pages.splice(i, 1);
      for (let j = checks.length - 1; j >= 0; j--) if (checks[j].page_id === id) checks.splice(j, 1);
    },
    async lastCheck(pageId) {
      const own = checks
        .filter((c) => c.page_id === pageId)
        .sort((a, b) => b.checked_at.localeCompare(a.checked_at) || b.id - a.id);
      return own[0] ?? null;
    },
    async insertCheck(c) {
      const row: CheckRow = {
        id: nextId++,
        page_id: c.pageId,
        price: c.price,
        currency: c.currency,
        status: c.status,
        error_msg: c.errorMsg,
        method: c.method,
        checked_at: now(),
      };
      checks.push(row);
      return { ...row };
    },
    async setImageIfEmpty(productId, imageUrl) {
      const row = products.find((p) => p.id === productId);
      if (row && !row.image_url) row.image_url = imageUrl;
    },
  };
}
