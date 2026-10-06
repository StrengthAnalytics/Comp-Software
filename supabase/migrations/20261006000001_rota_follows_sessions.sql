-- The rota follows the session schedule. Until now "Generate from sessions" copied a session's
-- times into its rota column once, and the column never changed again. Now a column linked to a
-- session (rota_sections.session_id) keeps its header in step with the session, and each of its jobs
-- can follow the session's clock: `arrive_basis` says which time a job's arrive-by is worked out
-- from — 'lift_off' (30 minutes before lifting starts) or 'weigh_in' (10 minutes before weigh-ins
-- open). Null means the admin set the time by hand and it stays as typed. The app recalculates
-- arrive_by whenever a session is created, edited or deleted (lib/rota/sync.ts), so the stored value
-- is always current and the public board — which can't read a draft comp's sessions — needs no join.
--
-- Backfill, so existing rotas catch up straight away (the times may already be stale — that is the
-- bug this fixes): every job in a session-linked column follows its session — the weigh-in team
-- (a title containing "weigh") 10 minutes before weigh-ins open, everyone else 30 minutes before
-- lift-off — and its arrive-by is recalculated now. Each linked column's header is rebuilt from its
-- session the same way the app builds it ("Sat", the session name, "Weigh-in 7:00am · Lift-off
-- 9:00am", plus the platform name when the comp runs more than one). Hand-made columns (Set-up) are
-- untouched. An organiser who wants a fixed time for a job picks "Set a time" on the Edit layout tab.
--
-- (Times are added to a fixed date so to_char formats a timestamp; 'FMHH12:MIam' gives "8:30am".)
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

alter table public.rota_roles
  add column arrive_basis text check (arrive_basis in ('lift_off', 'weigh_in'));

update public.rota_roles r
set arrive_basis = case when r.title ilike '%weigh%' then 'weigh_in' else 'lift_off' end
from public.rota_sections s
where r.section_id = s.id
  and s.session_id is not null;

update public.rota_roles r
set arrive_by = case
    when r.arrive_basis = 'weigh_in' and ss.weigh_in_time is not null
      then lower(to_char(date '2000-01-01' + (ss.weigh_in_time - interval '10 minutes'), 'FMHH12:MIam'))
    when r.arrive_basis = 'lift_off' and ss.lift_off_time is not null
      then lower(to_char(date '2000-01-01' + (ss.lift_off_time - interval '30 minutes'), 'FMHH12:MIam'))
    else null
  end
from public.rota_sections s
join public.sessions ss on ss.id = s.session_id
where r.section_id = s.id
  and r.arrive_basis is not null;

update public.rota_sections s
set day_label = case when ss.session_date is null then null else to_char(ss.session_date, 'Dy') end,
    title = ss.name,
    subtitle = nullif(
      concat_ws(
        ' · ',
        'Weigh-in ' || lower(to_char(date '2000-01-01' + ss.weigh_in_time, 'FMHH12:MIam')),
        'Lift-off ' || lower(to_char(date '2000-01-01' + ss.lift_off_time, 'FMHH12:MIam')),
        case
          when (select count(*) from public.platforms p where p.competition_id = ss.competition_id) > 1
            then (select p.name from public.platforms p where p.id = ss.platform_id)
        end
      ),
      ''
    )
from public.sessions ss
where ss.id = s.session_id;
