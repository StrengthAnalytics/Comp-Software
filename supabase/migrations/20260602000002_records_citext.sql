-- Make the records natural key case-insensitive.
--
-- The records table is unique on (region, gender, weight_class, age_category, lift, equipment), but
-- those text columns compared case-sensitively, so "England" and "england" (or "Open" / "open") were
-- two distinct records for one logical category — the exact duplicate the unique key exists to
-- prevent. The app-layer key (recordNaturalKey) already lowercases region/weight_class/age_category,
-- so it disagreed with the database and could report an "update" while actually inserting a duplicate.
--
-- Converting the free-text key columns to citext (case-insensitive text) makes the existing unique
-- index case-insensitive on those columns while preserving the stored display case, and — unlike a
-- functional `lower(...)` unique index — it keeps the column-name ON CONFLICT target that
-- bulkUpsertRecordsAction relies on working. No application or type change is needed: citext maps to
-- `string` in TypeScript, and recordNaturalKey's lowercasing now agrees with the database.
--
-- PRE-CHECK: this rebuilds the unique index, so it fails if the table already holds two rows that
-- differ only by case in region/weight_class/age_category. Find any first with:
--   select lower(region), gender, lower(weight_class), lower(age_category), lift, equipment, count(*)
--   from public.records
--   group by 1,2,3,4,5,6 having count(*) > 1;
-- and reconcile those rows before applying. If `type "citext" does not exist`, run
--   create extension if not exists citext with schema public;
-- and re-run.

create extension if not exists citext;

alter table public.records
  alter column region type citext using region::citext,
  alter column weight_class type citext using weight_class::citext,
  alter column age_category type citext using age_category::citext;
