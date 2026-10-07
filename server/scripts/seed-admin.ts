/**
 * Crea el usuario admin en Supabase Auth con SUPABASE_ADMIN_EMAIL / SUPABASE_ADMIN_PASSWORD del .env.
 * Si ya existe un usuario con ese email, no hace nada: se puede ejecutar varias veces.
 *
 *   npm run seed:admin -w server
 */
import { loadDotenv } from '../src/env.js';
import { getSupabase } from '../src/supabase.js';

loadDotenv();

const email = process.env.SUPABASE_ADMIN_EMAIL?.trim();
const password = process.env.SUPABASE_ADMIN_PASSWORD;
const missing = [
  ['SUPABASE_URL', process.env.SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
  ['SUPABASE_ADMIN_EMAIL', email],
  ['SUPABASE_ADMIN_PASSWORD', password],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  console.warn(`Aviso: faltan variables en el .env: ${missing.join(', ')}. No se crea ningún usuario.`);
  process.exit(1);
}

const auth = getSupabase().auth.admin;

async function findUserByEmail(target: string) {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return undefined;
  }
}

const existing = await findUserByEmail(email!);
if (existing) {
  console.log(`El usuario ${email} ya existe en Supabase Auth (id ${existing.id}). No se crea de nuevo.`);
} else {
  const { data, error } = await auth.createUser({ email: email!, password: password!, email_confirm: true });
  if (error) throw error;
  console.log(`Usuario ${email} creado en Supabase Auth (id ${data.user.id}).`);
}
