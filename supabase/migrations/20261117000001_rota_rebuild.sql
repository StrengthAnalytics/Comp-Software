-- Rebuild the rota from scratch: the safe "clear" half.
--
-- The admin rota page can rebuild a comp's rota from its sessions (fresh columns, with the roles and
-- spaces the admin has just ticked) — but only while NOBODY has signed up to any slot, because
-- deleting a column cascades to its roles and their sign-ups, and a volunteer's sign-up (with their
-- contact details) must never be wiped by a rebuild.
--
-- Checking "no sign-ups" in the app and then deleting leaves a gap a volunteer could sign up in.
-- This function closes it by doing both in one transaction:
--
--   1. Lock every one of the comp's rota roles (FOR UPDATE). A sign-up's foreign-key check takes a
--      share lock on its role row, so a sign-up already in flight finishes first (and is then seen
--      by step 2), and one that starts later waits — then fails, because its role is gone — rather
--      than being silently deleted.
--   2. Refuse (rota_has_signups) if the comp has any sign-up at all, in any column.
--   3. Delete the columns that were made from a session (session_id set). Columns the admin added
--      by hand (e.g. "Set-up") are kept; the rebuild cannot recreate them.
--
-- The server action (rebuildRotaFromSessionsAction) then generates the new columns. SECURITY
-- INVOKER (the default), so it runs under the caller's own RLS — only a signed-in admin can delete
-- rota rows — and execute is revoked from anon as well. No RLS policy changes.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

create or replace function public.clear_rota_session_columns(_competition_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.rota_roles
  where competition_id = _competition_id
  for update;

  if exists (select 1 from public.rota_signups where competition_id = _competition_id) then
    raise exception 'rota_has_signups';
  end if;

  delete from public.rota_sections
  where competition_id = _competition_id
    and session_id is not null;
end;
$$;

revoke execute on function public.clear_rota_session_columns(uuid) from public, anon;
grant execute on function public.clear_rota_session_columns(uuid) to authenticated;
