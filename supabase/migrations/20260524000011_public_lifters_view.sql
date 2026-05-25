-- Public-safe projection of lifters: name, gender, club, country only.
-- Deliberately omits date_of_birth and ipf_member_id so the public never sees lifter PII.
--
-- security_invoker is OFF (the default) on purpose: the view executes as its owner and so
-- bypasses the base-table RLS and the revoked anon grant on public.lifters. Row scope is
-- enforced here by the WHERE clause, which limits rows to lifters in a publicly visible comp.
create view public.public_lifters
with (security_invoker = false) as
  select
    l.id,
    l.first_name,
    l.surname,
    l.gender,
    l.club,
    l.country
  from public.lifters l
  where public.lifter_in_public_comp(l.id);

grant select on public.public_lifters to anon, authenticated;
