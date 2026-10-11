export type Status = 'ok' | 'not_found' | 'blocked' | 'error';

export interface ProductRow { id: number; name: string; image_url: string | null; created_at: string; best_price: number | null; best_price_at: string | null }
export interface PageRow { id: number; product_id: number; url: string; store: string; css_selector: string | null; created_at: string }
export interface CheckRow {
  id: number; page_id: number; price: number | null; currency: string | null;
  status: Status; error_msg: string | null; method: string | null; checked_at: string;
}

export interface ProductSummaryRow extends ProductRow {
  page_count: number;
  last_check_at: string | null;
  best: {
    price: number;
    currency: string | null;
    store: string;
  } | null;
}

export interface ProductDetailRow extends ProductRow {
  pages: Array<PageRow & { last_check: CheckRow | null }>;
}

export interface NewCheck {
  pageId: number;
  price: number | null;
  currency: string | null;
  status: Status;
  errorMsg: string | null;
  method: string | null;
}

/** Capa de datos que usan las rutas; los tests inyectan una implementación falsa. */
export interface Repo {
  /** ORDER BY created_at DESC, id DESC */
  listProducts(): Promise<ProductRow[]>;
  listProductsSummary(): Promise<ProductSummaryRow[]>;
  getProduct(id: number): Promise<ProductRow | undefined>;
  getProductDetail(id: number): Promise<ProductDetailRow | undefined>;
  createProduct(name: string, imageUrl: string | null): Promise<ProductRow>;
  updateProduct(id: number, name: string, imageUrl: string | null): Promise<ProductRow | undefined>;
  deleteProduct(id: number): Promise<void>;
  /** ORDER BY id */
  listPages(productId: number): Promise<PageRow[]>;
  getPage(id: number): Promise<PageRow | undefined>;
  createPage(productId: number, url: string, store: string, cssSelector: string | null): Promise<PageRow>;
  updatePage(id: number, cssSelector: string | null): Promise<PageRow | undefined>;
  deletePage(id: number): Promise<void>;
  /** ORDER BY checked_at DESC, id DESC LIMIT 1 */
  lastCheck(pageId: number): Promise<CheckRow | null>;
  insertCheck(c: NewCheck): Promise<CheckRow>;
  setImageIfEmpty(productId: number, imageUrl: string): Promise<void>;
}
