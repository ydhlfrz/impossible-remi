// Notifikasi "ada perubahan" lewat Supabase Realtime Broadcast (REST). Isinya hanya nomor versi, tanpa data game.
export function makeNotifier(env, fetchFn = globalThis.fetch) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return async (code, v) => {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 700);
    try {
      await fetchFn(url.replace(/\/+$/, '') + '/realtime/v1/api/broadcast', {
        method: 'POST', signal: ctrl.signal,
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: 'room:' + code, event: 'v', payload: { v } }] })
      });
    } catch (e) { /* gagal notifikasi tidak boleh menggagalkan permintaan; klien punya polling cadangan */ }
    finally { clearTimeout(t); }
  };
}
