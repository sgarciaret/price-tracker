export type Status = 'ok' | 'not_found' | 'blocked' | 'error';

export interface ProductRow {
  id: number;
  name: string;
  image_url: string | null;
  created_at: string;
  best_price: number | null;
  best_price_at: string | null;
  best_currency: string | null;
  target_price: number | null;
  target_currency: string;
  target_drop_pct: number | null;
}
export interface PageRow {
  id: number;
  product_id: number;
  url: string;
  store: string;
  css_selector: string | null;
  created_at: string;
  best_price: number | null;
  best_price_at: string | null;
  best_currency: string | null;
}
export interface CheckRow {
  id: number;
  page_id: number;
  price: number | null;
  currency: string | null;
  status: Status;
  error_msg: string | null;
  method: string | null;
  checked_at: string;
}

export interface ProductSummaryRow extends ProductRow {
  page_count: number;
  last_check_at: string | null;
  stores: string[];
  last_status: Status | null;
  unread_alerts: number;
  best: {
    price: number;
    currency: string | null;
    store: string;
  } | null;
}

export interface ProductDetailRow extends ProductRow {
  pages: Array<PageRow & { last_check: CheckRow | null }>;
  fx: { base: string; rates: Record<string, number> };
  best_page_id: number | null;
}

export interface NewCheck {
  pageId: number;
  price: number | null;
  currency: string | null;
  status: Status;
  errorMsg: string | null;
  method: string | null;
}

export type AlertKind = 'target' | 'drop';
export interface AlertRow {
  id: number;
  product_id: number;
  page_id: number | null;
  kind: AlertKind;
  price: number;
  currency: string | null;
  price_converted: number;
  comparison_currency: string;
  baseline_price: number | null;
  baseline_currency: string | null;
  baseline_converted: number | null;
  threshold: number;
  threshold_currency: string | null;
  created_at: string;
  read_at: string | null;
}

/** Capa de datos que usan las rutas; los tests inyectan una implementación falsa. */
export interface Repo {
  /** ORDER BY created_at DESC, id DESC */
  listProducts(): Promise<ProductRow[]>;
  listProductsSummary(): Promise<ProductSummaryRow[]>;
  getProduct(id: number): Promise<ProductRow | undefined>;
  getProductDetail(id: number): Promise<ProductDetailRow | undefined>;
  createProduct(name: string, imageUrl: string | null): Promise<ProductRow>;
  updateProduct(
    id: number,
    name: string,
    imageUrl: string | null,
    targetPrice?: number | null,
    targetCurrency?: string,
    targetDropPct?: number | null,
  ): Promise<ProductRow | undefined>;
  deleteProduct(id: number): Promise<void>;
  /** ORDER BY id */
  listPages(productId: number): Promise<PageRow[]>;
  getPage(id: number): Promise<PageRow | undefined>;
  createPage(productId: number, url: string, store: string, cssSelector: string | null): Promise<PageRow>;
  updatePage(id: number, cssSelector: string | null): Promise<PageRow | undefined>;
  deletePage(id: number): Promise<void>;
  /** ORDER BY checked_at DESC, id DESC LIMIT 1 */
  lastCheck(pageId: number): Promise<CheckRow | null>;
  /** ORDER BY checked_at DESC, id DESC LIMIT n */
  lastChecks(pageId: number, limit: number): Promise<CheckRow[]>;
  insertCheck(c: NewCheck): Promise<CheckRow>;
  setImageIfEmpty(productId: number, imageUrl: string): Promise<void>;
  // Alerts
  listAlerts(limit?: number): Promise<AlertRow[]>;
  insertAlert(alert: Omit<AlertRow, 'id' | 'created_at'>): Promise<AlertRow>;
  hasRecentAlert(productId: number, kind: AlertKind, hours: number): Promise<boolean>;
  markAlertRead(id: number): Promise<void>;
  markAllAlertsRead(): Promise<void>;
}