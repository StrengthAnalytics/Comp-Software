-- Seed data for local/dev: one published full-power classic meet mid-squat-round.
-- Loaded by `supabase db reset` (config [db.seed]) and by `pnpm db:seed`.
-- Assumes a fresh database (run after migrations). Fixed UUIDs keep relationships readable.

-- 1. Staff auth user + meet director ---------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'director@example.com',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Meet Director"}'
)
on conflict (id) do nothing;

-- 2. Competition (published, classic, full power) --------------------------------------
insert into public.competitions (id, slug, name, federation, kit_type, event_type, status, starts_on, ends_on, created_by)
values (
  '22222222-2222-2222-2222-222222222222',
  'spring-classic-2026',
  'Spring Classic 2026',
  'IPF', 'classic', 'full_power', 'active',
  '2026-05-24', '2026-05-24',
  '11111111-1111-1111-1111-111111111111'
);

-- The created_by trigger grants meet_director automatically; keep this explicit too in case
-- the row is seeded without the trigger context.
insert into public.comp_roles (competition_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'meet_director')
on conflict (competition_id, user_id) do nothing;

-- 3. Divisions -------------------------------------------------------------------------
insert into public.divisions (competition_id, name, sort_order) values
  ('22222222-2222-2222-2222-222222222222', 'Open', 0),
  ('22222222-2222-2222-2222-222222222222', 'Sub-junior', 1),
  ('22222222-2222-2222-2222-222222222222', 'Junior', 2),
  ('22222222-2222-2222-2222-222222222222', 'Masters 1', 3),
  ('22222222-2222-2222-2222-222222222222', 'Masters 2', 4),
  ('22222222-2222-2222-2222-222222222222', 'Masters 3', 5),
  ('22222222-2222-2222-2222-222222222222', 'Masters 4', 6);

-- 4. Weight classes (IPF Open, kg) -----------------------------------------------------
insert into public.weight_classes (competition_id, name, gender, lower_kg, upper_kg, sort_order) values
  ('22222222-2222-2222-2222-222222222222', '59 kg', 'male', 0, 59.0, 0),
  ('22222222-2222-2222-2222-222222222222', '66 kg', 'male', 59.0, 66.0, 1),
  ('22222222-2222-2222-2222-222222222222', '74 kg', 'male', 66.0, 74.0, 2),
  ('22222222-2222-2222-2222-222222222222', '83 kg', 'male', 74.0, 83.0, 3),
  ('22222222-2222-2222-2222-222222222222', '93 kg', 'male', 83.0, 93.0, 4),
  ('22222222-2222-2222-2222-222222222222', '105 kg', 'male', 93.0, 105.0, 5),
  ('22222222-2222-2222-2222-222222222222', '120 kg', 'male', 105.0, 120.0, 6),
  ('22222222-2222-2222-2222-222222222222', '120 kg+', 'male', 120.0, null, 7),
  ('22222222-2222-2222-2222-222222222222', '47 kg', 'female', 0, 47.0, 8),
  ('22222222-2222-2222-2222-222222222222', '52 kg', 'female', 47.0, 52.0, 9),
  ('22222222-2222-2222-2222-222222222222', '57 kg', 'female', 52.0, 57.0, 10),
  ('22222222-2222-2222-2222-222222222222', '63 kg', 'female', 57.0, 63.0, 11),
  ('22222222-2222-2222-2222-222222222222', '69 kg', 'female', 63.0, 69.0, 12),
  ('22222222-2222-2222-2222-222222222222', '76 kg', 'female', 69.0, 76.0, 13),
  ('22222222-2222-2222-2222-222222222222', '84 kg', 'female', 76.0, 84.0, 14),
  ('22222222-2222-2222-2222-222222222222', '84 kg+', 'female', 84.0, null, 15);

-- 5. Platform, session, flights --------------------------------------------------------
insert into public.platforms (id, competition_id, name)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Platform 1');

insert into public.sessions (id, competition_id, platform_id, name, session_date, start_time, sort_order)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', 'Session 1', '2026-05-24', '09:30', 0);

insert into public.flights (id, competition_id, session_id, name, sort_order) values
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Flight A', 0),
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Flight B', 1);

