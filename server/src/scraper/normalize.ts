const SYMBOLS: Record<string, string> = { '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY' };

export function detectCurrency(text: string): string | null {
  const code = text.match(/\b(EUR|USD|GBP|JPY|CHF|MXN)\b/i);
  if (code) return code[1].toUpperCase();
  for (const [s, c] of Object.entries(SYMBOLS)) if (text.includes(s)) return c;
  return null;
}

/**
 * Convierte textos como "1.299,99 €", "1,299.99", "1299", "19,90" en número.
 */
export function parsePrice(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.replace(/[\s\u00a0\u202f]/g, '').replace(/[^\d.,-]/g, '');
  const m = s.match(/\d[\d.,]*/);
  if (!m) return null;
  s = m[0].replace(/[.,]+$/, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador que aparece último es el decimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const count = s.split(',').length - 1;
    s = count === 1 && decimals !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    const count = s.split('.').length - 1;
    if (count > 1 || decimals === 3) s = s.replace(/\./g, '');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
