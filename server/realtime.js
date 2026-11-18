
// Notifikasi "ada perubahan" lewat Supabase Realtime Broadcast.
export function makeNotifier(env, fetchFn = globalThis.fetch) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;

  return async (code, v) => {
    const started = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 700);

    try {
      const r = await fetchFn(
        url.replace(/\/+$/, '') + '/realtime/v1/api/broadcast',
        {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            apikey: key,
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [{
              topic: 'room:' + code,
              event: 'v',
              payload: { v }
            }]
          })
        }
      );

      console.log('[realtime]', {
        status: r.status,
        durationMs: Date.now() - started
      });
    } catch (e) {
      console.log('[realtime] failed', {
        durationMs: Date.now() - started,
        error: e.name
      });
    } finally {
      clearTimeout(t);
    }
  };
}
