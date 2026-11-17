// Server lokal untuk pengembangan: node server/dev.mjs  (Vite meneruskan /api ke sini)
import http from 'node:http';
import { handle } from './handler.js';
import { getStore } from './store.js';
const store = getStore(process.env);
http.createServer(async (req, res) => {
  let raw = '';
  for await (const ch of req) { raw += ch; if (raw.length > 65536) { res.writeHead(413).end(); return; } }
  const url = new URL(req.url, 'http://localhost');
  const out = await handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: raw ? raw : undefined, headers: req.headers, ip: req.socket.remoteAddress },
    { store, env: process.env, now: () => Date.now() });
  res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(out.body));
}).listen(process.env.PORT || 8787, () => console.log('API dev di http://localhost:' + (process.env.PORT || 8787)));
