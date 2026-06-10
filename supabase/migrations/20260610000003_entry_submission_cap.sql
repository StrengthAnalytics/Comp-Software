-- Cap pending public entry submissions per competition.
--
-- The anon INSERT policy on entry_submissions (migration 20260610000002) is the app's single
-- anonymous write. The submit server action validates and rate-limits politely, but the *anon API
-- key is public by design* — anyone can call PostgREST directly with it — so the only real ceiling
-- on junk inserts has to live in the database. A BEFORE INSERT trigger rejects a new submission
-- once a comp already has 500 pending ones: far above any real meet's entry list (flights run
-- 8–14 lifters), low enough to bound what a script can pile into the inbox. Approving/rejecting
-- frees headroom, so a legitimate flood of entries is never blocked for long.
--
-- SECURITY DEFINER: the inserting role (anon) has no SELECT on entry_submissions, so the trigger
-- function must count with the function owner's rights.
--
-- Apply via the Supabase SQL editor. No change to types/database.types.ts (no schema shape change).

create or replace function public.enforce_entry_submission_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_count integer;
begin
  select count(*) into pending_count
  from public.entry_submissions
  where competition_id = new.competition_id
    and status = 'pending';

  if pending_count >= 500 then
    -- The submit action maps this (code P0001, this message) to a friendly "inbox is full" error.
    raise exception 'entry_submissions_cap';
  end if;

  return new;
end;
$$;

create trigger entry_submissions_cap
  before insert on public.entry_submissions
  for each row execute function public.enforce_entry_submission_cap();
