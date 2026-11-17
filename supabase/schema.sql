-- Jalankan di Supabase: SQL Editor -> New query -> tempel -> Run.
-- Tabel kv menyimpan status ruang/game & data pemain. Hanya server (service key) yang boleh mengaksesnya.
create table if not exists public.kv (
  k   text primary key,
  v   jsonb not null,
  tok text,
  exp timestamptz
);
create index if not exists kv_exp_idx on public.kv (exp);
alter table public.kv enable row level security;   -- tanpa policy = klien (anon/authenticated) tidak bisa membaca/menulis sama sekali
revoke all on public.kv from anon, authenticated;

-- Kunci terdistribusi (setara Redis SET NX PX): true bila kunci berhasil diambil.
create or replace function public.kv_setnx(p_k text, p_tok text, p_ttl_ms int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.kv where k = p_k and exp is not null and exp <= now();
  insert into public.kv (k, v, tok, exp) values (p_k, to_jsonb(p_tok), p_tok, now() + make_interval(secs => p_ttl_ms / 1000.0))
  on conflict (k) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Lepas kunci hanya jika token cocok (pemilik).
create or replace function public.kv_del_if(p_k text, p_tok text) returns void
language sql security definer set search_path = public as $$
  delete from public.kv where k = p_k and tok = p_tok;
$$;

revoke all on function public.kv_setnx(text, text, int) from public, anon, authenticated;
revoke all on function public.kv_del_if(text, text) from public, anon, authenticated;
grant execute on function public.kv_setnx(text, text, int) to service_role;
grant execute on function public.kv_del_if(text, text) to service_role;

-- Opsional: bersihkan baris kedaluwarsa tiap jam (aktifkan ekstensi pg_cron di Database -> Extensions)
-- select cron.schedule('kv-cleanup', '0 * * * *', $$ delete from public.kv where exp is not null and exp < now() $$);
