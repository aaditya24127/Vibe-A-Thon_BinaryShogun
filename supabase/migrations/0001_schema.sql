-- WeConnect schema. All timestamps default to server time.

create sequence batch_seq start 1100;
create sequence alloc_seq start 1;
create sequence lease_seq start 1;
create sequence unresolved_seq start 1;
create sequence incident_seq start 1;

create table settings (
  key text primary key,
  value numeric not null,
  note text
);

create table donors (
  id text primary key,
  name text not null,
  type text not null check (type in ('restaurant','hostel_mess','pharmacy','other')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  area_name text not null
);

create table shelters (
  id text primary key,
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  area_name text not null,
  total_capacity integer not null check (total_capacity >= 0),
  unmet_demand integer not null check (unmet_demand >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  accepted_categories text[] not null default '{}',
  has_water boolean not null default false,
  has_cooking_fuel boolean not null default false,
  has_cold_storage boolean not null default false,
  updated_at timestamptz not null default now()
);

create table riders (
  id text primary key,
  name text not null,
  capacity_units integer not null check (capacity_units >= 0),
  lat double precision not null,
  lng double precision not null,
  availability text not null default 'available' check (availability in ('available','assigned','offline')),
  last_heartbeat_at timestamptz not null default now(),
  active_lease_count integer not null default 0 check (active_lease_count >= 0),
  release_count integer not null default 0 check (release_count >= 0),
  mode text not null default 'simulated' check (mode in ('simulated','device')),
  sim_silent boolean not null default false
);

create table batches (
  id text primary key,
  donor_id text not null references donors(id) on delete restrict,
  item_name text not null,
  category text not null check (category in ('cooked_food','medical','ration_kit','infant_formula','essential_kit')),
  quantity integer not null check (quantity > 0),
  remaining_qty integer not null check (remaining_qty >= 0),
  unit text not null,
  pickup_window_start timestamptz not null,
  pickup_window_end timestamptz not null,
  expires_at timestamptz not null,
  safe_by_at timestamptz not null,
  handling_notes text not null default '',
  storage_requirement text not null default '',
  compatibility_requirement text not null default '',
  status text not null default 'AVAILABLE' check (status in
    ('AVAILABLE','RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','DELIVERED','EXPIRED','CANCELLED','RELEASED','REROUTING','CUSTODY_UNCERTAIN','UNRESOLVED')),
  created_at timestamptz not null default now(),
  check (remaining_qty <= quantity),
  check (pickup_window_end >= pickup_window_start)
);

create table allocations (
  id text primary key default ('AL-' || nextval('alloc_seq')),
  batch_id text not null references batches(id) on delete restrict,
  shelter_id text not null references shelters(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  feasibility text not null check (feasibility in ('feasible','at_risk','infeasible')),
  blocking_reason text,
  status text not null check (status in
    ('AVAILABLE','RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','DELIVERED','EXPIRED','CANCELLED','RELEASED','REROUTING','CUSTODY_UNCERTAIN','UNRESOLVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table leases (
  id text primary key default ('LS-' || nextval('lease_seq')),
  allocation_id text not null references allocations(id) on delete cascade,
  rider_id text not null references riders(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  claimed_at timestamptz not null default now(),
  ack_deadline timestamptz not null,
  last_heartbeat_at timestamptz not null default now(),
  custody text not null default 'none' check (custody in ('none','uncertain','confirmed')),
  status text not null check (status in
    ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','DELIVERED','EXPIRED','CANCELLED','RELEASED','REROUTING','CUSTODY_UNCERTAIN','UNRESOLVED')),
  eta_at timestamptz,
  delay_min integer not null default 0 check (delay_min >= 0),
  unique (allocation_id)
);

create table compatibility_rules (
  id text primary key,
  category text not null check (category in ('cooked_food','medical','ration_kit','infant_formula','essential_kit')),
  required_resources text[] not null,
  source_note text not null,
  verified boolean not null default false
);

create table events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  previous_state text,
  new_state text,
  reason text not null,
  event_type text,
  quantity numeric,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table incidents (
  id text primary key default ('IN-' || nextval('incident_seq')),
  rider_id text not null references riders(id) on delete cascade,
  type text not null check (type in ('delay','road_blocked','vehicle_issue','other')),
  related_lease_id text references leases(id) on delete set null,
  note text not null default '',
  sync_status text not null default 'received' check (sync_status in ('saved_locally','pending','received','processed')),
  created_at timestamptz not null default now()
);

create table unresolved (
  id text primary key default ('UR-' || nextval('unresolved_seq')),
  batch_id text not null references batches(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  reason text not null,
  cargo_with_rider boolean not null default false,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table action_log (
  action_id text primary key,
  rpc text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index batches_status_idx on batches(status);
create index batches_expires_idx on batches(expires_at);
create index batches_safe_by_idx on batches(safe_by_at);
create index allocations_batch_idx on allocations(batch_id);
create index allocations_shelter_idx on allocations(shelter_id);
create index allocations_status_idx on allocations(status);
create index leases_rider_idx on leases(rider_id);
create index leases_status_idx on leases(status);
create index leases_ack_idx on leases(ack_deadline);
create index events_created_idx on events(created_at desc);
create index events_entity_idx on events(entity_type, entity_id);
create index unresolved_batch_idx on unresolved(batch_id);
create index incidents_rider_idx on incidents(rider_id);
