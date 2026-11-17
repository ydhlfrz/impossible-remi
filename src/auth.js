// Lapisan login. Dua backend dengan antarmuka sama: Supabase (produksi, email) dan lokal (pengembangan tanpa Supabase).
const has = (s, re) => re.test(String(s || ''));
// Terjemahkan galat Supabase / jaringan menjadi kode yang dipetakan ke teks (auth.err.<kode>)
export function mapAuthError(err) {
  const code = String((err && (err.code || err.error)) || ''), msg = String((err && err.message) || '');
  if (code === 'invalid_credentials' || has(msg, /invalid login credentials/i)) return 'invalid_credentials';
  if (code === 'email_not_confirmed' || has(msg, /email not confirmed/i)) return 'email_not_confirmed';
  if (code === 'user_already_exists' || code === 'email_exists' || has(msg, /already (registered|exists)/i)) return 'user_already_exists';
  if (code === 'weak_password' || has(msg, /password.*(short|weak|least)/i)) return 'weak_password';
  if (has(code, /rate_limit/) || (err && err.status === 429) || has(msg, /rate limit|too many/i)) return 'rate';
  if (code === 'bad_email' || code === 'validation_failed' || has(msg, /invalid.*email|email.*invalid/i)) return 'email';
  if (has(msg, /fetch|network|failed to fetch/i) || (err && err.name === 'TypeError')) return 'network';
  return 'generic';
}
export function createSupabaseAuth(client) {
  const wrap = async fn => { try { return await fn(); } catch (e) { throw Object.assign(new Error(mapAuthError(e)), { code: mapAuthError(e) }); } };
  const check = ({ data, error }) => { if (error) throw error; return data; };
  return {
    kind: 'supabase', realtime: client,
    signUp: ({ email, password, name }) => wrap(async () => { const d = check(await client.auth.signUp({ email, password, options: { data: { name } } })); return { needsConfirm: !d.session, user: d.user }; }),
    signIn: ({ email, password }) => wrap(async () => check(await client.auth.signInWithPassword({ email, password })).user),
    signOut: () => wrap(async () => { await client.auth.signOut(); }),
    resetPassword: (email, redirectTo) => wrap(async () => { check(await client.auth.resetPasswordForEmail(email, { redirectTo })); }),
    getToken: async () => { const { data } = await client.auth.getSession(); return data && data.session ? data.session.access_token : null; },
    onChange: cb => { const { data } = client.auth.onAuthStateChange((evt, session) => cb(session ? { email: session.user.email } : null)); return () => data.subscription.unsubscribe(); }
  };
}
export function createLocalAuth(net) {
  const MAP = { username_taken: 'user_already_exists', weak_password: 'weak_password', bad_email: 'email', bad_username: 'email', invalid_credentials: 'invalid_credentials', too_many_requests: 'rate' };
  const wrap = async fn => { try { return await fn(); } catch (e) { const code = MAP[e.code] || mapAuthError(e); throw Object.assign(new Error(code), { code }); } };
  return {
    kind: 'local', realtime: null,
    signUp: ({ email, password, name }) => wrap(async () => ({ needsConfirm: false, user: await net.register(email, password, name) })),
    signIn: ({ email, password }) => wrap(() => net.login(email, password)),
    signOut: async () => net.logout(),
    resetPassword: async () => { throw Object.assign(new Error('generic'), { code: 'generic' }); },
    getToken: async () => net.token,
    onChange: () => () => {}
  };
}
