-- Local test: capacity, idempotency, stale config, anon access.
\set ON_ERROR_STOP 0
insert into pricing_config (version, config, status) values ('2026-11-10-site-v1', '{}', 'active');
insert into capacity_slots (id, slot_date, starts_at, label, crews, vehicles)
values ('11111111-1111-1111-1111-111111111111', current_date + 7, '08:00', 'Förmiddag 08:00', 1, 1);

\echo '--- 1. first booking succeeds'
select reference, status from create_booking('aaaaaaaa-0000-0000-0000-000000000001',
  '{"type":"private","full_name":"Test Kund","email":"test@example.se","phone":"0701234567"}',
  '11111111-1111-1111-1111-111111111111', 1, 1, '{}', '{}', '{}',
  '{"status":"estimate","totalBeforeRutSek":3585,"rutDeductionSek":1500,"totalAfterRutSek":2085}',
  '2026-11-10-site-v1', null);

\echo '--- 2. same submission again (double click) returns the SAME booking'
select reference from create_booking('aaaaaaaa-0000-0000-0000-000000000001',
  '{"type":"private","full_name":"Test Kund","email":"test@example.se","phone":"0701234567"}',
  '11111111-1111-1111-1111-111111111111', 1, 1, '{}', '{}', '{}',
  '{"status":"estimate","totalBeforeRutSek":3585,"rutDeductionSek":1500,"totalAfterRutSek":2085}',
  '2026-11-10-site-v1', null);
select count(*) as bookings_total from bookings;

\echo '--- 3. another customer, slot now full -> SLOT_FULL'
select reference from create_booking('aaaaaaaa-0000-0000-0000-000000000002',
  '{"type":"private","full_name":"Annan Kund","email":"b@example.se","phone":"0707654321"}',
  '11111111-1111-1111-1111-111111111111', 1, 1, '{}', '{}', '{}',
  '{"status":"estimate","totalBeforeRutSek":1,"rutDeductionSek":0,"totalAfterRutSek":1}',
  '2026-11-10-site-v1', null);

\echo '--- 4. available_slots hides the full slot'
select count(*) as free_slots from available_slots(current_date, current_date + 30, 1, 1);

\echo '--- 5. stale price config is rejected'
insert into capacity_slots (id, slot_date, starts_at, label, crews, vehicles)
values ('22222222-2222-2222-2222-222222222222', current_date + 8, '08:00', 'Förmiddag 08:00', 2, 2);
select reference from create_booking('aaaaaaaa-0000-0000-0000-000000000003',
  '{"type":"private","full_name":"C","email":"c@example.se","phone":"0700000000"}',
  '22222222-2222-2222-2222-222222222222', 1, 1, '{}', '{}', '{}',
  '{"status":"estimate","totalBeforeRutSek":1,"rutDeductionSek":0,"totalAfterRutSek":1}',
  'old-version', null);

\echo '--- 6. anonymous role cannot read bookings or call create_booking'
set role anon;
select count(*) from bookings;
select create_booking('aaaaaaaa-0000-0000-0000-000000000004','{}','22222222-2222-2222-2222-222222222222',1,1,'{}','{}','{}','{}','2026-11-10-site-v1',null);
select count(*) as anon_sees_free_slots from available_slots(current_date, current_date + 30, 1, 1);
reset role;

\echo '--- 7. outbox has customer + company emails, history recorded'
select template from email_outbox order by id;
select to_status from booking_status_history;
