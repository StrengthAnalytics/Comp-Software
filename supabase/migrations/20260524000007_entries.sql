-- A lifter's registration for one competition: class, division, flight, openers, status.

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  lifter_id uuid not null references public.lifters (id) on delete restrict,
  weight_class_id uuid references public.weight_classes (id) on delete set null,
  division_id uuid references public.divisions (id) on delete set null,
  flight_id uuid references public.flights (id) on delete set null,
  lot_number int,
  bodyweight_kg numeric(5, 1),
  opener_squat_kg numeric(5, 1),
  opener_bench_kg numeric(5, 1),
  opener_deadlift_kg numeric(5, 1),
  rack_height_squat text,
  rack_height_bench text,
  status public.entry_status not null default 'registered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, lifter_id),
  unique (competition_id, lot_number)
);

create index entries_competition_idx on public.entries (competition_id);
create index entries_flight_idx on public.entries (flight_id);
create index entries_lifter_idx on public.entries (lifter_id);

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();
