-- Link a rota section to the comp session it was generated from. This lets the rota builder's
-- "Generate from sessions" action be idempotent — it adds a column only for sessions that don't yet
-- have one — and means deleting a session leaves its rota column behind (set null) rather than
-- wiping staffing work. Manual sections (Set-up / Take Down) carry a null session_id.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

alter table public.rota_sections
  add column session_id uuid references public.sessions(id) on delete set null;

-- At most one section per session (the generate action treats "session has a section" as a boolean).
-- Partial so the many manual, session-less sections are unconstrained.
create unique index rota_sections_session_unique on public.rota_sections (session_id)
  where session_id is not null;
