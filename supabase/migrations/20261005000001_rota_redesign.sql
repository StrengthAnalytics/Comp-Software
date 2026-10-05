-- Volunteer rota redesign: three small schema changes behind the spreadsheet-style rota grid.
--
--   1. An admin can add someone to a slot by NAME ONLY (e.g. a regular helper who isn't going to fill
--      in a form), so rota_signups.email and .phone become nullable. The public sign-up still
--      requires both (enforced by Zod in the submit action); the (role_id, lower(email)) unique index
--      is unaffected — Postgres treats NULLs as distinct, so several name-only helpers can share a role.
--
--   2. An admin can MOVE a volunteer to another slot (an UPDATE of role_id). The capacity trigger now
--      also fires on that update, so a move can't overfill the target slot.
--
--   3. A "Request a change" form on the public board: volunteers can't edit or remove anything
--      themselves, so they send the organiser a request instead. rota_change_requests is the app's
--      THIRD fenced anonymous write, built exactly like rota_signups — a single INSERT-only anon
--      policy gated on comp_rota_open(), no anon read (it carries the requester's contact details),
--      and a BEFORE INSERT trigger that caps open requests per comp (the anon key is public, so the
--      ceiling must live in the database) and checks a named slot belongs to the same comp.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

-- 1. Name-only admin adds --------------------------------------------------------------------------

alter table public.rota_signups
  alter column email drop not null,
  alter column phone drop not null;

-- 2. Capacity guard also covers moves ----------------------------------------------------------------

-- The function body (migration 20260615000001) already counts the target role's sign-ups, and the
-- moving row still carries its OLD role_id during the BEFORE UPDATE, so it isn't counted against the
-- target. Only the trigger's events change.
drop trigger rota_signups_capacity on public.rota_signups;

create trigger rota_signups_capacity
  before insert or update of role_id on public.rota_signups
  for each row execute function public.enforce_rota_slot_capacity();

-- 3. Change requests ---------------------------------------------------------------------------------

-- A volunteer's request to drop out of, swap or otherwise change a slot. `role_id` is the slot they
-- picked (null for "several slots / not sure"; set null if the role is later deleted so the request
-- survives). `contact` is the email or mobile the organiser replies to. `status` is 'open' until the
-- admin marks it done.
create table public.rota_change_requests (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  role_id uuid references public.rota_roles(id) on delete set null,
  name text not null,
  contact text not null,
  kind text not null check (kind in ('drop_out', 'swap', 'other')),
  message text,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index rota_change_requests_competition_idx on public.rota_change_requests (competition_id, status);

-- Caps OPEN requests per comp at 200 — far above any real meet's volunteer list, low enough to bound
-- what a script can pile into the inbox; marking requests done frees headroom. Also refuses a role_id
-- from a different comp (anon can't be trusted to pair the two). SECURITY DEFINER: anon has no
-- SELECT on rota_change_requests, so the count runs with the owner's rights.
create or replace function public.enforce_rota_change_request_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count integer;
begin
  if new.role_id is not null and not exists (
    select 1 from public.rota_roles r
    where r.id = new.role_id and r.competition_id = new.competition_id
  ) then
    -- The submit action maps this (code P0001, this message) to a friendly "slot no longer exists".
    raise exception 'rota_change_request_role_mismatch';
  end if;

  select count(*) into open_count
  from public.rota_change_requests
  where competition_id = new.competition_id
    and status = 'open';

  if open_count >= 200 then
    -- The submit action maps this (code P0001, this message) to a friendly "contact the organiser".
    raise exception 'rota_change_requests_cap';
  end if;

  return new;
end;
$$;

create trigger rota_change_requests_rules
  before insert on public.rota_change_requests
  for each row execute function public.enforce_rota_change_request_rules();

alter table public.rota_change_requests enable row level security;

-- Admins do everything (read the inbox, mark done). Anon may only INSERT on a rota-open comp — no
-- select/update/delete — exactly like rota_signups.
create policy "rota_change_requests_admin_all" on public.rota_change_requests
  for all to authenticated using (true) with check (true);

create policy "rota_change_requests_public_insert" on public.rota_change_requests
  for insert to anon
  with check (public.comp_rota_open(competition_id));

-- Realtime: the admin rota screen's change-request list updates live. Subscriptions inherit RLS, so
-- only admin sessions receive events.
alter table public.rota_change_requests replica identity full;
alter publication supabase_realtime add table public.rota_change_requests;
