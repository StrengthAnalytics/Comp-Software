-- Rack-heights completion marker. The rack-heights screen (run from a phone in the warm-up room, one
-- lifter at a time) needs a persistent "done" flag, mirroring how the weigh-in screen treats
-- weighed_in: a lifter whose rack settings have been recorded sinks to the bottom of the list and
-- collapses. Rack settings are optional (a lifter may self-spot, or not set a squat position), so
-- completion can't be inferred from the columns being filled — hence an explicit flag. Defaults
-- false; existing rows read as "not set". No RLS change: the table-level entries_admin_all /
-- entries_public_read policies already cover every column.
alter table public.entries
  add column racks_set boolean not null default false;
