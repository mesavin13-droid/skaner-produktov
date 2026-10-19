-- Задел под этапы 2–3. Текущий MVP хранит историю локально, без авторизации.
-- Таблицы закрыты RLS; service_role никогда не передаётся в браузер.
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  allergies text[] not null default '{}',
  diet text not null default 'none',
  calorie_goal int not null default 2000 check (calorie_goal between 500 and 6000)
);
create table if not exists public.products_cache (
  barcode text primary key check (barcode ~ '^[0-9]{8,14}$'),
  product jsonb not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  updated_at timestamptz not null default now()
);
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  barcode text not null,
  product jsonb not null,
  scanned_at timestamptz not null default now()
);
create index if not exists scans_user_date_idx on public.scans(user_id, scanned_at desc);
create table if not exists public.favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  barcode text not null,
  product jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, barcode)
);

alter table public.users enable row level security;
alter table public.scans enable row level security;
alter table public.favorites enable row level security;
alter table public.products_cache enable row level security;

create policy "users own select" on public.users for select to authenticated using (auth.uid() = id);
create policy "users own insert" on public.users for insert to authenticated with check (auth.uid() = id);
create policy "users own update" on public.users for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "scans own select" on public.scans for select to authenticated using (auth.uid() = user_id);
create policy "scans own insert" on public.scans for insert to authenticated with check (auth.uid() = user_id);
create policy "scans own delete" on public.scans for delete to authenticated using (auth.uid() = user_id);
create policy "favorites own select" on public.favorites for select to authenticated using (auth.uid() = user_id);
create policy "favorites own insert" on public.favorites for insert to authenticated with check (auth.uid() = user_id);
create policy "favorites own delete" on public.favorites for delete to authenticated using (auth.uid() = user_id);
-- Кэш пишет только доверенная серверная функция через service_role; клиент его не изменяет.
create policy "cache authenticated read" on public.products_cache for select to authenticated using (true);
