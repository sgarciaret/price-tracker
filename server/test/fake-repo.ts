import type {
  AlertRow,
  CheckRow,
  PageRow,
  ProductDetailRow,
  ProductRow,
  ProductSummaryRow,
  Repo,
  Status,
} from '../src/repo.js';
import { convert, pickBest } from '../src/fx.js';

/** `Repo` en memoria para los tests: sin red ni base de datos. */
export function createFakeRepo(): Repo {
  const products: ProductRow[] = [];
  const pages: PageRow[] = [];
  const checks: CheckRow[] = [];
  const alerts: AlertRow[] = [];
  let nextId = 1;
  let nextAlertId = 1;
  const now = () => new Date().toISOString();

  const testRates: Record<string, number> = { EUR: 1, USD: 1.1, GBP: 0.85 };
  const testBase = 'EUR';

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

          // Mejor precio comparando convertidos
          const candidates = ok.map((p) => ({
            price: p.last_check!.price!,
            currency: p.last_check!.currency,
            store: p.store,
            page_id: p.id,
          }));
          const { candidate: best, converted: bestConverted, currency: bestCurrency } = pickBest(
            candidates,
            testRates,
            testBase,
          );

          let last_check_at: string | null = null;
          let last_status: Status | null = null;
          for (const x of pagesWithLast) {
            const checkedAt = x.last_check?.checked_at ?? null;
            const status = x.last_check?.status ?? null;
            if (checkedAt !== null && (last_check_at === null || checkedAt > last_check_at)) {
              last_check_at = checkedAt;
              last_status = status;
            }
          }

          const stores = [...new Set(pagesWithLast.map((p) => p.store))];

          // Contar alertas no leídas
          const unread = alerts.filter((a) => a.product_id === p.id && !a.read_at).length;

          return {
            ...p,
            page_count: pagesWithLast.length,
            last_check_at,
            stores,
            last_status,
            unread_alerts: unread,
            best: best ? { price: bestConverted!, currency: bestCurrency, store: best.store } : null,
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

      // Mejor página comparando convertidos
      const candidates = pagesWithLast
        .filter((p): p is typeof p & { last_check: CheckRow & { price: number } } => p.last_check?.status === 'ok' && p.last_check.price != null)
        .map((p) => ({
          price: p.last_check.price,
          currency: p.last_check.currency,
          page_id: p.id,
        }));
      const { candidate: bestPage } = pickBest(candidates, testRates, testBase);

      return {
        ...product,
        pages: pagesWithLast,
        fx: { base: testBase, rates: testRates },
        best_page_id: bestPage?.page_id ?? null,
      };
    },
    async createProduct(name, imageUrl) {
      const row: ProductRow = {
        id: nextId++,
        name,
        image_url: imageUrl,
        created_at: now(),
        best_price: null,
        best_price_at: null,
        best_currency: null,
        target_price: null,
        target_currency: 'EUR',
        target_drop_pct: null,
      };
      products.push(row);
      return { ...row };
    },
    async updateProduct(id, name, imageUrl, targetPrice, targetCurrency, targetDropPct) {
      const row = products.find((p) => p.id === id);
      if (!row) return undefined;
      Object.assign(row, { name, image_url: imageUrl });
      if (targetPrice !== undefined) row.target_price = targetPrice;
      if (targetCurrency !== undefined) row.target_currency = targetCurrency;
      if (targetDropPct !== undefined) row.target_drop_pct = targetDropPct;
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
      const row: PageRow = {
        id: nextId++,
        product_id: productId,
        url,
        store,
        css_selector: cssSelector,
        created_at: now(),
        best_price: null,
        best_price_at: null,
        best_currency: null,
      };
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
    async lastChecks(pageId, limit) {
      return checks
        .filter((c) => c.page_id === pageId)
        .sort((a, b) => b.checked_at.localeCompare(a.checked_at) || b.id - a.id)
        .slice(0, limit);
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

      // Actualiza el mejor precio del producto y de la página comparando convertidos
      if (c.price != null) {
        const page = pages.find((p) => p.id === c.pageId);
        if (page) {
          const product = products.find((p) => p.id === page.product_id);
          const newConverted = convert(c.price, c.currency, testRates, testBase);

          // --- Mejor precio de la PÁGINA: solo compara contra su propio histórico ---
          if (newConverted != null) {
            if (page.best_price == null || newConverted < page.best_price) {
              page.best_price = newConverted;
              page.best_price_at = row.checked_at;
              page.best_currency = c.currency;
            } else if (newConverted === page.best_price) {
              page.best_price_at = row.checked_at;
            }
          }

          // --- Mejor precio del PRODUCTO: compara contra su propio histórico ---
          if (product && newConverted != null) {
            if (product.best_price == null || newConverted < product.best_price) {
              product.best_price = newConverted;
              product.best_price_at = row.checked_at;
              product.best_currency = c.currency;
            } else if (newConverted === product.best_price) {
              product.best_price_at = row.checked_at;
            }
          }
        }
      }

      return { ...row };
    },
    async setImageIfEmpty(productId, imageUrl) {
      const row = products.find((p) => p.id === productId);
      if (row && !row.image_url) row.image_url = imageUrl;
    },
    // Alerts
    async listAlerts(limit = 100): Promise<AlertRow[]> {
      return alerts
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
        .map((a) => ({ ...a }));
    },
    async insertAlert(alert: Omit<AlertRow, 'id' | 'created_at'>): Promise<AlertRow> {
      const row: AlertRow = { ...alert, id: nextAlertId++, created_at: now() };
      alerts.push(row);
      return { ...row };
    },
    async hasRecentAlert(productId: number, kind: 'target' | 'drop', hours: number): Promise<boolean> {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      return alerts.some(
        (a) => a.product_id === productId && a.kind === kind && a.created_at >= since,
      );
    },
    async markAlertRead(id: number): Promise<void> {
      const a = alerts.find((x) => x.id === id);
      if (a) a.read_at = now();
    },
    async markAllAlertsRead(): Promise<void> {
      for (const a of alerts) if (!a.read_at) a.read_at = now();
    },
  };
}