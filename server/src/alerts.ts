import type { Repo } from './repo.js';
import type { FxPort } from './fx.js';
import { convert, pickBest } from './fx.js';

export interface EvaluateAlertsOptions {
  repo: Repo;
  fx: FxPort;
  productId: number;
  pageId?: number;
}

export async function evaluateAlerts({ repo, fx, productId, pageId }: EvaluateAlertsOptions): Promise<void> {
  const product = await repo.getProduct(productId);
  if (!product) return;

  const rates = await fx.getRates();
  const base = rates.base;

  // 1. Target alert: si hay target_price y el mejor precio actual <= target
  if (product.target_price != null) {
    const detail = await repo.getProductDetail(productId);
    if (detail) {
      const candidates = detail.pages
        .filter((p): p is typeof p & { last_check: { status: string; price: number; currency: string | null } } =>
          p.last_check?.status === 'ok' && p.last_check.price != null,
        )
        .map((p) => ({
          price: p.last_check.price,
          currency: p.last_check.currency,
          page_id: p.id,
        }));
      const { converted: bestConverted } = pickBest(candidates, rates.rates, base);

      if (bestConverted != null && bestConverted <= product.target_price) {
        const hasRecent = await repo.hasRecentAlert(productId, 'target', 24);
        if (!hasRecent) {
          // Encontrar la página que disparó la alerta
          let triggerPage: { price: number; currency: string | null; page_id: number } | null = null;
          for (const p of detail.pages) {
            if (
              p.last_check?.status === 'ok' &&
              p.last_check.price != null &&
              convert(p.last_check.price, p.last_check.currency, rates.rates, base) === bestConverted
            ) {
              triggerPage = { price: p.last_check.price, currency: p.last_check.currency, page_id: p.id };
              break;
            }
          }
          if (triggerPage) {
            await repo.insertAlert({
              product_id: productId,
              page_id: triggerPage.page_id,
              kind: 'target',
              price: triggerPage.price,
              currency: triggerPage.currency,
              price_converted: bestConverted,
              comparison_currency: product.target_currency,
              baseline_price: null,
              baseline_currency: null,
              baseline_converted: null,
              threshold: product.target_price,
              threshold_currency: product.target_currency,
              read_at: null,
            });
          }
        }
      }
    }
  }

  // 2. Drop alert: si hay target_drop_pct y alguna página bajó >= ese %
  if (product.target_drop_pct != null && product.target_drop_pct > 0) {
    const pagesToCheck = pageId ? [await repo.getPage(pageId)].filter(Boolean) : await repo.listPages(productId);
    for (const page of pagesToCheck) {
      if (!page) continue;

      // Obtener las dos últimas comprobaciones de esta página
      const checks = await repo.lastChecks(page.id, 2);
      if (checks.length < 2) continue;

      const [latest, previous] = checks;
      if (latest.status !== 'ok' || previous.status !== 'ok' || latest.price == null || previous.price == null) continue;

      const latestConverted = convert(latest.price, latest.currency, rates.rates, base);
      const previousConverted = convert(previous.price, previous.currency, rates.rates, base);

      if (latestConverted == null || previousConverted == null || previousConverted === 0) continue;

      const dropPct = ((previousConverted - latestConverted) / previousConverted) * 100;
      if (dropPct >= product.target_drop_pct) {
        const hasRecent = await repo.hasRecentAlert(productId, 'drop', 24);
        if (!hasRecent) {
          await repo.insertAlert({
            product_id: productId,
            page_id: page.id,
            kind: 'drop',
            price: latest.price,
            currency: latest.currency,
            price_converted: latestConverted,
            comparison_currency: base,
            baseline_price: previous.price,
            baseline_currency: previous.currency,
            baseline_converted: previousConverted,
            threshold: product.target_drop_pct,
            threshold_currency: null,
            read_at: null,
          });
        }
      }
    }
  }
}