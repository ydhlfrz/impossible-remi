import { defineConfig } from 'vite';
// Pengembangan: jalankan `node server/dev.mjs` lalu `npm run dev`; permintaan /api diteruskan ke server lokal.
export default defineConfig({ server: { proxy: { '/api': 'http://localhost:8787' } } });
