-- FX Flytt AB – database schema, first release (PostgreSQL 15+ / Supabase).
-- Principles:
--   * Row Level Security on every table. The public (anon) role has NO direct access to anything.
--     All customer actions go through the server API, which validates input and recomputes prices.
--   * Admin access only for users listed in admin_users.
--   * Every quote stores the pricing-config version it was computed with (traceability).
--   * Personnummer is stored encrypted, in its own table, and only when the customer asks for RUT.
--   * Capacity (crews and vehicles per time slot) is checked inside a locked transaction,
--     so two customers can never book the last crew at the same moment.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- roles ---
create table admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid() and role in ('owner','admin'));
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- ------------------------------------------------------- pricing config ---
-- One row per version. Exactly one 'active'. Old versions are kept forever (quotes refer to them).
create table pricing_config (
  id           uuid primary key default gen_random_uuid(),
  version      text not null unique,
  config       jsonb not null,
  status       text not null default 'draft' check (status in ('draft','active','archived')),
  note         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  activated_by uuid references auth.users(id),
  activated_at timestamptz
);
create unique index pricing_config_one_active on pricing_config (status) where status = 'active';

create table inventory_catalog (
  id         text primary key,
  label      text not null,
  room       text not null,
  volume_m3  numeric(6,2) not null check (volume_m3 > 0 and volume_m3 <= 20),
  sort       int not null default 0,
  active     boolean not null default true
);

create table service_areas (
  id            uuid primary key default gen_random_uuid(),
  city          text not null,
  postal_prefix text,                     -- e.g. '736' for Kungsör
  active        boolean not null default true,
  unique (city, postal_prefix)
);

-- ------------------------------------------------------------ capacity ---
-- Admin opens slots per day and says how many crews and vehicles are available.
-- (Full employee/vehicle management is a later release; this is the minimum needed to prevent overbooking.)
create table capacity_slots (
  id         uuid primary key default gen_random_uuid(),
  slot_date  date not null,
  starts_at  time not null,
  label      text not null,               -- e.g. 'Förmiddag 08:00'
  crews      int not null check (crews >= 0),
  vehicles   int not null check (vehicles >= 0),
  closed     boolean not null default false,
  unique (slot_date, starts_at)
);

-- ------------------------------------------------------------ customers ---
create table customers (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('private','business')),
  full_name    text not null check (length(full_name) between 2 and 120),
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone        text not null check (length(phone) between 6 and 30),
  company_name text,
  company_orgnr text,
  created_at   timestamptz not null default now()
);
create index customers_email on customers (lower(email));

-- Personnummer: separate table, encrypted with a key that lives only in the server environment.
create table customer_rut_identity (
  customer_id        uuid primary key references customers(id) on delete cascade,
  personnummer_enc   bytea not null,      -- pgp_sym_encrypt(personnummer, server_key)
  created_at         timestamptz not null default now(),
  delete_after       date not null        -- retention: removed when no longer needed for RUT
);

-- ------------------------------------------------------------- bookings ---
create type booking_status as enum (
  'new','pending_review','quote_sent','awaiting_customer','confirmed',
  'scheduled','in_progress','completed','cancelled'
);

create sequence booking_ref_seq;

