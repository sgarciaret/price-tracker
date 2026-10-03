import * as cheerio from 'cheerio';
import { detectCurrency, parsePrice } from './normalize.js';

export interface Extracted {
  price: number;
  currency: string;
  method: string;
  title?: string;
  image?: string;
}

export interface PageMeta { title?: string; image?: string }

type Json = any;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function hasType(node: Json, type: string): boolean {
  return asArray(node?.['@type']).some((t: unknown) => typeof t === 'string' && t.toLowerCase() === type.toLowerCase());
}

function walk(node: Json, out: Json[]) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return; }
  out.push(node);
  for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, out);
}

function priceFromOffer(offer: Json): { price: number; currency?: string } | null {
  if (!offer || typeof offer !== 'object') return null;
  const candidates = [offer.price, offer.lowPrice, offer.priceSpecification?.price,
    ...asArray(offer.priceSpecification).map((p: Json) => p?.price)];
  for (const c of candidates) {
    const p = parsePrice(c);
    if (p != null) return { price: p, currency: offer.priceCurrency ?? offer.priceSpecification?.priceCurrency };
  }
  return null;
}

function fromJsonLd($: cheerio.CheerioAPI): (Extracted & { method: string }) | null {
  const nodes: Json[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try { walk(JSON.parse(raw), nodes); } catch { /* JSON inválido: se ignora */ }
  });
  const products = nodes.filter((n) => hasType(n, 'Product') || hasType(n, 'ProductGroup'));
  for (const prod of products) {
    for (const offer of asArray(prod.offers)) {
      const found = priceFromOffer(offer) ?? asArray(offer?.offers).map(priceFromOffer).find(Boolean);
      if (found) {
        const image = asArray(prod.image)[0];
        return {
          price: found.price, currency: found.currency ?? 'EUR', method: 'json-ld',
          title: typeof prod.name === 'string' ? prod.name : undefined,
          image: typeof image === 'string' ? image : image?.url,
        };
      }
    }
  }
  // Ofertas sueltas sin Product padre
  for (const offer of nodes.filter((n) => hasType(n, 'Offer') || hasType(n, 'AggregateOffer'))) {
    const found = priceFromOffer(offer);
    if (found) return { price: found.price, currency: found.currency ?? 'EUR', method: 'json-ld' };
  }
  return null;
}

function fromMicrodata($: cheerio.CheerioAPI): Extracted | null {
  const el = $('[itemprop="price"]').first();
  if (!el.length) return null;
  const price = parsePrice(el.attr('content') ?? el.text());
  if (price == null) return null;
  const cur = $('[itemprop="priceCurrency"]').first();
  const currency = cur.attr('content') ?? (cur.text().trim() || detectCurrency(el.text()) || 'EUR');
  return { price, currency, method: 'microdata' };
}

function fromMeta($: cheerio.CheerioAPI): Extracted | null {
  const pairs: [string, string][] = [
    ['product:price:amount', 'product:price:currency'],
    ['og:price:amount', 'og:price:currency'],
  ];
  for (const [amountKey, curKey] of pairs) {
    const amount = $(`meta[property="${amountKey}"], meta[name="${amountKey}"]`).attr('content');
    const price = parsePrice(amount);
    if (price != null) {
      const currency = $(`meta[property="${curKey}"], meta[name="${curKey}"]`).attr('content') ?? 'EUR';
      return { price, currency, method: 'meta' };
    }
  }
  return null;
}

function fromSelector($: cheerio.CheerioAPI, selector: string): Extracted | null {
  let els;
  try { els = $(selector); } catch { return null; }
  // Primer elemento que contenga un precio válido (algunos nodos existen pero están vacíos)
  for (const node of els.toArray().slice(0, 10)) {
    const el = $(node);
    const text = el.attr('content') ?? el.attr('value') ?? el.text();
    const price = parsePrice(text);
    if (price != null) return { price, currency: detectCurrency(text) ?? 'EUR', method: 'selector' };
  }
  return null;
}

