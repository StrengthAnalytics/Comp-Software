-- Organiser email per competition. Each comp records the address its emails belong to: volunteer
-- rota change requests are sent there, and lifters' replies to their entry emails go there. It is
-- set on the competition's edit screen and filled in with the creating admin's email when a comp is
-- created, so once the app has more than one organiser account, each comp's emails reach the
-- person running it. (Unset = the app falls back to the ROTA_NOTIFY_EMAILS / ADMIN_EMAILS and
-- RESEND_REPLY_TO_EMAIL env vars.)
--
-- Its own admin-only table rather than a column on competitions, because competitions is
-- anon-readable for a public comp and this address must never be. There is no anon policy and no
-- public view: the two anonymous actions that email on a comp's behalf (the entry form submit and the
-- rota change request) read it server-side with the service-role client (lib/email/organiser.ts),
-- so it never reaches the browser or the public API.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

create table public.competition_organisers (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  email text not null
    constraint competition_organisers_email_format
      check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  updated_at timestamptz not null default now()
);

alter table public.competition_organisers enable row level security;

-- Admins read and write it, like every other setup row. No anon policy at all.
create policy "competition_organisers_admin_all" on public.competition_organisers
  for all to authenticated using (true) with check (true);
