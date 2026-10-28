-- Binder account storage. Run once in the Supabase SQL editor of your project.
-- Every row belongs to the signed-in user; row level security keeps it private.

create table if not exists public.binders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null,
  cover_color text not null default '#3a1820',
  cover_image text,
  show_name boolean not null default true,
  sort integer not null default 0,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.binder_cards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  binder_id uuid not null references public.binders (id) on delete cascade,
  slot integer not null check (slot >= 0),
  card jsonb not null,
  printing jsonb,
  artwork_id text,
  condition text not null,
  language text not null,
  edition text not null,
  notes text not null default '',
  updated_at timestamptz not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now()
);

-- For projects created with an earlier version of this file.
alter table public.binder_cards add column if not exists artwork_id text;
alter table public.binders add column if not exists show_name boolean not null default true;

create index if not exists binders_user_sync on public.binders (user_id, server_updated_at);
create index if not exists binder_cards_user_sync on public.binder_cards (user_id, server_updated_at);
create index if not exists binder_cards_binder_id on public.binder_cards (binder_id);

-- server_updated_at drives incremental pulls, independent of device clocks.
create or replace function public.touch_server_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

drop trigger if exists binders_touch on public.binders;
create trigger binders_touch before insert or update on public.binders
  for each row execute function public.touch_server_updated_at();
drop trigger if exists binder_cards_touch on public.binder_cards;
create trigger binder_cards_touch before insert or update on public.binder_cards
  for each row execute function public.touch_server_updated_at();

alter table public.binders enable row level security;
alter table public.binder_cards enable row level security;

drop policy if exists "own binders" on public.binders;
create policy "own binders" on public.binders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own binder cards" on public.binder_cards;
create policy "own binder cards" on public.binder_cards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Private bucket for cover pictures, one folder per user.
insert into storage.buckets (id, name, public)
values ('covers', 'covers', false)
on conflict (id) do nothing;

drop policy if exists "own covers read" on storage.objects;
create policy "own covers read" on storage.objects for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own covers write" on storage.objects;
create policy "own covers write" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own covers update" on storage.objects;
create policy "own covers update" on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Public bucket with the card images of the cards in your binders, copied once
-- from YGOPRODeck by the card-image function (supabase/functions/card-image).
-- Only that function writes here (with the service key); anyone can read.
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;

-- Card spots on the table and the card back: one record per account.
create table if not exists public.binder_tables (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  slots jsonb not null default '[]',
  card_back text,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now()
);

drop trigger if exists binder_tables_touch on public.binder_tables;
create trigger binder_tables_touch before insert or update on public.binder_tables
  for each row execute function public.touch_server_updated_at();

alter table public.binder_tables enable row level security;
drop policy if exists "own table" on public.binder_tables;
create policy "own table" on public.binder_tables for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
