-- Shared product cache v2: isolated from users, scans, favorites and per-package marking.
-- Apply AFTER 001_init.sql, only to the dedicated scanner Supabase project.
alter table public.products_cache
  add column if not exists source text not null default 'openfoodfacts',
  add column if not exists origin_url text;

alter table public.products_cache
  drop constraint if exists products_cache_source_check;
alter table public.products_cache
  add constraint products_cache_source_check
  check (source in ('openfoodfacts','national-catalog','barcode-catalog'));

create index if not exists products_cache_expiration_idx on public.products_cache (expires_at);
create index if not exists products_cache_updated_idx on public.products_cache (updated_at desc);

-- Only the trusted Vercel server (service_role) may read/write shared records.
-- Neither anonymous nor signed-in clients should write arbitrary product facts.
alter table public.products_cache enable row level security;
drop policy if exists "cache authenticated read" on public.products_cache;
revoke all on public.products_cache from anon, authenticated;
grant select, insert, update on public.products_cache to service_role;

comment on table public.products_cache is
'Only public product attributes from Open Food Facts or authorized catalog lookups. No user-created nutrition facts, profiles, images from users, Data Matrix serials, dates, or private records.';
