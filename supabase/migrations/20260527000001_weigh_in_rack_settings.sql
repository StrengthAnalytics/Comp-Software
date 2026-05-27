-- Weigh-in rack and bench settings. Rack and bench heights become integers (hole numbers on the
-- rack), and the squat rack position and bench spotting preference each get an enum. Every column
-- here stays nullable: a lifter is marked weighed-in on bodyweight and openers alone, with the rack
-- details captured later at the platform.

create type public.squat_rack_setting as enum ('in', 'out', 'left_in', 'right_in');

create type public.bench_spotting as enum ('self', 'hand_out');

-- The rack height columns were free text; replace them with integers. Per the operator there is no
-- rack-height data in the dev project worth preserving, so this drops the old columns outright.
alter table public.entries
  drop column rack_height_squat,
  drop column rack_height_bench;

alter table public.entries
  add column rack_height_squat int,
  add column squat_rack_setting public.squat_rack_setting,
  add column rack_height_bench int,
  add column bench_safety_height int,
  add column bench_spotting public.bench_spotting;
