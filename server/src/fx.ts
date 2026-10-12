export interface FxPort {
  getRates(): Promise<{ base: string; rates: Record<string, number> }>;
}

export const FX_BASE_CURRENCY = process.env.FX_BASE_CURRENCY ?? 'EUR';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseOverride(): { base: string; rates: Record<string, number> } | null {
  const json = process.env.FX_RATES_JSON ?? '';
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj.base === 'string' && obj.rates && typeof obj.rates === 'object') {
      return { base: obj.base, rates: obj.rates };
    }
  } catch {
    // ignore
  }
  return null;
}

export function createHttpFx(): FxPort {
  let cache: { base: string; rates: Record<string, number>; at: number } | null = null;

  return {
    async getRates() {
      const override = parseOverride();
      if (override) {
        return override;
      }

      const now = Date.now();
      if (cache && now - cache.at < CACHE_TTL_MS) {
        return { base: cache.base, rates: cache.rates };
      }

      try {
        const base = encodeURIComponent(FX_BASE_CURRENCY);
        const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
        if (!res.ok) throw new Error(`FX fetch failed ${res.status}`);
        const json = await res.json();
        if (json && json.result === 'success' && json.base_code && json.rates) {
          const data = { base: json.base_code, rates: json.rates };
          cache = { ...data, at: now };
          return data;
        }
      } catch (_err) {
        // fallback estático
      }

      // fallback estático mínimo
      const fallback = { base: FX_BASE_CURRENCY, rates: { [FX_BASE_CURRENCY]: 1 } };
      cache = { ...fallback, at: now };
      return fallback;
    },
  };
}

export function convert(
  price: number | null | undefined,
  currency: string | null | undefined,
  rates: Record<string, number>,
  base: string,
): number | null {
  if (price == null || currency == null) return null;
  if (currency === base) return price;
  const rate = rates[currency];
  if (rate == null || rate === 0) return null;
  // rates[c] = unidades de c por 1 base
  return price / rate;
}

export interface PriceCandidate {
  price: number | null;
  currency: string | null;
  store?: string;
  page_id?: number;
}

export function pickBest<T extends PriceCandidate>(
  candidates: T[],
  rates: Record<string, number>,
  base: string,
): { candidate: T | null; converted: number | null; currency: string | null } {
  let best: T | null = null;
  let bestConverted: number | null = null;

  for (const c of candidates) {
    const conv = convert(c.price, c.currency, rates, base);
    if (conv == null) continue;
    if (bestConverted == null || conv < bestConverted) {
      bestConverted = conv;
      best = c;
    }
  }

  // Si ningún candidato es convertible, elegimos el precio crudo más bajo
  if (best == null) {
    let minRaw: number | null = null;
    for (const c of candidates) {
      if (c.price == null) continue;
      if (minRaw == null || c.price < minRaw) {
        minRaw = c.price;
        best = c;
      }
    }
    bestConverted = best?.price ?? null;
  }

  return {
    candidate: best,
    converted: bestConverted,
    currency: best?.currency ?? null,
  };
}