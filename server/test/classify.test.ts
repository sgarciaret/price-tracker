import { describe, expect, it } from 'vitest';
import { isBlockedStatus, looksBlocked } from '../src/scraper/classify.js';

describe('isBlockedStatus', () => {
  it('marca como bloqueo los status de autorización, rate limit y maintenance', () => {
    expect(isBlockedStatus(401)).toBe(true);
    expect(isBlockedStatus(403)).toBe(true);
    expect(isBlockedStatus(429)).toBe(true);
    expect(isBlockedStatus(503)).toBe(true);
  });

  it('no marca como bloqueo un 200 ni un 500', () => {
    expect(isBlockedStatus(200)).toBe(false);
    expect(isBlockedStatus(500)).toBe(false);
  });
});

describe('looksBlocked', () => {
  it('detecta un captcha en el HTML', () => {
    expect(looksBlocked('<html><body><div class="g-recaptcha" data-sitekey="x"></div></body></html>')).toBe(true);
  });

  it('detecta la página de challenge de Cloudflare', () => {
    expect(looksBlocked('<html><body><div id="challenge-platform">Just a moment...</div></body></html>')).toBe(true);
  });

  it('no confunde una página normal con un bloqueo', () => {
    const html = '<html><head><title>Auriculares</title></head><body><h1>Sony WH-1000XM5</h1></body></html>';
    expect(looksBlocked(html)).toBe(false);
  });

  it('ignora marcadores en documentos enormes (más de 400 KB)', () => {
    const filler = '<p>contenido de catálogo</p>'.repeat(20_000);
    const html = `<html><body><div>captcha</div>${filler}</body></html>`;
    expect(html.length).toBeGreaterThan(400_000);
    expect(looksBlocked(html)).toBe(false);
  });
});
