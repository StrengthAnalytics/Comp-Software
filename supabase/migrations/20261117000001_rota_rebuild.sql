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
--      share lock on its role row. A sign-up whose check has already run holds that lock, so this
--      waits for it to commit and step 2 then sees it. One whose check runs after this lock waits
--      for the rebuild to commit and then fails (its role is gone, a foreign-key violation the
--      sign-up action reports as "slot no longer available"). Either way a sign-up is never
--      silently deleted.
--   2. Refuse (rota_has_signups) if the comp has any sign-up at all, in any column.
--   3. Delete the columns linked to a session (session_id set: generated, duplicated onto a session,
--      or added when the session was created). Columns not linked to a session (e.g. "Set-up") are
--      kept; the rebuild cannot recreate them.
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
