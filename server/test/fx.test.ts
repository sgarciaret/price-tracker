import { describe, expect, it } from 'vitest';
import { convert, pickBest } from '../src/fx.js';
import { createHttpFx } from '../src/fx.js';

describe('FX', () => {
  const ratesEUR = { EUR: 1, USD: 1.1, GBP: 0.85 };

  it('convierte EUR a base EUR sin cambio', () => {
    expect(convert(100, 'EUR', ratesEUR, 'EUR')).toBe(100);
  });

  it('convierte USD a base EUR usando tasa', () => {
    // 1 EUR = 1.1 USD => 110 USD = 100 EUR
    expect(convert(110, 'USD', ratesEUR, 'EUR')).toBeCloseTo(100);
  });

  it('convierte vía base cruzada', () => {
    // GBP: 1 EUR = 0.85 GBP
    expect(convert(85, 'GBP', ratesEUR, 'EUR')).toBeCloseTo(100);
  });

  it('devuelve null si moneda sin tasa', () => {
    expect(convert(100, 'JPY', ratesEUR, 'EUR')).toBeNull();
  });

  it('devuelve null si precio es null', () => {
    expect(convert(null, 'EUR', ratesEUR, 'EUR')).toBeNull();
  });

  it('pickBest elige el menor precio convertido', () => {
    const candidates = [
      { price: 100, currency: 'USD', id: 1 },
      { price: 95, currency: 'EUR', id: 2 },
    ];
    // 100 USD => 100/1.1 ~= 90.91 EUR
    const { candidate, converted } = pickBest(candidates, ratesEUR, 'EUR');
    expect(candidate?.id).toBe(1);
    expect(converted).toBeCloseTo(90.91);
  });

  it('pickBest ignora no convertibles y cae a precio crudo', () => {
    const candidates = [
      { price: 100, currency: 'JPY', id: 1 },
      { price: 200, currency: 'JPY', id: 2 },
    ];
    const { candidate, converted } = pickBest(candidates, ratesEUR, 'EUR');
    // Ninguno convertible -> mejor precio crudo
    expect(candidate?.id).toBe(1);
    expect(converted).toBe(100);
  });

  it('createHttpFx usa FX_RATES_JSON sin red', async () => {
    const original = process.env.FX_RATES_JSON;
    process.env.FX_RATES_JSON = JSON.stringify({ base: 'EUR', rates: { EUR: 1, USD: 1.2 } });
    // Recargar módulo para leer env? Simpler: use parseOverride indirectly via spy
    // Como FX_RATES_JSON se lee en módulo load, forzamos override creando instancia y mock fetch
    const fx = createHttpFx();
    const rates = await fx.getRates();
    expect(rates.base).toBe('EUR');
    expect(rates.rates.USD).toBe(1.2);
    if (original !== undefined) process.env.FX_RATES_JSON = original;
    else delete process.env.FX_RATES_JSON;
  });

  it('fallback estático cuando fetch falla', async () => {
    // Guardar env
    const prev = process.env.FX_RATES_JSON;
    delete process.env.FX_RATES_JSON;
    // Mock fetch failure
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('network'); };
    const fx = createHttpFx();
    const rates = await fx.getRates();
    expect(rates.base).toBe('EUR');
    expect(rates.rates.EUR).toBe(1);
    global.fetch = originalFetch;
    if (prev !== undefined) process.env.FX_RATES_JSON = prev;
  });
});
