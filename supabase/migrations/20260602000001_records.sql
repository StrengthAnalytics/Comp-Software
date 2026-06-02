-- UK regional and national powerlifting records.
--
-- This is an ADDITIVE, app-global reference dataset. Unlike every other table in the schema it is
-- NOT scoped to a competition: a record is a standing UK best, owned by no comp. It therefore has
-- NO foreign keys to any existing table, no cascade into or out of the competition data, and does
-- not touch the supabase_realtime publication — nothing here affects how the competition software
-- runs. The record holder's name is free text (not linked to public.lifters), mirroring the source
-- dataset (StrengthAnalytics/BPRecords).
--
-- The region tier (British / home nation / sub-national) is carried implicitly in the free-text
-- `region` value, exactly as the source data models it.

-- New enums, prefixed `record_` so they cannot collide with the eight existing domain enums. The
-- record lifts differ from the comp `lift_type` (they add bench_press_ac and total and name the
-- bench `bench_press`), so this is a separate, independent type rather than a reuse.
create type public.record_lift as enum (
  'squat',
  'bench_press',
  'bench_press_ac',
  'deadlift',
  'total'
);

create type public.record_equipment as enum ('equipped', 'unequipped');

create table public.records (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  name text not null,
  -- 'M' / 'F' to match the source dataset and the admins' existing Google Sheet / CSV exports.
  gender text not null check (gender in ('M', 'F')),
  weight_class text not null,
  age_category text not null,
  lift public.record_lift not null,
  equipment public.record_equipment not null,
  weight_kg numeric(6, 1) not null check (weight_kg > 0),
  date_set date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row IS "the record" for a category, so bulk import is a clean upsert and an individual edit
  -- cannot create a duplicate holder for the same category.
  unique (region, gender, weight_class, age_category, lift, equipment)
);

create index records_region_idx on public.records (region);
create index records_lift_idx on public.records (lift);

-- Reuses the shared trigger function defined in 20260524000001_enums.sql; defines nothing global.
create trigger records_set_updated_at
  before update on public.records
  for each row execute function public.set_updated_at();

-- RLS: a NEW pattern for this table only. Records are public reference data, always readable by
-- anon (unconditional, NOT gated on is_comp_public) — they are not tied to any competition's status.
-- Writes follow the rest of the app: granted to any authenticated session, with requireAdmin() in
-- the server actions as the real gate (safe while public sign-ups stay disabled).
alter table public.records enable row level security;

create policy "records_admin_all" on public.records
  for all to authenticated using (true) with check (true);

create policy "records_public_read" on public.records
  for select to anon using (true);