create table bookings (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  idempotency_key   uuid not null unique,              -- one per form submission: stops double clicks
  customer_id       uuid not null references customers(id),
  status            booking_status not null default 'new',
  slot_id           uuid not null references capacity_slots(id),
  move_date         date not null,
  crews_needed      int not null check (crews_needed >= 1),
  vehicles_needed   int not null check (vehicles_needed >= 1),
  pickup            jsonb not null,                    -- address + floor/elevator/carry
  delivery          jsonb not null,
  quote_input       jsonb not null,                    -- what the customer entered
  quote             jsonb not null,                    -- what the SERVER computed
  config_version    text not null references pricing_config(version),
  total_before_rut  int not null,
  rut_deduction     int not null,
  total_after_rut   int not null,
  manual_adjustment int not null default 0,            -- admin price change / discount (signed)
  customer_message  text check (length(customer_message) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index bookings_date on bookings (move_date);
create index bookings_status on bookings (status);
create index bookings_slot on bookings (slot_id) where status <> 'cancelled';

create table booking_status_history (
  id          bigserial primary key,
  booking_id  uuid not null references bookings(id) on delete cascade,
  from_status booking_status,
  to_status   booking_status not null,
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz not null default now()
);

create table booking_notes (
  id         bigserial primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  body       text not null check (length(body) <= 4000),
  author     uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Emails are queued here and sent by a worker. Templates never include personnummer.
create table email_outbox (
  id          bigserial primary key,
  booking_id  uuid references bookings(id) on delete cascade,
  template    text not null,
  to_address  text not null,
  status      text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts    int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create table audit_log (
  id         bigserial primary key,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------- capacity-safe insert ---
-- Called only by the server (service role) after it has recomputed the quote.
-- Returns the booking (existing one if the same idempotency key was already used).
create or replace function create_booking(
  p_idempotency_key uuid, p_customer jsonb, p_slot_id uuid,
  p_crews int, p_vehicles int, p_pickup jsonb, p_delivery jsonb,
  p_quote_input jsonb, p_quote jsonb, p_config_version text, p_message text
) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_slot capacity_slots;
  v_used_crews int; v_used_vehicles int;
  v_customer_id uuid;
  v_booking bookings;
begin
  -- 1. Same submission sent twice -> return the first booking, create nothing.
  select * into v_booking from bookings where idempotency_key = p_idempotency_key;
  if found then return v_booking; end if;

  -- 2. Lock the slot row: concurrent bookings for this slot wait here, one at a time.
  select * into v_slot from capacity_slots where id = p_slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_slot.closed or v_slot.slot_date < current_date then
    raise exception 'SLOT_CLOSED' using errcode = 'P0001';
  end if;

  select coalesce(sum(crews_needed),0), coalesce(sum(vehicles_needed),0)
    into v_used_crews, v_used_vehicles
    from bookings where slot_id = p_slot_id and status <> 'cancelled';

  if v_used_crews + p_crews > v_slot.crews or v_used_vehicles + p_vehicles > v_slot.vehicles then
    raise exception 'SLOT_FULL' using errcode = 'P0001';
  end if;

  if not exists (select 1 from pricing_config where version = p_config_version and status = 'active') then
    raise exception 'STALE_PRICE_CONFIG' using errcode = 'P0001';
  end if;

  insert into customers (type, full_name, email, phone, company_name, company_orgnr)
  values (p_customer->>'type', p_customer->>'full_name', p_customer->>'email', p_customer->>'phone',
          p_customer->>'company_name', p_customer->>'company_orgnr')
  returning id into v_customer_id;

  insert into bookings (reference, idempotency_key, customer_id, status, slot_id, move_date,
                        crews_needed, vehicles_needed, pickup, delivery, quote_input, quote, config_version,
                        total_before_rut, rut_deduction, total_after_rut, customer_message)
  values ('FX-' || to_char(now(),'YYYY') || '-' || lpad(nextval('booking_ref_seq')::text, 5, '0'),
          p_idempotency_key, v_customer_id,
          case when p_quote->>'status' = 'estimate' then 'new' else 'pending_review' end::booking_status,
          p_slot_id, v_slot.slot_date, p_crews, p_vehicles, p_pickup, p_delivery, p_quote_input, p_quote,
          p_config_version, (p_quote->>'totalBeforeRutSek')::int, (p_quote->>'rutDeductionSek')::int,
          (p_quote->>'totalAfterRutSek')::int, p_message)
  returning * into v_booking;

  insert into booking_status_history (booking_id, from_status, to_status) values (v_booking.id, null, v_booking.status);
  insert into email_outbox (booking_id, template, to_address) values
    (v_booking.id, 'booking_received_customer', p_customer->>'email'),
    (v_booking.id, 'booking_received_company', 'company');   -- resolved to FX Flytt's address by the worker
  return v_booking;
exception when unique_violation then
  -- Two identical submissions raced past step 1: return the winner.
  select * into v_booking from bookings where idempotency_key = p_idempotency_key;
  if found then return v_booking; end if;
  raise;
end $$;

-- Public availability: only dates/slots with free capacity, no booking details at all.
create or replace function available_slots(p_from date, p_to date, p_crews int, p_vehicles int)
returns table (slot_id uuid, slot_date date, starts_at time, label text)
language sql stable security definer set search_path = public as $$
  select s.id, s.slot_date, s.starts_at, s.label
  from capacity_slots s
  left join bookings b on b.slot_id = s.id and b.status <> 'cancelled'
  where s.slot_date between greatest(p_from, current_date + 1) and least(p_to, current_date + 180)
    and not s.closed
  group by s.id
  having s.crews - coalesce(sum(b.crews_needed),0) >= p_crews
     and s.vehicles - coalesce(sum(b.vehicles_needed),0) >= p_vehicles
  order by s.slot_date, s.starts_at;
$$;

-- Status changes by admin, with history.
create or replace function set_booking_status(p_booking uuid, p_status booking_status)
returns void language plpgsql security definer set search_path = public as $$
declare v_old booking_status;
begin
  if not is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select status into v_old from bookings where id = p_booking for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old = p_status then return; end if;
  update bookings set status = p_status, updated_at = now() where id = p_booking;
  insert into booking_status_history (booking_id, from_status, to_status, changed_by) values (p_booking, v_old, p_status, auth.uid());
  insert into audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'status_change', 'booking', p_booking::text, jsonb_build_object('from', v_old, 'to', p_status));
end $$;

-- ------------------------------------------------------------------ RLS ---
alter table admin_users            enable row level security;
alter table pricing_config         enable row level security;
alter table inventory_catalog      enable row level security;
alter table service_areas          enable row level security;
alter table capacity_slots         enable row level security;
alter table customers              enable row level security;
alter table customer_rut_identity  enable row level security;
alter table bookings               enable row level security;
alter table booking_status_history enable row level security;
alter table booking_notes          enable row level security;
alter table email_outbox           enable row level security;
alter table audit_log              enable row level security;

-- Staff can read operational data; only admins/owner change prices and capacity.
create policy staff_read_bookings  on bookings  for select using (is_staff());
create policy admin_update_bookings on bookings for update using (is_admin()) with check (is_admin());
create policy staff_read_customers on customers for select using (is_staff());
create policy admin_update_customers on customers for update using (is_admin()) with check (is_admin());
create policy staff_read_history   on booking_status_history for select using (is_staff());
create policy staff_notes_read     on booking_notes for select using (is_staff());
create policy staff_notes_write    on booking_notes for insert with check (is_staff() and author = auth.uid());
create policy staff_read_slots     on capacity_slots for select using (is_staff());
create policy admin_write_slots    on capacity_slots for all using (is_admin()) with check (is_admin());
create policy staff_read_pricing   on pricing_config for select using (is_staff());
create policy admin_write_pricing  on pricing_config for all using (is_admin()) with check (is_admin());
create policy admin_catalog        on inventory_catalog for all using (is_admin()) with check (is_admin());
create policy admin_areas          on service_areas for all using (is_admin()) with check (is_admin());
create policy admin_read_audit     on audit_log for select using (is_admin());
create policy admin_read_outbox    on email_outbox for select using (is_admin());
create policy self_read_admin      on admin_users for select using (user_id = auth.uid() or is_admin());
-- customer_rut_identity: NO policies -> only the server (service role) can read it, never the dashboard UI directly.

revoke all on all tables in schema public from anon;
revoke execute on function create_booking from public, anon, authenticated;
revoke execute on function available_slots from public;
grant  execute on function available_slots to anon, authenticated;
