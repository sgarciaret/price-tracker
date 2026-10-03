const BLOCK_MARKERS = [
  /captcha/i,
  /cf-chl-|challenge-platform|Just a moment\.\.\./i,
  /datadome/i,
  /perimeterx|px-captcha/i,
  /Access Denied|Acceso denegado/i,
  /Robot Check|are you a robot|not a robot|no eres un robot/i,
  /api-services-support@amazon\.com/i,
];

export function isBlockedStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status === 503;
}

/** Detecta páginas de bloqueo/captcha. Solo se miran páginas cortas o con marcadores fuertes. */
export function looksBlocked(html: string): boolean {
  const head = html.slice(0, 200_000);
  return BLOCK_MARKERS.some((re) => re.test(head)) && html.length < 400_000;
}
