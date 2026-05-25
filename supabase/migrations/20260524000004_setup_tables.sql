-- Per-comp setup tables: divisions, weight classes, platforms.
-- Each comp owns its own rule set; rules change year to year.

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);

create table public.weight_classes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null,
  gender text not null check (gender in ('male', 'female')),
  -- lower_kg exclusive lower bound, upper_kg inclusive upper bound. upper_kg null = unlimited (e.g. 120kg+).
  lower_kg numeric(5, 1) not null default 0,
  upper_kg numeric(5, 1),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);

create index divisions_competition_idx on public.divisions (competition_id);
create index weight_classes_competition_idx on public.weight_classes (competition_id);
create index platforms_competition_idx on public.platforms (competition_id);