// Número con miles "." o "," y decimales opcionales. No se aceptan espacios como separador de miles
// para evitar unir números vecinos ("342 125,72 €").
const NUM = String.raw`(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)(?![\d])`;
const CUR = String.raw`(€|EUR|£|GBP|\$|USD)`;
const PRICE_RE = new RegExp(`${CUR}\\s?${NUM}|${NUM}\\s?${CUR}`, 'g');

/** Selectores conocidos de tiendas populares (se usan antes de la heurística). */
const KNOWN_SELECTORS: [RegExp, string[]][] = [
  [/(^|\.)amazon\./, ['#corePrice_feature_div .a-offscreen', '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen', '#corePriceDisplay_desktop_feature_div .a-offscreen', '#apex_desktop .priceToPay .a-offscreen', '#buybox .priceToPay', '#ppd .priceToPay .a-offscreen', '#ppd .priceToPay', '#buybox .a-price .a-offscreen']],
  [/(^|\.)ebay\./, ['.x-price-primary .ux-textspans', '[itemprop="price"]']],
  [/(^|\.)aliexpress\./, ['[class*="price--currentPriceText"]', '.product-price-value']],
];

function fromKnownStore($: cheerio.CheerioAPI, host: string | undefined): Extracted | null {
  if (!host) return null;
  for (const [re, selectors] of KNOWN_SELECTORS) {
    if (!re.test(host)) continue;
    for (const s of selectors) {
      const r = fromSelector($, s);
      if (r) return { ...r, method: 'store' };
    }
  }
  return null;
}

function fromRegex($: cheerio.CheerioAPI): Extracted | null {
  // Busca primero en zonas con "price" en clase/id, y luego en el body
  const scopes = ['[class*="price" i], [id*="price" i], [class*="precio" i], [data-price]', 'main', 'body'];
  for (const scope of scopes) {
    const $scope = $(scope).clone();
    $scope.find('script, style, noscript, del, s, strike, [class*="old" i], [class*="before" i], [class*="tachado" i]').remove();
    // Une nodos de texto con espacios para no pegar números de elementos contiguos
    const parts: string[] = [];
    $scope.find('*').addBack().contents().each((_, n) => { if (n.type === 'text') parts.push(n.data); });
    const text = parts.join(' ').replace(/\s+/g, ' ');
    const m = PRICE_RE.exec(text);
    PRICE_RE.lastIndex = 0;
    if (m) {
      const price = parsePrice(m[2] ?? m[3]);
      if (price != null) return { price, currency: detectCurrency(m[1] ?? m[4]) ?? 'EUR', method: 'regex' };
    }
  }
  return null;
}

export function extractMeta(html: string): PageMeta {
  const $ = cheerio.load(html);
  return {
    title: $('meta[property="og:title"]').attr('content') ?? ($('title').text().trim() || undefined),
    image: $('meta[property="og:image"]').attr('content') ?? undefined,
  };
}

/** Aplica la cascada de estrategias. El selector personalizado tiene prioridad si existe. */
export function extractPrice(html: string, cssSelector?: string | null, url?: string): Extracted | null {
  const $ = cheerio.load(html);
  const meta = extractMeta(html);
  let host: string | undefined;
  try { host = url ? new URL(url).hostname : undefined; } catch { /* URL inválida */ }
  const strategies = [
    ...(cssSelector ? [() => fromSelector($, cssSelector)] : []),
    () => fromJsonLd($),
    () => fromMicrodata($),
    () => fromMeta($),
    () => fromKnownStore($, host),
    () => fromRegex($),
  ];
  for (const s of strategies) {
    const r = s();
    if (r) return { ...r, currency: r.currency.toUpperCase(), title: r.title ?? meta.title, image: r.image ?? meta.image };
  }
  return null;
}
