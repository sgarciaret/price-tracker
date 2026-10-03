import { describe, expect, it } from 'vitest';
import { detectCurrency, parsePrice } from '../src/scraper/normalize.js';

describe('parsePrice', () => {
  it('entiende miles y decimales a la europea', () => {
    expect(parsePrice('1.299,99 €')).toBe(1299.99);
  });

  it('entiende miles y decimales a la americana', () => {
    expect(parsePrice('1,299.99')).toBe(1299.99);
  });

  it('interpreta una coma como decimal cuando no hace de miles', () => {
    expect(parsePrice('19,90')).toBe(19.9);
  });

  it('acepta enteros sin separador', () => {
    expect(parsePrice('1299')).toBe(1299);
  });

  it('redondea a dos decimales', () => {
    expect(parsePrice('1.234,567')).toBe(1234.57);
  });

  it('devuelve null con texto sin números', () => {
    expect(parsePrice('agotado')).toBeNull();
    expect(parsePrice('sin número')).toBeNull();
    expect(parsePrice('')).toBeNull();
  });

  it('devuelve null con 0 y negativos', () => {
    expect(parsePrice(0)).toBeNull();
    expect(parsePrice('0')).toBeNull();
    expect(parsePrice(-1299.99)).toBeNull();
    expect(parsePrice(-5)).toBeNull();
  });

  it('devuelve null con tipos no soportados', () => {
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice({ price: 10 })).toBeNull();
  });

  it('devuelve null con números no finitos', () => {
    expect(parsePrice(Number.NaN)).toBeNull();
    expect(parsePrice(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('detectCurrency', () => {
  it('detecta el código ISO', () => {
    expect(detectCurrency('99,99 EUR')).toBe('EUR');
    expect(detectCurrency('usd 10')).toBe('USD');
  });

  it('detecta el símbolo del euro', () => {
    expect(detectCurrency('10 €')).toBe('EUR');
  });

  it('detecta el símbolo del dólar', () => {
    expect(detectCurrency('$10')).toBe('USD');
  });

  it('devuelve null cuando no hay moneda', () => {
    expect(detectCurrency('sin moneda')).toBeNull();
    expect(detectCurrency('')).toBeNull();
  });
});
