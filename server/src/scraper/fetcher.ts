import { chromium, type Browser } from 'playwright';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIMEOUT_MS = 20_000;

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
    browserPromise = chromium.launch({ headless: true }).catch((e) => {
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
