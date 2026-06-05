-- Bodyweight and weight-class bounds move to 2 decimal places (IPF weigh-in precision, 0.01 kg).
--
-- Weight classes become inclusive on both bounds, with each class's lower bound sitting 0.01 kg above
-- the class below's upper bound, so a boundary is unambiguous: a lifter at 83.00 kg is the -83 class
-- and one at 83.01 kg is -93 (too heavy for -83). Previously the lower bound was treated as exclusive
-- (bw > lower); that is equivalent to an inclusive bound of (lower + 0.01) at 2 dp, so existing rows
-- are converted by adding 0.01 to every non-zero lower bound. The lightest class keeps its 0 lower
-- bound (it catches every lighter lifter).
--
-- Lift/attempt weights and openers are unchanged — still numeric(5,1), 0.5 kg increments.
-- types/database.types.ts needs no change: a numeric column maps to `number` regardless of scale.

alter table public.entries alter column bodyweight_kg type numeric(5, 2);
alter table public.weight_classes alter column lower_kg type numeric(5, 2);
alter table public.weight_classes alter column upper_kg type numeric(5, 2);

-- Convert existing exclusive lower bounds to the new inclusive (+0.01) form. Run once, on apply.
-- Any bespoke class should be double-checked afterwards.
update public.weight_classes set lower_kg = round(lower_kg + 0.01, 2) where lower_kg > 0;
