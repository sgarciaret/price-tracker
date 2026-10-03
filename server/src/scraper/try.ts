// Uso: npm run try -w server -- <url> [selector]
import { checkUrl } from './index.js';
import { closeBrowser } from './fetcher.js';

const urls = process.argv.slice(2).filter((a) => a.startsWith('http'));
const selector = process.argv.slice(2).find((a) => !a.startsWith('http'));
for (const url of urls) {
  const t = Date.now();
  const r = await checkUrl(url, selector);
  console.log(JSON.stringify({ url, ms: Date.now() - t, ...r }, null, 2));
}
await closeBrowser();
