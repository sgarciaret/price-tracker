import type { CheckRow, PageRow, ProductRow, Repo } from '../src/repo.js';

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
    async getProduct(id) {
      return products.find((p) => p.id === id);
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
