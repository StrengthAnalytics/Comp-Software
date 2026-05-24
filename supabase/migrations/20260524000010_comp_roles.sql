-- comp_roles links a user to a competition with a role. This is the authorization source.
-- The helper functions below are SECURITY DEFINER so RLS policies that consult comp_roles
-- do not recurse into comp_roles' own RLS.

create table public.comp_roles (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.comp_role not null,
  created_at timestamptz not null default now(),
  unique (competition_id, user_id)
);

create index comp_roles_competition_idx on public.comp_roles (competition_id);
create index comp_roles_user_idx on public.comp_roles (user_id);

-- True when the current user holds one of the given roles in the given competition.
create or replace function public.has_comp_role(_competition_id uuid, _roles public.comp_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.comp_roles cr
    where cr.competition_id = _competition_id
      and cr.user_id = auth.uid()
      and cr.role = any (_roles)
  );
$$;

-- True when the current user holds one of the given roles in any competition.
-- Used for non-comp-scoped resources such as lifters.
create or replace function public.has_any_comp_role(_roles public.comp_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.comp_roles cr
    where cr.user_id = auth.uid()
      and cr.role = any (_roles)
  );
$$;

-- True when a competition is publicly visible (anything past draft).
create or replace function public.is_comp_public(_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitions c
    where c.id = _competition_id
      and c.status in ('published', 'active', 'completed')
  );
$$;

-- True when a lifter has an entry in a publicly visible competition.
-- Lets the public read only the lifters who appear in a public meet, not the whole directory.
create or replace function public.lifter_in_public_comp(_lifter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entries e
    join public.competitions c on c.id = e.competition_id
    where e.lifter_id = _lifter_id
      and c.status in ('published', 'active', 'completed')
  );
$$;

-- Bootstrap: grant the creator of a competition the meet_director role.
-- SECURITY DEFINER so the insert into comp_roles bypasses RLS for the very first role row.
create or replace function public.grant_creator_meet_director()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.comp_roles (competition_id, user_id, role)
    values (new.id, new.created_by, 'meet_director')
    on conflict (competition_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger competitions_grant_creator
  after insert on public.competitions
  for each row execute function public.grant_creator_meet_director();
