import { chromium, type Browser } from 'playwright';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIMEOUT_MS = 20_000;

export const PROTECTED_DOMAINS = [
  'carrefour.es',
  'www.carrefour.es',
] as const;

export const JITTER_MIN_MS = 1_000;
export const JITTER_MAX_MS = 3_000;

export const BLOCK_RETRY_STATUS = [403, 429] as const;

export function isProtectedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PROTECTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export interface FetchResult { status: number; html: string; finalUrl: string }

export async function fetchStatic(url: string): Promise<FetchResult> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
    },
  });
  const html = await res.text();
  return { status: res.status, html, finalUrl: res.url };
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

export async function fetchWithBrowser(url: string): Promise<FetchResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'es-ES',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: {
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", ";Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
      'accept-encoding': 'gzip, deflate, br',
      'upgrade-insecure-requests': '1',
    },
  });
  await context.addInitScript(() => {
    // Oculta huella de automatización
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // @ts-expect-error Property 'chrome' does not exist on type 'Window & typeof globalThis'
    window.chrome = { runtime: {} };
  });
  try {
    const page = await context.newPage();
    // Evita descargar recursos pesados
    await page.route('**/*', (route) => {
      const t = route.request().resourceType();
      return ['image', 'media', 'font'].includes(t) ? route.abort() : route.continue();
    });
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    // Da tiempo a que el JS pinte el precio
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});
    const html = await page.content();
    return { status: resp?.status() ?? 0, html, finalUrl: page.url() };
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close();
  }
}
