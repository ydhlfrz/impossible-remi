// Adaptor Vercel (satu fungsi untuk seluruh API; batas jumlah fungsi di paket gratis). Lihat vercel.json.
import { handle } from '../server/handler.js';
import { getStore } from '../server/store.js';
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const route = url.searchParams.get('route');
  url.searchParams.delete('route');
  const path = '/api/' + (route ?? url.pathname.replace(/^\/api\/?/, ''));
  const out = await handle(
    { method: req.method, path, query: Object.fromEntries(url.searchParams), body: req.body, headers: req.headers, ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '-' },
    { store: getStore(process.env), env: process.env, now: () => Date.now() }
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
