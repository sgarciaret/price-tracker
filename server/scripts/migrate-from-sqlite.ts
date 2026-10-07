/**
 * Copia products, pages y price_checks de data/prices.db a Supabase preservando ids y fechas.
 *
 *   npm run migrate:sqlite -w server            (usa data/prices.db)
 *   npm run migrate:sqlite -w server -- <ruta>  (otra base SQLite)
 *
 * Para la app antes de ejecutarlo. Pasos: abre la base en solo lectura, hace una copia de
 * seguridad junto a ella, comprueba que las tablas de Supabase están vacías, inserta cada tabla
 * en una sola petición (PostgREST la ejecuta en una transacción), ajusta las secuencias con
 * reset_sequences() y compara los conteos. data/prices.db no se modifica ni se borra.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { loadDotenv } from '../src/env.js';
import { getSupabase } from '../src/supabase.js';

const TABLES = ['products', 'pages', 'price_checks'] as const;
type Table = (typeof TABLES)[number];
const DATE_COLUMNS: Record<Table, string> = { products: 'created_at', pages: 'created_at', price_checks: 'checked_at' };

/** SQLite guarda `datetime('now')` como `YYYY-MM-DD HH:MM:SS` en UTC: se pasa a ISO con `Z`. */
export function sqliteDateToIso(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z?$/.exec(value);
  if (!m) throw new Error(`Fecha de SQLite con formato inesperado: ${value}`);
  return new Date(`${m[1]}T${m[2]}Z`).toISOString();
}

loadDotenv();
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) {
    console.error(`Falta ${name} en el .env.`);
    process.exit(1);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.argv[2] ?? resolve(here, '../../data/prices.db'));
if (!existsSync(dbPath)) {
  console.error(`No existe la base SQLite: ${dbPath}`);
  process.exit(1);
}

console.log('Asegúrate de que la app está parada: la base no debe cambiar durante la migración.');
const sqlite = new DatabaseSync(dbPath, { readOnly: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = dbPath.replace(/\.db$/, '') + `.backup-${stamp}.db`;
await backup(sqlite, backupPath);
console.log(`Copia de seguridad: ${backupPath}`);

const supabase = getSupabase();

async function remoteCount(table: Table): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`Supabase (${table}): ${error.message}`);
  return count ?? 0;
}

for (const table of TABLES) {
  const n = await remoteCount(table);
  if (n > 0) {
    console.error(`La tabla ${table} de Supabase ya tiene ${n} filas. Vacíala antes de migrar para no duplicar datos.`);
    process.exit(1);
  }
}

const localCounts = {} as Record<Table, number>;
for (const table of TABLES) {
  const rows = sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[];
  localCounts[table] = rows.length;
  if (rows.length === 0) {
    console.log(`${table}: 0 filas, nada que copiar`);
    continue;
  }
  const dateCol = DATE_COLUMNS[table];
  const payload = rows.map((r) => ({ ...r, [dateCol]: sqliteDateToIso(String(r[dateCol])) }));
  const { error } = await supabase.from(table).insert(payload);
  if (error) throw new Error(`Error al insertar ${table}: ${error.message}`);
  console.log(`${table}: ${rows.length} filas copiadas`);
}
sqlite.close();

const { error: seqError } = await supabase.rpc('reset_sequences');
if (seqError) throw new Error(`Error en reset_sequences(): ${seqError.message}`);
console.log('Secuencias ajustadas con reset_sequences()');

let ok = true;
for (const table of TABLES) {
  const remote = await remoteCount(table);
  const same = remote === localCounts[table];
  ok &&= same;
  console.log(`${same ? '✓' : '✗'} ${table}: SQLite ${localCounts[table]} · Supabase ${remote}`);
}
if (!ok) {
  console.error('Los conteos no coinciden.');
  process.exit(1);
}
console.log('Migración completada. data/prices.db se conserva como copia.');
