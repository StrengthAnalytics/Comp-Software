-- Security fixes from the pre-merge review.
--
-- 1. The public views were writable by anonymous visitors. Each public_* view selects plain columns
--    from one table, so Postgres treats it as auto-updatable, and Supabase's default privileges give
--    anon and authenticated INSERT/UPDATE/DELETE on every new relation in public. The views run as
--    their owner (security_invoker = false, which is what lets anon read through them), so a write
--    through a view also ran as the owner and skipped the base table's RLS: anyone with the public
--    anon key could have renamed lifters in a public comp (public_lifters), renamed volunteers
--    (public_rota_signups) or changed a rota-open comp's name, slug or rota settings
--    (public_rota_comps). The views are read-only by design, so every privilege except SELECT is
--    taken away. Admins write through the base tables and lose nothing.
--
-- 2. The organiser email is no longer readable through a public view at all. public_comp_organisers
--    (migration 20261006000003, already applied on the dev database) is dropped; the two anonymous
--    actions that need the address now read it server-side with the service-role client
--    (lib/email/organiser.ts). The migration file no longer creates the view, so a fresh database
--    never has it; `if exists` keeps this safe on both.
--
-- 3. The rota "Request a change" insert could set its own status. The anon insert policy only
--    checked that the rota was open, and the per-comp cap counts open requests only, so a script
--    could insert unlimited requests already marked done. The policy now also requires a new request
--    to be open and unresolved, like entry_submissions does for its pending status.
--
-- 4. A volunteer's own sign-up must carry their email and phone. Those columns became nullable so an
--    admin can add a helper by name only, but the anon insert policy didn't require them, so a script
--    could add contactless sign-ups (and slip past the one-sign-up-per-email-per-slot index). The
--    policy now requires both, as the public form already does.
--
-- 5. Registration-table jobs follow weigh-in again. The backfill in 20261006000001 (as first
--    written) set every job without "weigh" in its title to follow lift-off, so the registration
--    desk, which the old Generate timed from weigh-in, was told to arrive after weigh-ins opened.
--    That backfill is corrected for fresh databases; this puts right a database it already ran on.
--
-- Apply via the Supabase SQL editor. No table or column changes, so types/database.types.ts only
-- loses the dropped view.

revoke insert, update, delete, truncate, references, trigger
  on public.public_lifters, public.public_rota_signups, public.public_rota_comps
  from anon, authenticated;

drop view if exists public.public_comp_organisers;

drop policy "rota_change_requests_public_insert" on public.rota_change_requests;

create policy "rota_change_requests_public_insert" on public.rota_change_requests
  for insert to anon
  with check (
    public.comp_rota_open(competition_id)
    and status = 'open'
    and resolved_at is null
  );

drop policy "rota_signups_public_insert" on public.rota_signups;

create policy "rota_signups_public_insert" on public.rota_signups
  for insert to anon
  with check (
    public.comp_rota_open(competition_id)
    and email is not null
    and phone is not null
  );

update public.rota_roles r
set arrive_basis = 'weigh_in',
    arrive_by = lower(to_char(date '2000-01-01' + (ss.weigh_in_time - interval '10 minutes'), 'FMHH12:MIam'))
from public.rota_sections s
join public.sessions ss on ss.id = s.session_id
where r.section_id = s.id
  and r.arrive_basis = 'lift_off'
  and r.title ilike '%registration%'
  and ss.weigh_in_time is not null;
