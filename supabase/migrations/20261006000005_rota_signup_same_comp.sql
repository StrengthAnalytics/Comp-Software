-- A rota sign-up must be for a slot in its own competition.
--
-- The anon insert policy on rota_signups checks that the row's competition_id has an open rota, but
-- nothing tied the slot (role_id) to that competition: only the server action checked it. A direct
-- insert with the public anon key could name an open-rota comp's id and another comp's slot, filling
-- a slot on a rota that is closed or still being built. The capacity trigger (which already runs on
-- every insert and on an admin's move, as the owner) now only finds the slot when it belongs to the
-- sign-up's competition, and refuses it otherwise with the same "slot no longer available" error the
-- public sign-up action already turns into a friendly message. Admin actions only ever pick slots on
-- the comp's own grid, so they are unaffected.

create or replace function public.enforce_rota_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_capacity integer;
  taken integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.role_id::text));

  select capacity into slot_capacity
  from public.rota_roles
  where id = new.role_id
    and competition_id = new.competition_id;

  if slot_capacity is null then
    -- The role was deleted between page load and submit, or belongs to another competition. The
    -- public sign-up action maps this to a friendly "this slot is no longer available" message.
    raise exception 'rota_role_missing';
  end if;

  select count(*) into taken
  from public.rota_signups
  where role_id = new.role_id;

  if taken >= slot_capacity then
    -- The actions map this (code P0001, this message) to a friendly "just filled" error.
    raise exception 'rota_slot_full';
  end if;

  return new;
end;
$$;
