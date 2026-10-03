import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractMeta, extractPrice } from '../src/scraper/extract.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf8');

describe('extractPrice', () => {
  it('extrae del JSON-LD (Product + offers)', () => {
    const r = extractPrice(fixture('json-ld.html'));
    expect(r).not.toBeNull();
    expect(r!.price).toBe(349.99);
    expect(r!.currency).toBe('EUR');
    expect(r!.method).toBe('json-ld');
    expect(r!.title).toBe('Sony WH-1000XM5');
    expect(r!.image).toBe('https://img.example.com/sony.jpg');
  });

  it('extrae de los microdata', () => {
    const r = extractPrice(fixture('microdata.html'));
    expect(r).not.toBeNull();
    expect(r!.price).toBe(129.9);
    expect(r!.currency).toBe('EUR');
    expect(r!.method).toBe('microdata');
  });

  it('extrae de las meta tags OG', () => {
    const r = extractPrice(fixture('meta-price.html'));
    expect(r).not.toBeNull();
    expect(r!.price).toBe(219.95);
    expect(r!.currency).toBe('EUR');
    expect(r!.method).toBe('meta');
    expect(r!.image).toBe('https://img.example.com/cleanbot.jpg');
  });

  it('da prioridad al selector CSS propio sobre el resto de estrategias', () => {
    const r = extractPrice(fixture('plain-price.html'), '.price');
    expect(r).not.toBeNull();
    expect(r!.price).toBe(89.99);
    expect(r!.currency).toBe('EUR');
    expect(r!.method).toBe('selector');
  });

  it('cae en la heurística por regex cuando no hay nada estructurado', () => {
    const r = extractPrice(fixture('plain-price.html'));
    expect(r).not.toBeNull();
    expect(r!.price).toBe(89.99);
    expect(r!.currency).toBe('EUR');
    expect(r!.method).toBe('regex');
  });

  it('devuelve null si la página no tiene ningún precio', () => {
    expect(extractPrice('<!doctype html><html><head></head><body><p>Sin precios</p></body></html>')).toBeNull();
  });
});

describe('extractMeta', () => {
  it('lee og:title y og:image', () => {
    const meta = extractMeta(fixture('meta-price.html'));
    expect(meta.title).toBe('Robot aspirador CleanBot 5000');
    expect(meta.image).toBe('https://img.example.com/cleanbot.jpg');
  });

  it('usa el <title> cuando no hay og:title', () => {
    const meta = extractMeta(fixture('plain-price.html'));
    expect(meta.title).toBe('Auriculares inalámbricos');
    expect(meta.image).toBeUndefined();
  });
});
