-- The persistent person. One lifter row reused across many comps and years.
-- Not comp-scoped: entries link a lifter to a specific competition.

create table public.lifters (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  surname text not null,
  gender text not null check (gender in ('male', 'female')),
  date_of_birth date,
  ipf_member_id text,
  club text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lifters_surname_idx on public.lifters (surname);

create trigger lifters_set_updated_at
  before update on public.lifters
  for each row execute function public.set_updated_at();
