-- Public entry form: lifters register themselves through a shareable, comp-specific form, and
-- their submissions wait in a holding table until an admin approves them.
--
-- Design (see the ADR in ARCHITECTURE.md §7):
--
--   * Submissions land in `entry_submissions` — never directly in `lifters`/`entries`. Those
--     tables feed the public boards and overlays (entries is anon-readable for a public comp),
--     so unvetted public input must not reach them; approval creates the real lifter + entry
--     through the existing admin registration path, then stamps the submission.
--   * This is the app's FIRST anonymous write path. It is fenced to a single INSERT-only policy
--     on this one table, gated on the comp being publicly visible AND the operator's
--     "accepting entries" toggle. Anon has NO select/update/delete — a submission carries PII
--     (date of birth, contact details), so the public can post into the inbox but never read it.
--     The submit server action (no adminGuard, a documented exception) validates with Zod and
--     inserts through the normal RLS-bound client; the service-role key stays out of the path.
--   * The form's design lives on the competition: `entry_form` (jsonb — which optional fields
--     are off/optional/required, plus the disclaimer text) and `entry_form_open` (the master
--     accepting-entries toggle). Anon already reads `competitions` for public comps, so the
--     form page renders from the same row. The jsonb shape is owned and validated by Zod
--     (types/entry-form.ts); unknown/corrupt json reads as the defaults.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.

-- Form design + the accepting-entries toggle, per comp ------------------------------------------

alter table public.competitions
  add column entry_form jsonb not null default '{}'::jsonb,
  add column entry_form_open boolean not null default false;

-- The submissions inbox ---------------------------------------------------------------------------

create table public.entry_submissions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  -- pending = awaiting review (the red card); approved/rejected keep the audit trail.
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),

  -- Always collected: the minimum the existing registration path needs (date of birth drives the
  -- age-category auto-assignment; surname may be blank for mononymous lifters, like lifters.surname).
  first_name text not null,
  surname text not null default '',
  gender text not null check (gender in ('male', 'female')),
  date_of_birth date not null,

  -- Admin-toggled fields (off/optional/required per comp, in competitions.entry_form). All nullable:
  -- the app enforces "required" per the comp's form design at submission time, not the database.
  club text,
  ipf_member_id text,
  division text,
  -- The chosen class's display name, not a weight_classes FK: the inbox stays decoupled from later
  -- class edits, and the admin re-confirms the class at approval anyway.
  weight_class text,
  -- Lift weights are kg to 1 dp (numeric(6,1) like records.weight_kg — a total can exceed 999.9).
  predicted_total_kg numeric(6,1) check (predicted_total_kg > 0),
  -- The lifter's declared preference. Informational: kit/event are currently per-comp settings, so
  -- these tell the admin what the lifter expects rather than configuring the entry.
  kit_choice text check (kit_choice in ('classic', 'equipped')),
  event_choice text check (event_choice in ('full_power', 'bench_only')),
  instagram text,
  email text,
  phone text,

  -- When the form carries a disclaimer, submitting requires the tick; this records when.
  disclaimer_accepted_at timestamptz,

  -- Review outcome: the entry created on approval (kept when the entry is later deleted — the
  -- submission is an audit record, not a registration), plus who decided and when.
  entry_id uuid references public.entries(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by text,

  created_at timestamptz not null default now()
);

-- The entries screen reads one comp's inbox, pending first.
create index entry_submissions_competition_idx on public.entry_submissions (competition_id, status);

-- RLS ----------------------------------------------------------------------------------------------

-- True when the comp is publicly visible AND the operator has the entry form open. SECURITY DEFINER
-- so the anon insert policy can consult competitions without needing anon read on a draft comp.
create or replace function public.comp_accepts_entries(_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitions c
    where c.id = _competition_id
      and c.entry_form_open
      and c.status in ('published', 'active', 'completed')
  );
$$;

alter table public.entry_submissions enable row level security;

create policy "entry_submissions_admin_all" on public.entry_submissions
  for all to authenticated using (true) with check (true);

-- The single anonymous write in the app: the public may add a pending, unreviewed submission to a
-- comp that is accepting entries — and may do nothing else (no select, update or delete; an anon
-- insert cannot use PostgREST's return=representation since there is no anon read).
create policy "entry_submissions_public_insert" on public.entry_submissions
  for insert to anon
  with check (
    public.comp_accepts_entries(competition_id)
    and status = 'pending'
    and entry_id is null
    and reviewed_at is null
    and reviewed_by is null
  );

-- Realtime ------------------------------------------------------------------------------------------

-- Broadcast inbox changes so the entries screen can refresh its pending cards live. Subscriptions
-- inherit RLS: admin sessions receive events, anon receives nothing (no select policy).
alter table public.entry_submissions replica identity full;
alter publication supabase_realtime add table public.entry_submissions;
