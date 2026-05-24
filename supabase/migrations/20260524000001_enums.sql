-- Domain enums and shared trigger helpers for Comp-Software.
-- One concern per migration file; this file owns the type vocabulary.

create type public.kit_type as enum ('classic', 'equipped');

create type public.event_type as enum ('full_power', 'bench_only', 'deadlift_only');

create type public.comp_status as enum ('draft', 'published', 'active', 'completed');

create type public.entry_status as enum (
  'registered',
  'checked_in',
  'weighed_in',
  'lifting',
  'finished',
  'withdrawn',
  'disqualified'
);

create type public.lift_type as enum ('squat', 'bench', 'deadlift');

create type public.attempt_result as enum (
  'pending',
  'good_lift',
  'no_lift',
  'not_taken',
  'withdrawn'
);

create type public.ref_position as enum ('left', 'head', 'right');

create type public.ref_decision as enum ('white', 'red');

-- referee and jury are v2 roles, included now so the enum is stable across versions.
create type public.comp_role as enum (
  'meet_director',
  'scorekeeper',
  'table_loader',
  'referee',
  'jury',
  'announcer',
  'viewer'
);

-- Shared trigger to keep updated_at columns current on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