-- 6. Lifters (8 men in Flight A, 8 women in Flight B) ----------------------------------
insert into public.lifters (id, first_name, surname, gender, date_of_birth, ipf_member_id, club, country) values
  ('77777777-0000-0000-0000-000000000001', 'James',   'Hart',     'male',   '1996-02-11', 'GB-1001', 'Iron Vault',   'GBR'),
  ('77777777-0000-0000-0000-000000000002', 'Owen',    'Fletcher', 'male',   '1994-07-03', 'GB-1002', 'Barbell Club', 'GBR'),
  ('77777777-0000-0000-0000-000000000003', 'Liam',    'Doyle',    'male',   '2003-09-19', 'GB-1003', 'Iron Vault',   'GBR'),
  ('77777777-0000-0000-0000-000000000004', 'Noah',    'Pryce',    'male',   '1988-12-30', 'GB-1004', 'Strength Lab', 'GBR'),
  ('77777777-0000-0000-0000-000000000005', 'Ethan',   'Marsh',    'male',   '1999-05-22', 'GB-1005', 'Barbell Club', 'GBR'),
  ('77777777-0000-0000-0000-000000000006', 'Mason',   'Quinn',    'male',   '1992-01-08', 'GB-1006', 'Iron Vault',   'GBR'),
  ('77777777-0000-0000-0000-000000000007', 'Lucas',   'Reeve',    'male',   '2005-03-14', 'GB-1007', 'Strength Lab', 'GBR'),
  ('77777777-0000-0000-0000-000000000008', 'Harry',   'Voss',     'male',   '1979-10-27', 'GB-1008', 'Barbell Club', 'GBR'),
  ('77777777-0000-0000-0000-000000000009', 'Ava',     'Sterling', 'female', '1997-04-17', 'GB-1009', 'Iron Vault',   'GBR'),
  ('77777777-0000-0000-0000-000000000010', 'Mia',     'Lowe',     'female', '1995-08-09', 'GB-1010', 'Barbell Club', 'GBR'),
  ('77777777-0000-0000-0000-000000000011', 'Isla',    'Bennett',  'female', '2004-06-25', 'GB-1011', 'Strength Lab', 'GBR'),
  ('77777777-0000-0000-0000-000000000012', 'Freya',   'Nash',     'female', '1986-11-02', 'GB-1012', 'Iron Vault',   'GBR'),
  ('77777777-0000-0000-0000-000000000013', 'Grace',   'Whitlock', 'female', '2000-02-28', 'GB-1013', 'Barbell Club', 'GBR'),
  ('77777777-0000-0000-0000-000000000014', 'Chloe',   'Friar',    'female', '1991-09-12', 'GB-1014', 'Strength Lab', 'GBR'),
  ('77777777-0000-0000-0000-000000000015', 'Daisy',   'Holt',     'female', '2006-01-05', 'GB-1015', 'Iron Vault',   'GBR'),
  ('77777777-0000-0000-0000-000000000016', 'Ruby',    'Calder',   'female', '1976-07-21', 'GB-1016', 'Barbell Club', 'GBR');

-- 7. Entries ---------------------------------------------------------------------------
-- Helper-free: weight_class_id and division_id resolved by scalar subquery on natural keys.
insert into public.entries (
  id, competition_id, lifter_id, weight_class_id, division_id, flight_id, lot_number,
  bodyweight_kg, opener_squat_kg, opener_bench_kg, opener_deadlift_kg,
  rack_height_squat, rack_height_bench, status
) values
  ('88888888-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000001',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='74 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '55555555-5555-5555-5555-555555555555', 1, 73.4, 180.0, 120.0, 220.0, '14', '8', 'lifting'),
  ('88888888-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000002',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='83 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '55555555-5555-5555-5555-555555555555', 2, 82.1, 192.5, 130.0, 235.0, '15', '9', 'lifting'),
  ('88888888-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000003',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='74 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Junior'),
    '55555555-5555-5555-5555-555555555555', 3, 73.9, 200.0, 132.5, 240.0, '15', '7', 'lifting'),
  ('88888888-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000004',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='93 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Masters 1'),
    '55555555-5555-5555-5555-555555555555', 4, 92.3, 205.0, 145.0, 250.0, '16', '9', 'lifting'),
  ('88888888-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000005',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='83 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '55555555-5555-5555-5555-555555555555', 5, 82.8, 210.0, 150.0, 255.0, '15', '8', 'lifting'),
  ('88888888-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000006',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='93 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '55555555-5555-5555-5555-555555555555', 6, 92.9, 215.0, 152.5, 260.0, '16', '9', 'lifting'),
  ('88888888-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000007',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='66 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Sub-junior'),
    '55555555-5555-5555-5555-555555555555', 7, 65.6, 220.0, 140.0, 250.0, '13', '7', 'lifting'),
  ('88888888-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000008',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='105 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Masters 2'),
    '55555555-5555-5555-5555-555555555555', 8, 104.2, 230.0, 160.0, 270.0, '17', '10', 'lifting'),
  ('88888888-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000009',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='63 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '66666666-6666-6666-6666-666666666666', 9, 62.7, 120.0, 70.0, 145.0, '11', '5', 'weighed_in'),
  ('88888888-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000010',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='69 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '66666666-6666-6666-6666-666666666666', 10, 68.4, 130.0, 75.0, 155.0, '12', '6', 'weighed_in'),
  ('88888888-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000011',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='57 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Junior'),
    '66666666-6666-6666-6666-666666666666', 11, 56.8, 110.0, 60.0, 135.0, '10', '4', 'weighed_in'),
  ('88888888-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000012',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='76 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Masters 1'),
    '66666666-6666-6666-6666-666666666666', 12, 75.1, 140.0, 80.0, 165.0, '12', '6', 'weighed_in'),
  ('88888888-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000013',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='63 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '66666666-6666-6666-6666-666666666666', 13, 62.2, 135.0, 72.5, 150.0, '11', '5', 'weighed_in'),
  ('88888888-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000014',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='84 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Open'),
    '66666666-6666-6666-6666-666666666666', 14, 83.3, 150.0, 90.0, 175.0, '13', '7', 'weighed_in'),
  ('88888888-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000015',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='52 kg'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Sub-junior'),
    '66666666-6666-6666-6666-666666666666', 15, 51.5, 95.0, 52.5, 120.0, '09', '4', 'weighed_in'),
  ('88888888-0000-0000-0000-000000000016', '22222222-2222-2222-2222-222222222222', '77777777-0000-0000-0000-000000000016',
    (select id from public.weight_classes where competition_id='22222222-2222-2222-2222-222222222222' and name='84 kg+'),
    (select id from public.divisions where competition_id='22222222-2222-2222-2222-222222222222' and name='Masters 3'),
    '66666666-6666-6666-6666-666666666666', 16, 91.7, 145.0, 85.0, 170.0, '13', '6', 'weighed_in');

