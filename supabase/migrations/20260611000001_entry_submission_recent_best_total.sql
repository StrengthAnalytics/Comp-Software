-- Public entry form: a new toggleable question — the lifter's best competition total from the
-- last 12 months. Like predicted_total_kg it is informational for the admin (it helps seed
-- prime-time flights); it configures nothing on the entry. Off by default on every comp's form
-- design (the jsonb reads a missing key as 'off'), so existing forms are unchanged until an
-- admin switches the question on.
--
-- Apply via the Supabase SQL editor. types/database.types.ts is hand-updated in the same commit.
-- No RLS change: the column rides the existing entry_submissions policies.

alter table public.entry_submissions
  -- Lift weights are kg to 1 dp (numeric(6,1) like predicted_total_kg — a total can exceed 999.9).
  add column recent_best_total_kg numeric(6,1) check (recent_best_total_kg > 0);
