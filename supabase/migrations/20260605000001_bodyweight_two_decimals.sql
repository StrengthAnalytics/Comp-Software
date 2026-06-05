-- Bodyweight and weight-class bounds move to 2 decimal places (IPF weigh-in precision, 0.01 kg).
--
-- Weight classes become inclusive on both bounds, with each class's lower bound sitting 0.01 kg above
-- the class below's upper bound, so a boundary is unambiguous: a lifter at 83.00 kg is the -83 class
-- and one at 83.01 kg is -93 (too heavy for -83). New comps get the +0.01 bounds from the updated
-- DEFAULT_WEIGHT_CLASSES seed; this migration only widens the columns so those decimals can be stored.
--
-- Existing comps are deliberately NOT converted (we only care about future comps). Their bounds keep
-- the old whole-number values; assignment still routes a boundary weight to the lower class because
-- findWeightClassForBodyweight returns the first match in running order (lightest first).
--
-- Lift/attempt weights and openers are unchanged — still numeric(5,1), 0.5 kg increments.
-- types/database.types.ts needs no change: a numeric column maps to `number` regardless of scale.

alter table public.entries alter column bodyweight_kg type numeric(5, 2);
alter table public.weight_classes alter column lower_kg type numeric(5, 2);
alter table public.weight_classes alter column upper_kg type numeric(5, 2);
