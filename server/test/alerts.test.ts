import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { evaluateAlerts } from '../src/alerts.js';
import { createFakeRepo } from './fake-repo.js';

describe('evaluateAlerts', () => {
  let repo: ReturnType<typeof createFakeRepo>;

  beforeEach(() => {
    repo = createFakeRepo();
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('crea alerta target cuando mejor precio <= target_price', async () => {
    // Crear producto con target
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, 90, 'EUR', null);

    // Añadir página y check con precio 85 EUR
    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    await repo.insertCheck({ pageId: page.id, price: 85, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });

    // FX estático del fake repo: 1 EUR = 1
    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id });

    const alerts = await repo.listAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe('target');
    expect(alerts[0].price_converted).toBe(85);
    expect(alerts[0].threshold).toBe(90);
  });

  it('NO crea alerta target si mejor precio > target_price', async () => {
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, 80, 'EUR', null);

    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    await repo.insertCheck({ pageId: page.id, price: 85, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });

    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id });

    const alerts = await repo.listAlerts();
    expect(alerts).toHaveLength(0);
  });

  it('crea alerta drop cuando bajada >= target_drop_pct', async () => {
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, null, 'EUR', 10); // 10% drop

    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    // Primera comprobación: 100 EUR
    await repo.insertCheck({ pageId: page.id, price: 100, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });
    // Avanzar tiempo para que sean checks distintos
    vi.advanceTimersByTime(1000);
    // Segunda comprobación: 85 EUR (15% drop)
    await repo.insertCheck({ pageId: page.id, price: 85, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });

    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id, pageId: page.id });

    const alerts = await repo.listAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe('drop');
    expect(alerts[0].price_converted).toBe(85);
    expect(alerts[0].baseline_converted).toBe(100);
    expect(alerts[0].threshold).toBe(10);
  });

  it('NO crea alerta drop si bajada < target_drop_pct', async () => {
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, null, 'EUR', 20); // 20% drop

    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    await repo.insertCheck({ pageId: page.id, price: 100, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });
    vi.advanceTimersByTime(1000);
    await repo.insertCheck({ pageId: page.id, price: 85, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' }); // 15% drop

    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id, pageId: page.id });

    const alerts = await repo.listAlerts();
    expect(alerts).toHaveLength(0);
  });

  it('dedupe: no crea alerta target duplicada en 24h', async () => {
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, 90, 'EUR', null);

    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    await repo.insertCheck({ pageId: page.id, price: 85, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });

    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id });
    await evaluateAlerts({ repo, fx, productId: product.id }); // segunda vez

    const alerts = await repo.listAlerts();
    expect(alerts).toHaveLength(1);
  });

  it('dedupe: permite alerta target tras 24h', async () => {
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, 90, 'EUR', null);

    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    await repo.insertCheck({ pageId: page.id, price: 85, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });

    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id });

    // Avanzar 25 horas
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    await evaluateAlerts({ repo, fx, productId: product.id });

    const alerts = await repo.listAlerts();
    expect(alerts).toHaveLength(2);
  });

  it('drop alert usa baseline de la comprobación anterior', async () => {
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, null, 'EUR', 10);

    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    await repo.insertCheck({ pageId: page.id, price: 100, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });
    vi.advanceTimersByTime(1000);
    await repo.insertCheck({ pageId: page.id, price: 85, currency: 'EUR', status: 'ok', errorMsg: null, method: 'static' });

    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id, pageId: page.id });

    const alerts = await repo.listAlerts();
    expect(alerts[0].baseline_price).toBe(100);
    expect(alerts[0].baseline_converted).toBe(100);
    expect(alerts[0].price_converted).toBe(85);
  });

  it('target alert con conversión USD -> EUR', async () => {
    const product = await repo.createProduct('Test Product', null);
    await repo.updateProduct(product.id, 'Test Product', null, 90, 'EUR', null); // target 90 EUR

    const page = await repo.createPage(product.id, 'https://store.com/p', 'Store', null);
    // 100 USD = 90.91 EUR (con tasa 1.1)
    await repo.insertCheck({ pageId: page.id, price: 100, currency: 'USD', status: 'ok', errorMsg: null, method: 'static' });

    const fx = { getRates: async () => ({ base: 'EUR', rates: { EUR: 1, USD: 1.1 } }) };

    await evaluateAlerts({ repo, fx, productId: product.id });

    const alerts = await repo.listAlerts();
    // 100 USD = 90.91 EUR > 90 EUR target, no debe alertar
    expect(alerts).toHaveLength(0);

    // Ahora con precio 95 USD = 86.36 EUR <= 90
    await repo.insertCheck({ pageId: page.id, price: 95, currency: 'USD', status: 'ok', errorMsg: null, method: 'static' });
    await evaluateAlerts({ repo, fx, productId: product.id });

    const alerts2 = await repo.listAlerts();
    expect(alerts2).toHaveLength(1);
    expect(alerts2[0].price).toBe(95);
    expect(alerts2[0].currency).toBe('USD');
    expect(alerts2[0].price_converted).toBeCloseTo(86.36, 1);
  });
});