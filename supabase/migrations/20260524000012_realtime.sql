-- Enable logical replication for the live tables so Supabase Realtime can broadcast
-- row-level changes. REPLICA IDENTITY FULL ensures UPDATE/DELETE payloads carry old values.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

alter table public.attempts replica identity full;
alter table public.referee_decisions replica identity full;
alter table public.entries replica identity full;
alter table public.flights replica identity full;
alter table public.sessions replica identity full;

alter publication supabase_realtime add table public.attempts;
alter publication supabase_realtime add table public.referee_decisions;
alter publication supabase_realtime add table public.entries;
alter publication supabase_realtime add table public.flights;
alter publication supabase_realtime add table public.sessions;
