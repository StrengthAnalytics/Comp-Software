-- Exactly three referee decisions per attempt (left, head, right).
-- 2+ whites = good lift, 2+ reds = no lift. reasons attach to red decisions.
-- competition_id is denormalized so realtime subscriptions can filter on it directly.

create table public.referee_decisions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  position public.ref_position not null,
  decision public.ref_decision not null,
  reasons text[] not null default '{}',
  referee_user_id uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (attempt_id, position)
);

create index referee_decisions_competition_idx on public.referee_decisions (competition_id);
create index referee_decisions_attempt_idx on public.referee_decisions (attempt_id);
