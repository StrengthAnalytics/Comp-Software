-- Sessions belong to a platform and date; flights group lifters within a session.

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  platform_id uuid references public.platforms (id) on delete set null,
  name text not null,
  session_date date,
  start_time time,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.flights (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, name)
);

create index sessions_competition_idx on public.sessions (competition_id);
create index flights_competition_idx on public.flights (competition_id);
create index flights_session_idx on public.flights (session_id);
