import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno');
  }
  return { url, key };
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * Cliente único de Supabase con la service role key. Se crea en la primera llamada,
 * así importar este módulo (p. ej. desde los tests) no exige las variables de entorno.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, key } = config();
  client = createClient(url, key, options);
  return client;
}

/**
 * Cliente desechable para `signInWithPassword`/`refreshSession`: guardan la sesión del usuario
 * en el cliente, y en el compartido harían que las consultas dejasen de ir con la service role.
 */
export function createAuthClient(): SupabaseClient {
  const { url, key } = config();
  return createClient(url, key, options);
}
