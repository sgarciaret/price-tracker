import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CACHE_TTL_MS, MemoryCache } from '../src/cache.js';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    cache = new MemoryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guarda y recupera valores con get y set', () => {
    cache.set('key1', { name: 'Item 1' });
    expect(cache.get('key1')).toEqual({ name: 'Item 1' });
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('expira elementos tras el TTL por defecto de 2 minutos', () => {
    cache.set('key1', 'valor');

    // Justo antes de expirar (119 segundos)
    vi.advanceTimersByTime(DEFAULT_CACHE_TTL_MS - 1000);
    expect(cache.get('key1')).toBe('valor');

    // Al cumplirse el TTL
    vi.advanceTimersByTime(1000);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('soporta TTL personalizado por entrada', () => {
    cache.set('short', 'rápido', 10_000); // 10s
    cache.set('long', 'lento', 60_000); // 60s

    vi.advanceTimersByTime(15_000);
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe('lento');
  });

  it('elimina una clave específica con delete', () => {
    cache.set('key1', 'v1');
    cache.set('key2', 'v2');

    cache.delete('key1');
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('v2');
  });

  it('elimina por prefijo con deletePrefix', () => {
    cache.set('products:list', [1, 2]);
    cache.set('products:detail:1', { id: 1 });
    cache.set('products:detail:2', { id: 2 });
    cache.set('other:key', 'keep');

    cache.deletePrefix('products:detail');

    expect(cache.get('products:list')).toEqual([1, 2]);
    expect(cache.get('products:detail:1')).toBeUndefined();
    expect(cache.get('products:detail:2')).toBeUndefined();
    expect(cache.get('other:key')).toBe('keep');

    cache.deletePrefix('products:');
    expect(cache.get('products:list')).toBeUndefined();
    expect(cache.get('other:key')).toBe('keep');
  });

  it('vacía todas las entradas con clear', () => {
    cache.set('a', 1);
    cache.set('b', 2);

    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });
});
