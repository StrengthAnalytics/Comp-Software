-- A session's single, ambiguous `start_time` becomes two clear, informational times: when weigh-in
-- opens, and when lifting starts (lift-off). Both are nullable time-of-day columns that drive no
-- logic — they are shown on the session form and echoed into the rota's generated column subtitles.
-- The existing value is kept as the weigh-in time (the operator's choice); lift-off starts empty.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

alter table public.sessions rename column start_time to weigh_in_time;
alter table public.sessions add column lift_off_time time;