-- 8. Attempts: Flight A mid squat round 1, Flight B squat round 1 declared but pending.
--    Flight A lots 1-6 completed (4 good, 2 no), lot 7 is the current lifter, lot 8 waiting.
insert into public.attempts (id, competition_id, entry_id, lift, attempt_number, weight_kg, declared_at, result) values
  ('a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000001', 'squat', 1, 180.0, now() - interval '40 min', 'good_lift'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000002', 'squat', 1, 192.5, now() - interval '35 min', 'good_lift'),
  ('a0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000003', 'squat', 1, 200.0, now() - interval '30 min', 'no_lift'),
  ('a0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000004', 'squat', 1, 205.0, now() - interval '24 min', 'good_lift'),
  ('a0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000005', 'squat', 1, 210.0, now() - interval '18 min', 'good_lift'),
  ('a0000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000006', 'squat', 1, 215.0, now() - interval '12 min', 'no_lift'),
  ('a0000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000007', 'squat', 1, 220.0, now() - interval '5 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000008', 'squat', 1, 230.0, now() - interval '4 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000009', 'squat', 1, 120.0, now() - interval '2 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000010', 'squat', 1, 130.0, now() - interval '2 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000011', 'squat', 1, 110.0, now() - interval '2 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000012', 'squat', 1, 140.0, now() - interval '2 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000013', 'squat', 1, 135.0, now() - interval '2 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000014', 'squat', 1, 150.0, now() - interval '2 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000015', 'squat', 1, 95.0, now() - interval '2 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000016', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000016', 'squat', 1, 145.0, now() - interval '2 min', 'pending');

-- Second squat attempts for the lifters who have already opened (declared, awaiting their turn).
insert into public.attempts (id, competition_id, entry_id, lift, attempt_number, weight_kg, declared_at, result) values
  ('a0000000-0000-0000-0000-000000000101', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000001', 'squat', 2, 190.0, now() - interval '20 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000102', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000002', 'squat', 2, 200.0, now() - interval '15 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000104', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000004', 'squat', 2, 215.0, now() - interval '8 min', 'pending'),
  ('a0000000-0000-0000-0000-000000000105', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000005', 'squat', 2, 220.0, now() - interval '3 min', 'pending');

-- 9. Referee decisions for the six completed Flight A squats (3 per attempt). ----------
insert into public.referee_decisions (competition_id, attempt_id, position, decision, reasons) values
  -- attempt 1: good lift, 3 white
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'left',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'head',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'right', 'white', '{}'),
  -- attempt 2: good lift, 3 white
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000002', 'left',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000002', 'head',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000002', 'right', 'white', '{}'),
  -- attempt 3: no lift, 3 red (depth)
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000003', 'left',  'red', '{depth}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000003', 'head',  'red', '{depth}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000003', 'right', 'red', '{depth}'),
  -- attempt 4: good lift, 2 white 1 red
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000004', 'left',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000004', 'head',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000004', 'right', 'red',   '{depth}'),
  -- attempt 5: good lift, 3 white
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000005', 'left',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000005', 'head',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000005', 'right', 'white', '{}'),
  -- attempt 6: no lift, 1 white 2 red (depth + downward motion)
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000006', 'left',  'white', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000006', 'head',  'red', '{depth}'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000006', 'right', 'red', '{downward_motion}');
