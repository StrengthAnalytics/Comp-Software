-- The competition (meet). Owns its own divisions, weight classes, and structure.
-- The created_by + meet_director bootstrap trigger lives in the comp_roles migration,
-- since comp_roles does not exist yet at this point.

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  federation text not null default 'IPF',
  kit_type public.kit_type not null,
  event_type public.event_type not null,
  status public.comp_status not null default 'draft',
  starts_on date,
  ends_on date,
  overlay_key uuid not null default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index competitions_overlay_key_idx on public.competitions (overlay_key);
create index competitions_status_idx on public.competitions (status);

create trigger competitions_set_updated_at
  before update on public.competitions
  for each row execute function public.set_updated_at();
