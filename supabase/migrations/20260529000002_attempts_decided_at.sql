-- Records when an attempt's result was last set to a terminal decision (good_lift / no_lift).
-- Powers the 60-second next-attempt countdown on the run screen: every device anchors the same
-- countdown on this server timestamp, so the clock agrees across devices and survives a reload.
-- Null while pending; cleared back to null when a decision is reverted to pending (which cancels the
-- countdown). No RLS change: the table-level attempts policies already cover every column.

alter table public.attempts
  add column decided_at timestamptz;
