-- Up to 9 attempts per entry (3 each for squat, bench, deadlift).
-- competition_id is denormalized so realtime subscriptions can filter on it directly.

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  lift public.lift_type not null,
  attempt_number smallint not null check (attempt_number between 1 and 3),
  weight_kg numeric(5, 1),
  declared_at timestamptz,
  result public.attempt_result not null default 'pending',
  is_record_attempt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, lift, attempt_number)
);

create index attempts_competition_idx on public.attempts (competition_id);
create index attempts_entry_idx on public.attempts (entry_id);

create trigger attempts_set_updated_at
  before update on public.attempts
  for each row execute function public.set_updated_at();
