import type { Status } from '../repo.js';
import { isBlockedStatus, looksBlocked } from './classify.js';
import { extractPrice, type Extracted } from './extract.js';
import {
  fetchStatic,
  fetchWithBrowser,
  type FetchResult,
  isProtectedDomain,
  JITTER_MIN_MS,
  JITTER_MAX_MS,
  BLOCK_RETRY_STATUS,
} from './fetcher.js';

export interface CheckResult {
  status: Status;
  price: number | null;
  currency: string | null;
  method: string | null;
  error: string | null;
  title?: string;
  image?: string;
}

type Attempt =
  | { kind: 'ok'; data: Extracted; via: string }
  | { kind: 'blocked' | 'not_found' | 'error'; msg: string };

function evaluate(r: FetchResult, selector: string | null | undefined, via: string): Attempt {
  if (isBlockedStatus(r.status)) return { kind: 'blocked', msg: `La tienda respondió HTTP ${r.status}` };
  if (r.status === 404 || r.status === 410) return { kind: 'error', msg: `La página no existe (HTTP ${r.status})` };
  if (r.status >= 400) return { kind: 'error', msg: `HTTP ${r.status}` };
  const data = extractPrice(r.html, selector, r.finalUrl);
  if (data) return { kind: 'ok', data, via };
  if (looksBlocked(r.html)) return { kind: 'blocked', msg: 'La tienda muestra captcha o protección anti-bot' };
  return { kind: 'not_found', msg: 'No se detectó el precio. Prueba a añadir un selector CSS.' };
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? (e.cause instanceof Error ? `${e.message}: ${e.cause.message}` : e.message) : String(e);
  if (/timeout|aborted/i.test(m)) return 'Tiempo de espera agotado';
  if (/ENOTFOUND|getaddrinfo|ERR_NAME_NOT_RESOLVED/i.test(m)) return 'No se pudo resolver el dominio';
  if (/Executable doesn't exist/i.test(m)) return 'Chromium no instalado: ejecuta "npx playwright install chromium"';
  return m.split('\n')[0].slice(0, 300);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toResult(a: Attempt): CheckResult {
  if (a.kind === 'ok') {
    return {
      status: 'ok', price: a.data.price, currency: a.data.currency,
      method: `${a.via}/${a.data.method}`, error: null, title: a.data.title, image: a.data.image,
    };
  }
  return { status: a.kind, price: null, currency: null, method: null, error: a.msg };
}

/** 1) fetch + cheerio; 2) si falla, Playwright. Se devuelve el mejor resultado. */
export async function checkUrl(url: string, selector?: string | null): Promise<CheckResult> {
  const protectedDomain = isProtectedDomain(url);
  let first: Attempt | null = null;

  if (!protectedDomain) {
    try {
      first = evaluate(await fetchStatic(url), selector, 'fetch');
    } catch (e) {
      first = { kind: 'error', msg: errMsg(e) };
    }
    if (first && first.kind === 'ok') return toResult(first);
    if (first && first.kind === 'error' && first.msg === 'No se pudo resolver el dominio') return toResult(first);
  }

  let second: Attempt;
  try {
    second = evaluate(await fetchWithBrowser(url), selector, 'browser');
  } catch (e) {
    second = { kind: 'error', msg: errMsg(e) };
  }
  if (second.kind === 'ok') return toResult(second);

  // Reintento único con jitter ante bloqueo 403/429
  const msgBlockedCode = second.msg.match(/HTTP (\d{3})/)?.[1];
  const isRetryable = second.kind === 'blocked' && msgBlockedCode && BLOCK_RETRY_STATUS.includes(Number(msgBlockedCode) as 403 | 429);

  if (isRetryable) {
    const jitter = Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1)) + JITTER_MIN_MS;
    await sleep(jitter);
    try {
      const retry = evaluate(await fetchWithBrowser(url), selector, 'browser-retry');
      if (retry.kind === 'ok') return toResult(retry);
      second = retry;
    } catch (e) {
      second = { kind: 'error', msg: errMsg(e) };
    }
  }

  // Elección del mejor resultado
  if (first) {
    if (first.kind === 'blocked' || second.kind === 'blocked') return toResult(first.kind === 'blocked' ? first : second);
    if (second.kind === 'not_found' || first.kind === 'not_found') return toResult(second.kind === 'not_found' ? second : first);
  }
  return toResult(second);
}
