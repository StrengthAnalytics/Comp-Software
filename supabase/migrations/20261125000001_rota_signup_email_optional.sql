-- A volunteer signing up on the public rota now needs a mobile number but not an email.
--
-- Organisers reach volunteers by text or call on the day, and the app never emails a volunteer, so
-- the email box was friction with nothing depending on it. The public form (rotaSignupSchema) now
-- asks for name and mobile, with the email optional.
--
-- 1. The anon insert policy required both email and phone (20261006000004). It now requires the
--    phone only, and that it holds at least 6 digits (ROTA_SIGNUP_PHONE_MIN, as the form's own
--    check does): a public sign-up must still carry a way to reach the volunteer, and a script using
--    the public key still can't add a contactless sign-up. Admin adds (name only allowed) are
--    unaffected, since they don't go through the anon policy.
--
-- 2. One sign-up per person per slot. The existing unique index on (role_id, lower(email)) stops a
--    double-submit taking two places, but an email-less sign-up slips past it (nulls never clash).
--    A second unique index on (role_id, name, mobile digits) covers those. It keys on the name as
--    well as the number so two people who share a phone (a parent and their teenager) can still both
--    take the same job; the mobile is compared by its digits only, so "07700 900000" and
--    "07700900000" count as the same number (the same mobile written once as 07... and once as
--    +44... is not caught: this is a double-tap guard, not proof of identity). Rows without a phone
--    (admin adds) are left out. The
--    email index is left as it is (one sign-up per email per slot, whatever the name): an email
--    address is one person's far more often than a phone is, and the email is now optional anyway.
--
-- Apply via the Supabase SQL editor. No table or column changes (email and phone are already
-- nullable), so types/database.types.ts is unchanged. Nothing is deleted. The index is made first
-- and says so in plain words if the same name and mobile are already in one slot twice (remove one
-- on the Staff rota screen and run this again); in that case the rule in step 1 is left as it was.

do $$
begin
  create unique index rota_signups_role_name_phone_idx on public.rota_signups (
    role_id,
    lower(btrim(name)),
    regexp_replace(phone, '\D', '', 'g')
  )
  where phone is not null;
exception
  when unique_violation then
    raise exception 'Nothing was changed. Two sign-ups in the same rota slot have the same name and mobile number. Remove one of them on the Staff rota screen, then run this script again.';
end;
$$;

drop policy "rota_signups_public_insert" on public.rota_signups;

create policy "rota_signups_public_insert" on public.rota_signups
  for insert to anon
  with check (
    public.comp_rota_open(competition_id)
    and phone is not null
    and length(regexp_replace(phone, '\D', '', 'g')) >= 6
  );
