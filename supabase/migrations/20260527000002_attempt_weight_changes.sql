-- Track how many times an attempt's weight has been changed after its initial declaration.
-- IPF allows a single increase on attempts 2 and 3 (CLAUDE.md): no decreases, and only once.
-- The attempt server actions read and increment this counter to enforce the limit; attempt 1
-- (the opener, set at weigh-in) is not changed through that path.

alter table public.attempts
  add column weight_changes smallint not null default 0;
