import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? resolve(here, '../../data/prices.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  store TEXT NOT NULL,
  css_selector TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pages_product ON pages(product_id);

CREATE TABLE IF NOT EXISTS price_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  price REAL,
  currency TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok','not_found','blocked','error')),
  error_msg TEXT,
  method TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checks_page ON price_checks(page_id, checked_at DESC);
`);

export type Status = 'ok' | 'not_found' | 'blocked' | 'error';

export interface ProductRow { id: number; name: string; image_url: string | null; created_at: string }
export interface PageRow { id: number; product_id: number; url: string; store: string; css_selector: string | null; created_at: string }
export interface CheckRow {
  id: number; page_id: number; price: number | null; currency: string | null;
  status: Status; error_msg: string | null; method: string | null; checked_at: string;
}
