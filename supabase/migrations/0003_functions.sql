-- WeConnect transition functions. The browser suggests, the database decides.
-- Public RPCs take an action_id first, are idempotent through action_log, and run in one transaction.
-- Names starting with an underscore are internal and not granted to anon.

-- ---------------------------------------------------------------- helpers

create or replace function setting_num(k text) returns numeric
language sql stable set search_path = public as $$ select value from settings where key = k $$;

create or replace function sim_now() returns timestamptz
language sql stable set search_path = public as $$
  select now() + make_interval(mins => coalesce((select value from settings where key = 'clock_offset_min'), 0)::int)
$$;

create or replace function haversine_km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

create or replace function leg_min(km double precision) returns double precision
language sql stable set search_path = public as $$ select km / setting_num('speed_kmph')::float8 * 60 $$;

create or replace function _ack_window() returns interval
language sql stable set search_path = public as $$
  select make_interval(secs => (setting_num('missed_heartbeat_threshold') * setting_num('heartbeat_interval_s') + setting_num('ack_grace_s'))::float8)
$$;

create or replace function _ok(p_state text, p_reason text, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable as $$ select jsonb_build_object('success', true, 'new_state', p_state, 'reason', p_reason) || coalesce(p_extra, '{}'::jsonb) $$;

create or replace function _fail(p_reason text, p_state text default null) returns jsonb
language sql immutable as $$ select jsonb_build_object('success', false, 'new_state', p_state, 'reason', p_reason) $$;

create or replace function _dup(p_id text) returns jsonb
language sql stable set search_path = public as $$
  select result || '{"duplicate":true}'::jsonb from action_log where action_id = p_id
$$;

create or replace function _done(p_id text, p_rpc text, p_res jsonb) returns jsonb
language plpgsql set search_path = public as $$
begin
  insert into action_log(action_id, rpc, result) values (p_id, p_rpc, p_res) on conflict (action_id) do nothing;
  return p_res;
end $$;

create or replace function _event(p_type text, p_id text, p_prev text, p_new text, p_reason text,
  p_kind text default null, p_qty numeric default null, p_meta jsonb default '{}'::jsonb) returns void
language plpgsql set search_path = public as $$
begin
  insert into events(entity_type, entity_id, previous_state, new_state, reason, event_type, quantity, meta)
  values (p_type, p_id, p_prev, p_new, p_reason, p_kind, p_qty, coalesce(p_meta, '{}'::jsonb));
end $$;

create or replace function _reserved(p_shelter text) returns integer
language sql stable set search_path = public as $$
  select coalesce(sum(quantity), 0)::int from allocations
  where shelter_id = p_shelter and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','CUSTODY_UNCERTAIN')
$$;

create or replace function _committed(p_rider text) returns integer
language sql stable set search_path = public as $$
  select coalesce(sum(quantity), 0)::int from leases
  where rider_id = p_rider and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','CUSTODY_UNCERTAIN')
$$;

create or replace function _refresh_rider(p_rider text) returns void
language plpgsql set search_path = public as $$
declare v_n int;
begin
  select count(*) into v_n from leases
  where rider_id = p_rider and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','CUSTODY_UNCERTAIN');
  update riders set active_lease_count = v_n,
    availability = case when availability = 'offline' then 'offline' when v_n > 0 then 'assigned' else 'available' end
  where id = p_rider;
end $$;

-- Compatibility: {ok, reason, flag}. Verified failure blocks; unverified failure is flagged.
create or replace function _compat(p_cat text, p_shelter text) returns jsonb
language plpgsql stable set search_path = public as $$
declare s shelters%rowtype; r record; v_missing text[]; v_flag text;
begin
  select * into s from shelters where id = p_shelter;
  if not found then return jsonb_build_object('ok', false, 'reason', 'Shelter not found'); end if;
  if s.status <> 'open' then return jsonb_build_object('ok', false, 'reason', s.name || ' is closed'); end if;
  if not (p_cat = any(s.accepted_categories)) then
    return jsonb_build_object('ok', false, 'reason', s.name || ' does not accept ' || replace(p_cat, '_', ' '));
  end if;
  for r in select * from compatibility_rules where category = p_cat order by id loop
    select array_agg(replace(x, '_', ' ')) into v_missing from unnest(r.required_resources) x
    where not (case x when 'water' then s.has_water when 'cooking_fuel' then s.has_cooking_fuel when 'cold_storage' then s.has_cold_storage else true end);
    if v_missing is not null then
      if r.verified then
        return jsonb_build_object('ok', false, 'reason',
          format('Blocked: %s needs %s at the shelter, and %s has none. Basis: %s', replace(p_cat, '_', ' '), array_to_string(v_missing, ' and '), s.name, r.source_note));
      else
        v_flag := concat_ws('; ', v_flag, format('Rule pending verification: %s may need %s at %s', replace(p_cat, '_', ' '), array_to_string(v_missing, ' and '), s.name));
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'flag', v_flag);
end $$;

-- Feasibility of delivering a batch to a shelter from a start point.
-- minutes = offset + [leg to donor + pickup allowance] + leg to shelter. Deadline is expires_at minus the safety buffer.
create or replace function _assess(p_batch text, p_shelter text, p_lat double precision, p_lng double precision,
  p_via_donor boolean, p_offset_min double precision) returns jsonb
language plpgsql stable set search_path = public as $$
declare b batches%rowtype; d donors%rowtype; s shelters%rowtype; v_min double precision; v_pick double precision;
  v_eta timestamptz; v_slack double precision; v_feas text := 'feasible'; v_reason text;
begin
  select * into b from batches where id = p_batch;
  select * into d from donors where id = b.donor_id;
  select * into s from shelters where id = p_shelter;
  if p_via_donor then
    v_pick := p_offset_min + leg_min(haversine_km(p_lat, p_lng, d.lat, d.lng));
    v_min := v_pick + setting_num('pickup_allowance_min')::float8 + leg_min(haversine_km(d.lat, d.lng, s.lat, s.lng));
  else
    v_pick := null;
    v_min := p_offset_min + leg_min(haversine_km(p_lat, p_lng, s.lat, s.lng));
  end if;
  v_eta := sim_now() + make_interval(secs => v_min * 60);
  v_slack := extract(epoch from (b.expires_at - setting_num('safety_buffer_min')::float8 * interval '1 minute' - v_eta)) / 60.0;
  if v_pick is not null and sim_now() + make_interval(secs => v_pick * 60) > b.pickup_window_end then
    v_feas := 'infeasible'; v_reason := 'Rider cannot reach the donor before the pickup window closes';
  elsif v_slack < 0 then
    v_feas := 'infeasible';
    v_reason := format('Arrival %s min after the safe-by limit (expiry minus %s min buffer)', round((-v_slack)::numeric, 0), setting_num('safety_buffer_min'));
  elsif v_slack < setting_num('at_risk_threshold_min') then
    v_feas := 'at_risk'; v_reason := format('Only %s min of margin before the safe-by limit', round(v_slack::numeric, 0));
  end if;
  return jsonb_build_object('eta', v_eta, 'slack_min', round(v_slack::numeric, 1), 'feasibility', v_feas, 'reason', v_reason, 'minutes', v_min);
end $$;

create or replace function _safe_by_calc(p_donor text, p_category text, p_expires timestamptz) returns timestamptz
language plpgsql stable set search_path = public as $$
declare d donors%rowtype; v_km double precision;
begin
  select * into d from donors where id = p_donor;
  select min(haversine_km(d.lat, d.lng, s.lat, s.lng)) into v_km from shelters s
  where s.status = 'open' and p_category = any(s.accepted_categories);
  return p_expires - (setting_num('safety_buffer_min') + setting_num('pickup_allowance_min') + coalesce(leg_min(v_km), 0)::numeric)::float8 * interval '1 minute';
end $$;

-- Lifecycle setter for an allocation and its lease, with one event row.
create or replace function _set_alloc(p_id text, p_new text, p_reason text, p_kind text default null) returns void
language plpgsql set search_path = public as $$
declare v_prev text; v_qty int;
begin
  select status, quantity into v_prev, v_qty from allocations where id = p_id for update;
  update allocations set status = p_new, updated_at = now() where id = p_id;
  update leases set status = p_new where allocation_id = p_id;
  perform _event('allocation', p_id, v_prev, p_new, p_reason, p_kind, v_qty);
end $$;

-- Batch status is a roll-up of its allocations.
create or replace function _rollup(p_batch text) returns void
language plpgsql set search_path = public as $$
declare b batches%rowtype; v_new text; v_deliv int; v_unres int;
begin
  select * into b from batches where id = p_batch for update;
  if b.status in ('EXPIRED','CANCELLED') then return; end if;
  select coalesce(sum(quantity), 0) into v_deliv from allocations where batch_id = p_batch and status = 'DELIVERED';
  select coalesce(sum(quantity), 0) into v_unres from unresolved where batch_id = p_batch and status = 'open';
  if exists (select 1 from allocations where batch_id = p_batch and status = 'CUSTODY_UNCERTAIN') then v_new := 'CUSTODY_UNCERTAIN';
  elsif exists (select 1 from allocations where batch_id = p_batch and status = 'RESERVED') then v_new := 'RESERVED';
  elsif exists (select 1 from allocations where batch_id = p_batch and status = 'PICKUP_CONFIRMED') then v_new := 'PICKUP_CONFIRMED';
  elsif exists (select 1 from allocations where batch_id = p_batch and status = 'IN_TRANSIT') then v_new := 'IN_TRANSIT';
  elsif exists (select 1 from allocations where batch_id = p_batch and status = 'REROUTING') then v_new := 'REROUTING';
  elsif b.remaining_qty > 0 then v_new := 'AVAILABLE';
  elsif v_unres > 0 then v_new := 'UNRESOLVED';
  elsif v_deliv > 0 then v_new := 'DELIVERED';
  else v_new := 'AVAILABLE';
  end if;
  if v_new <> b.status then
    update batches set status = v_new where id = p_batch;
    perform _event('batch', p_batch, b.status, v_new, 'Batch status follows its allocations', null, null);
  end if;
end $$;

create or replace function _new_alloc(p_batch text, p_shelter text, p_rider text, p_qty int, p_status text,
  p_assess jsonb, p_flag text, p_delay int, p_reason text, p_kind text) returns jsonb
language plpgsql set search_path = public as $$
declare v_alloc text; v_lease text; v_feas text; v_why text;
begin
  v_feas := p_assess->>'feasibility';
  if p_flag is not null and v_feas = 'feasible' then v_feas := 'at_risk'; end if;
  v_why := nullif(concat_ws('; ', p_flag, p_assess->>'reason'), '');
  insert into allocations(batch_id, shelter_id, quantity, feasibility, blocking_reason, status)
  values (p_batch, p_shelter, p_qty, v_feas, v_why, p_status) returning id into v_alloc;
  insert into leases(allocation_id, rider_id, quantity, claimed_at, ack_deadline, last_heartbeat_at, custody, status, eta_at, delay_min)
  values (v_alloc, p_rider, p_qty, now(), sim_now() + _ack_window(), sim_now(),
    case when p_status = 'RESERVED' then 'none' else 'confirmed' end, p_status, (p_assess->>'eta')::timestamptz, coalesce(p_delay, 0))
  returning id into v_lease;
  perform _event('allocation', v_alloc, null, p_status, p_reason, p_kind, p_qty,
    jsonb_build_object('rider_id', p_rider, 'shelter_id', p_shelter, 'lease_id', v_lease, 'feasibility', v_feas));
  perform _refresh_rider(p_rider);
  return jsonb_build_object('allocation_id', v_alloc, 'lease_id', v_lease, 'feasibility', v_feas, 'eta', p_assess->>'eta', 'flag', p_flag);
end $$;

-- ---------------------------------------------------------------- claim

create or replace function _claim(p_batch text, p_shelter text, p_rider text, p_qty int, p_by text) returns jsonb
language plpgsql set search_path = public as $$
declare b batches%rowtype; r riders%rowtype; s shelters%rowtype; c jsonb; a jsonb; v_avail int; v_new jsonb;
begin
  select * into b from batches where id = p_batch for update;
  if not found then return _fail('Batch not found'); end if;
  select * into r from riders where id = p_rider for update;
  if not found then return _fail('Rider not found'); end if;
  select * into s from shelters where id = p_shelter;
  if not found then return _fail('Shelter not found'); end if;
  if p_qty is null or p_qty <= 0 then return _fail('Quantity must be greater than zero'); end if;
  if b.status in ('EXPIRED','CANCELLED','DELIVERED') or sim_now() >= b.expires_at then
    return _fail('Batch has expired or is no longer available', b.status);
  end if;
  if b.remaining_qty <= 0 then return _fail('Already taken: no unallocated quantity remains', b.status); end if;
  if p_qty > b.remaining_qty then
    return _fail(format('Only %s %s remain unallocated', b.remaining_qty, b.unit), b.status);
  end if;
  if r.availability = 'offline' then return _fail('Rider is offline'); end if;
  if r.active_lease_count >= setting_num('max_active_leases') then
    return _fail(format('Rider already holds %s active leases (limit %s)', r.active_lease_count, setting_num('max_active_leases')));
  end if;
  if _committed(r.id) + p_qty > r.capacity_units then
    return _fail(format('Exceeds rider capacity: %s of %s units already committed, adding %s', _committed(r.id), r.capacity_units, p_qty));
  end if;
  c := _compat(b.category, s.id);
  if not (c->>'ok')::boolean then return _fail(c->>'reason'); end if;
  v_avail := s.unmet_demand - _reserved(s.id);
  if p_qty > v_avail then
    return _fail(format('%s needs only %s more units after existing reservations', s.name, greatest(v_avail, 0)));
  end if;
  if p_qty > s.total_capacity then return _fail('Exceeds shelter total capacity'); end if;
  a := _assess(b.id, s.id, r.lat, r.lng, true, 0);
  if a->>'feasibility' = 'infeasible' then return _fail(a->>'reason'); end if;

  v_new := _new_alloc(b.id, s.id, r.id, p_qty, 'RESERVED', a, c->>'flag', 0,
    format('%s reserved %s %s for %s', r.name, p_qty, b.unit, s.name), 'claim');
  update batches set remaining_qty = remaining_qty - p_qty where id = b.id;
  perform _rollup(b.id);
  return _ok('RESERVED', format('Reserved %s %s of %s for %s', p_qty, b.unit, b.item_name, s.name),
    v_new || jsonb_build_object('rider_id', r.id, 'shelter_id', s.id, 'quantity', p_qty, 'slack_min', a->'slack_min'));
end $$;

-- Recovery: offer a quantity to the best remaining rider/shelter pair, nearest feasible shelter first.
create or replace function _best_option(p_batch text, p_qty int, p_exclude text) returns jsonb
language plpgsql stable set search_path = public as $$
declare b batches%rowtype; d donors%rowtype; s record; r record; a jsonb; v_avail int;
begin
  select * into b from batches where id = p_batch;
  select * into d from donors where id = b.donor_id;
  for s in select sh.*, haversine_km(d.lat, d.lng, sh.lat, sh.lng) as dist from shelters sh where sh.status = 'open' order by dist, sh.id loop
    if not (_compat(b.category, s.id)->>'ok')::boolean then continue; end if;
    v_avail := s.unmet_demand - _reserved(s.id);
    if v_avail <= 0 then continue; end if;
    for r in select * from riders rd
      where rd.availability <> 'offline' and rd.id <> coalesce(p_exclude, '')
        and rd.active_lease_count < setting_num('max_active_leases')
        and rd.capacity_units - _committed(rd.id) > 0
        and rd.last_heartbeat_at >= sim_now() - _ack_window()
      order by haversine_km(rd.lat, rd.lng, d.lat, d.lng), rd.id loop
      a := _assess(b.id, s.id, r.lat, r.lng, true, 0);
      if a->>'feasibility' <> 'infeasible' then
        return jsonb_build_object('rider_id', r.id, 'shelter_id', s.id,
          'qty', least(p_qty, r.capacity_units - _committed(r.id), v_avail));
      end if;
    end loop;
  end loop;
  return null;
end $$;

create or replace function _reassign(p_batch text, p_qty int, p_exclude text) returns jsonb
language plpgsql set search_path = public as $$
declare v_rem int := p_qty; v_placed int := 0; o jsonb; res jsonb; v_guard int := 0;
begin
  while v_rem > 0 and v_guard < 20 loop
    v_guard := v_guard + 1;
    o := _best_option(p_batch, v_rem, p_exclude);
    exit when o is null;
    res := _claim(p_batch, o->>'shelter_id', o->>'rider_id', (o->>'qty')::int, 'recovery');
    exit when not (res->>'success')::boolean;
    v_rem := v_rem - (o->>'qty')::int;
    v_placed := v_placed + (o->>'qty')::int;
  end loop;
  return jsonb_build_object('placed', v_placed, 'remaining', v_rem);
end $$;

create or replace function _why_none(p_batch text, p_exclude text) returns text
language plpgsql stable set search_path = public as $$
declare b batches%rowtype; v_open int; v_ok int := 0; v_room int := 0; s record; c jsonb; v_flag boolean := false;
begin
  select * into b from batches where id = p_batch;
  select count(*) into v_open from shelters where status = 'open' and id <> coalesce(p_exclude, '');
  if v_open = 0 then return 'No other shelter is open'; end if;
  for s in select * from shelters where status = 'open' and id <> coalesce(p_exclude, '') loop
    c := _compat(b.category, s.id);
    if (c->>'ok')::boolean then
      v_ok := v_ok + 1;
      if s.unmet_demand - _reserved(s.id) > 0 then v_room := v_room + 1; end if;
    end if;
  end loop;
  if v_ok = 0 then return 'No open shelter accepts this category with the resources it needs'; end if;
  if v_room = 0 then return 'No compatible shelter has unmet demand remaining'; end if;
  return 'No compatible shelter is reachable before the safe-by deadline';
end $$;

-- ---------------------------------------------------------------- release and reroute

create or replace function _release(p_lease text, p_reason text, p_ghost boolean) returns void
language plpgsql set search_path = public as $$
declare l leases%rowtype; a allocations%rowtype;
begin
  select * into l from leases where id = p_lease for update;
  select * into a from allocations where id = l.allocation_id;
  update leases set custody = 'none' where id = l.id;
  perform _set_alloc(a.id, 'RELEASED', p_reason, 'release');
  update batches set remaining_qty = remaining_qty + a.quantity, safe_by_at = _safe_by_calc(donor_id, category, expires_at) where id = a.batch_id;
  if p_ghost then update riders set release_count = release_count + 1 where id = l.rider_id; end if;
  perform _refresh_rider(l.rider_id);
  perform _rollup(a.batch_id);
end $$;

-- Move p_move units of an allocation to other shelters. Splits across shelters, recalculates feasibility per piece,
-- and records anything that cannot be placed as UNRESOLVED with a reason.
create or replace function _reroute(p_alloc text, p_move int, p_reason text) returns jsonb
language plpgsql set search_path = public as $$
declare a allocations%rowtype; l leases%rowtype; b batches%rowtype; r riders%rowtype; s record; asm jsonb;
  v_sid text; v_sname text; v_slat double precision; v_slng double precision; v_pavail int; v_pasm jsonb; v_pflag text;
  v_prev text; v_move int; v_stay int; v_rem int; v_lat double precision; v_lng double precision; v_via boolean; v_off double precision;
  v_avail int; v_piece int; v_placed int := 0; v_pieces jsonb := '[]'::jsonb; v_new jsonb; v_why text; c jsonb; v_guard int := 0;
  v_from text; v_from_name text;
begin
  select * into a from allocations where id = p_alloc for update;
  if not found then return _fail('Allocation not found'); end if;
  if a.status not in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT') then
    return _fail('Only reserved or moving allocations can be rerouted (current: ' || a.status || ')', a.status);
  end if;
  select * into l from leases where allocation_id = a.id for update;
  select * into b from batches where id = a.batch_id;
  select * into r from riders where id = l.rider_id;
  select name into v_from_name from shelters where id = a.shelter_id;
  v_prev := a.status; v_from := a.shelter_id;
  v_move := least(greatest(p_move, 1), a.quantity); v_stay := a.quantity - v_move; v_rem := v_move;
  if v_stay > 0 then
    update allocations set quantity = v_stay, updated_at = now() where id = a.id;
    update leases set quantity = v_stay where id = l.id;
    perform _event('allocation', a.id, a.status, a.status, format('%s units moved off %s: %s', v_move, v_from_name, p_reason), 'reroute_start', v_move);
  else
    perform _set_alloc(a.id, 'REROUTING', p_reason, 'reroute_start');
  end if;
  v_lat := r.lat; v_lng := r.lng; v_via := (v_prev = 'RESERVED'); v_off := l.delay_min;
  while v_rem > 0 and v_guard < 10 loop
    v_guard := v_guard + 1;
    v_sid := null;
    for s in select sh.*, haversine_km(v_lat, v_lng, sh.lat, sh.lng) as dist from shelters sh
             where sh.status = 'open' and sh.id <> v_from order by dist, sh.id loop
      c := _compat(b.category, s.id);
      if not (c->>'ok')::boolean then continue; end if;
      v_avail := s.unmet_demand - _reserved(s.id);
      if v_avail <= 0 then continue; end if;
      asm := _assess(b.id, s.id, v_lat, v_lng, v_via, v_off);
      if asm->>'feasibility' = 'infeasible' then continue; end if;
      v_sid := s.id; v_sname := s.name; v_slat := s.lat; v_slng := s.lng; v_pavail := v_avail; v_pasm := asm; v_pflag := c->>'flag';
      exit;
    end loop;
    exit when v_sid is null;
    v_piece := least(v_rem, v_pavail);
    v_new := _new_alloc(b.id, v_sid, r.id, v_piece, v_prev, v_pasm, v_pflag, l.delay_min,
      format('Rerouted from %s to %s: %s', v_from_name, v_sname, p_reason), 'reroute_piece');
    update leases set claimed_at = l.claimed_at, custody = l.custody where id = v_new->>'lease_id';
    v_pieces := v_pieces || jsonb_build_array(v_new || jsonb_build_object('shelter_id', v_sid, 'quantity', v_piece));
    v_placed := v_placed + v_piece; v_rem := v_rem - v_piece;
    v_lat := v_slat; v_lng := v_slng; v_via := false; v_off := (v_pasm->>'minutes')::float8;
  end loop;
  if v_rem > 0 then
    v_why := _why_none(b.id, v_from);
    insert into unresolved(batch_id, quantity, reason, cargo_with_rider) values (b.id, v_rem, v_why, v_prev <> 'RESERVED');
    perform _event('batch', b.id, null, 'UNRESOLVED', format('%s units unplaced: %s', v_rem, v_why), 'unresolved', v_rem);
  end if;
  if v_stay = 0 then
    if v_placed > 0 then
      perform _set_alloc(a.id, 'RELEASED', format('Rerouted away from %s (%s units placed elsewhere)', v_from_name, v_placed), 'reroute_done');
    else
      perform _set_alloc(a.id, 'UNRESOLVED', v_why, 'reroute_failed');
    end if;
  end if;
  if v_rem = 0 then
    perform _event('allocation', a.id, null, null, format('Reroute complete: %s units placed', v_placed), 'reroute_success', v_placed,
      jsonb_build_object('reason', p_reason));
  elsif v_placed > 0 then
    perform _event('allocation', a.id, null, null, format('Partial reroute: %s placed, %s unresolved', v_placed, v_rem), 'reroute_partial', v_placed,
      jsonb_build_object('reason', p_reason));
  end if;
  perform _refresh_rider(r.id);
  perform _rollup(b.id);
  return jsonb_build_object('success', true, 'moved', v_placed, 'unresolved_qty', v_rem, 'unresolved_reason', v_why,
    'pieces', v_pieces, 'reason', p_reason);
end $$;

-- ---------------------------------------------------------------- sweep (GhostBuster)

create or replace function _sweep() returns jsonb
language plpgsql set search_path = public as $$
declare l record; b record; v_a allocations%rowtype; v_released int := 0; v_custody int := 0; v_expired int := 0;
  v_recovered int := 0; v_qty int; v_res jsonb;
begin
  insert into settings(key, value) values ('last_sweep_epoch', extract(epoch from now()))
  on conflict (key) do update set value = excluded.value;

  for b in select * from batches where expires_at <= sim_now() and status not in ('DELIVERED','EXPIRED','CANCELLED') loop
    select coalesce(sum(quantity), 0) into v_qty from allocations
      where batch_id = b.id and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','CUSTODY_UNCERTAIN','REROUTING');
    v_qty := v_qty + b.remaining_qty + coalesce((select sum(quantity) from unresolved where batch_id = b.id and status = 'open'), 0);
    for v_a in select * from allocations where batch_id = b.id and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','CUSTODY_UNCERTAIN','REROUTING') loop
      perform _set_alloc(v_a.id, 'EXPIRED', 'Batch passed its expiry time before delivery', 'expired');
      perform _refresh_rider((select rider_id from leases where allocation_id = v_a.id));
    end loop;
    update batches set status = 'EXPIRED' where id = b.id;
    perform _event('batch', b.id, b.status, 'EXPIRED', 'Expiry time reached', 'expired', v_qty);
    v_expired := v_expired + 1;
  end loop;

  for l in select ls.*, a.batch_id as a_batch from leases ls join allocations a on a.id = ls.allocation_id
           where ls.status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT') and ls.ack_deadline < sim_now() order by ls.claimed_at loop
    if l.status = 'RESERVED' then
      perform _release(l.id, 'No heartbeat before the acknowledgement deadline and pickup was not confirmed', true);
      v_released := v_released + 1;
      v_res := _reassign(l.a_batch, l.quantity, l.rider_id);
      if (v_res->>'placed')::int > 0 then
        v_recovered := v_recovered + 1;
        perform _event('batch', l.a_batch, null, null, format('Released quantity reassigned: %s of %s units', v_res->>'placed', l.quantity),
          'recovery', (v_res->>'placed')::numeric, jsonb_build_object('from_rider', l.rider_id));
      else
        perform _event('batch', l.a_batch, null, null, 'Released quantity could not be reassigned yet; it is back in the pool', 'recovery_pending', l.quantity);
      end if;
    else
      update leases set custody = 'uncertain' where id = l.id;
      perform _set_alloc(l.allocation_id, 'CUSTODY_UNCERTAIN',
        'No heartbeat after pickup was confirmed. Custody is uncertain; a dispatcher must decide', 'custody_uncertain');
      perform _rollup(l.a_batch);
      v_custody := v_custody + 1;
    end if;
  end loop;
  return jsonb_build_object('released', v_released, 'custody_uncertain', v_custody, 'expired_batches', v_expired, 'recovered', v_recovered);
end $$;

-- ---------------------------------------------------------------- public RPCs

create or replace function create_batch(p_action_id text, p_donor_id text, p_item_name text, p_category text, p_quantity int,
  p_unit text, p_pickup_start_min int, p_pickup_end_min int, p_expires_in_min int,
  p_handling text default '', p_storage text default '', p_compat text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_id text; v_exp timestamptz;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  if not exists (select 1 from donors where id = p_donor_id) then return _done(p_action_id, 'create_batch', _fail('Donor not found')); end if;
  if coalesce(trim(p_item_name), '') = '' then return _done(p_action_id, 'create_batch', _fail('Item name is required')); end if;
  if p_category not in ('cooked_food','medical','ration_kit','infant_formula','essential_kit') then
    return _done(p_action_id, 'create_batch', _fail('Unknown category'));
  end if;
  if p_quantity is null or p_quantity <= 0 then return _done(p_action_id, 'create_batch', _fail('Quantity must be greater than zero')); end if;
  if p_expires_in_min is null or p_expires_in_min <= 0 then return _done(p_action_id, 'create_batch', _fail('Safe-use deadline must be in the future')); end if;
  if p_pickup_start_min < 0 or p_pickup_end_min < p_pickup_start_min then
    return _done(p_action_id, 'create_batch', _fail('Pickup window must start now or later and end after it starts'));
  end if;
  if p_pickup_end_min > p_expires_in_min then
    return _done(p_action_id, 'create_batch', _fail('Pickup window cannot end after the safe-use deadline'));
  end if;
  v_id := 'FD-' || nextval('batch_seq');
  v_exp := sim_now() + p_expires_in_min * interval '1 minute';
  insert into batches(id, donor_id, item_name, category, quantity, remaining_qty, unit, pickup_window_start, pickup_window_end,
    expires_at, safe_by_at, handling_notes, storage_requirement, compatibility_requirement, status)
  values (v_id, p_donor_id, trim(p_item_name), p_category, p_quantity, p_quantity, coalesce(nullif(trim(p_unit), ''), 'units'),
    sim_now() + p_pickup_start_min * interval '1 minute', sim_now() + p_pickup_end_min * interval '1 minute', v_exp,
    _safe_by_calc(p_donor_id, p_category, v_exp), coalesce(p_handling, ''), coalesce(p_storage, ''), coalesce(p_compat, ''), 'AVAILABLE');
  perform _event('batch', v_id, null, 'AVAILABLE', 'Batch posted by donor', 'created', p_quantity);
  return _done(p_action_id, 'create_batch', _ok('AVAILABLE', 'Batch posted and visible to allocation', jsonb_build_object('batch_id', v_id)));
end $$;

create or replace function claim_lease(p_action_id text, p_batch_id text, p_shelter_id text, p_rider_id text, p_quantity int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  return _done(p_action_id, 'claim_lease', _claim(p_batch_id, p_shelter_id, p_rider_id, p_quantity, 'rider'));
end $$;

-- Apply a RescueIQ recommendation. Every assignment is re-checked by the same rules as a manual claim.
create or replace function apply_plan(p_action_id text, p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; x jsonb; res jsonb; v_results jsonb := '[]'::jsonb; v_ok int := 0; v_bad int := 0; v_qty int; b batches%rowtype;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  for x in select * from jsonb_array_elements(coalesce(p_plan->'assignments', '[]'::jsonb)) loop
    res := _claim(x->>'batch_id', x->>'shelter_id', x->>'rider_id', (x->>'quantity')::int, 'dispatcher');
    v_results := v_results || jsonb_build_array(res || jsonb_build_object('batch_id', x->>'batch_id'));
    if (res->>'success')::boolean then v_ok := v_ok + 1; else v_bad := v_bad + 1; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_plan->'unresolved', '[]'::jsonb)) loop
    select * into b from batches where id = x->>'batch_id' for update;
    v_qty := least((x->>'quantity')::int, coalesce(b.remaining_qty, 0));
    if found and v_qty > 0 and b.status not in ('EXPIRED','CANCELLED') then
      update batches set remaining_qty = remaining_qty - v_qty where id = b.id;
      insert into unresolved(batch_id, quantity, reason) values (b.id, v_qty, x->>'reason');
      perform _event('batch', b.id, b.status, 'UNRESOLVED', format('%s units unresolved: %s', v_qty, x->>'reason'), 'unresolved', v_qty);
      perform _rollup(b.id);
    end if;
  end loop;
  return _done(p_action_id, 'apply_plan', jsonb_build_object('success', v_bad = 0, 'new_state', 'RESERVED',
    'reason', format('%s assignments applied, %s rejected by the database', v_ok, v_bad), 'results', v_results));
end $$;

create or replace function heartbeat(p_action_id text, p_rider_id text, p_lat double precision default null,
  p_lng double precision default null, p_source text default 'device') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; r riders%rowtype;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into r from riders where id = p_rider_id for update;
  if not found then return _done(p_action_id, 'heartbeat', _fail('Rider not found')); end if;
  update riders set last_heartbeat_at = sim_now(),
    mode = case when p_source = 'device' then 'device' else mode end,
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng)
  where id = r.id;
  update leases set last_heartbeat_at = sim_now(), ack_deadline = sim_now() + _ack_window()
  where rider_id = r.id and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT');
  return _done(p_action_id, 'heartbeat', _ok(r.availability, 'Heartbeat recorded', jsonb_build_object('at', sim_now())));
end $$;

create or replace function confirm_pickup(p_action_id text, p_lease_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; l leases%rowtype; a allocations%rowtype; b batches%rowtype;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into l from leases where id = p_lease_id for update;
  if not found then return _done(p_action_id, 'confirm_pickup', _fail('Lease not found')); end if;
  select * into a from allocations where id = l.allocation_id;
  select * into b from batches where id = a.batch_id;
  if l.status <> 'RESERVED' then
    return _done(p_action_id, 'confirm_pickup', _fail('Pickup can only be confirmed for a reserved lease (current: ' || l.status || ')', l.status));
  end if;
  if sim_now() >= b.expires_at then return _done(p_action_id, 'confirm_pickup', _fail('Batch has expired', l.status)); end if;
  if sim_now() > b.pickup_window_end then return _done(p_action_id, 'confirm_pickup', _fail('Pickup window has closed', l.status)); end if;
  update leases set custody = 'confirmed', last_heartbeat_at = sim_now(), ack_deadline = sim_now() + _ack_window() where id = l.id;
  perform _set_alloc(a.id, 'PICKUP_CONFIRMED', 'Rider confirmed pickup at the donor', 'pickup');
  perform _rollup(a.batch_id);
  return _done(p_action_id, 'confirm_pickup', _ok('PICKUP_CONFIRMED', 'Pickup confirmed; custody is with the rider'));
end $$;

create or replace function mark_in_transit(p_action_id text, p_lease_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; l leases%rowtype; a allocations%rowtype;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into l from leases where id = p_lease_id for update;
  if not found then return _done(p_action_id, 'mark_in_transit', _fail('Lease not found')); end if;
  select * into a from allocations where id = l.allocation_id;
  if l.status <> 'PICKUP_CONFIRMED' then
    return _done(p_action_id, 'mark_in_transit', _fail('Only a lease with confirmed pickup can be marked in transit (current: ' || l.status || ')', l.status));
  end if;
  perform _set_alloc(a.id, 'IN_TRANSIT', 'Rider left the donor and is heading to the shelter', 'transit');
  perform _rollup(a.batch_id);
  return _done(p_action_id, 'mark_in_transit', _ok('IN_TRANSIT', 'In transit to the shelter'));
end $$;

-- The only function that writes DELIVERED.
create or replace function confirm_delivery(p_action_id text, p_lease_id text, p_received int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; l leases%rowtype; a allocations%rowtype; b batches%rowtype; c jsonb; v_short int; v_on_time boolean;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into l from leases where id = p_lease_id for update;
  if not found then return _done(p_action_id, 'confirm_delivery', _fail('Lease not found')); end if;
  select * into a from allocations where id = l.allocation_id for update;
  select * into b from batches where id = a.batch_id;
  if l.status <> 'IN_TRANSIT' then
    return _done(p_action_id, 'confirm_delivery', _fail('Delivery can only be confirmed for a lease that is in transit (current: ' || l.status || ')', l.status));
  end if;
  if p_received is null or p_received <= 0 then
    return _done(p_action_id, 'confirm_delivery', _fail('Quantity received must be entered and greater than zero', l.status));
  end if;
  if p_received > l.quantity then
    return _done(p_action_id, 'confirm_delivery', _fail(format('Received quantity %s exceeds the leased quantity %s', p_received, l.quantity), l.status));
  end if;
  if sim_now() >= b.expires_at then
    return _done(p_action_id, 'confirm_delivery', _fail('Batch expired before delivery, so it cannot be recorded as delivered', l.status));
  end if;
  c := _compat(b.category, a.shelter_id);
  if not (c->>'ok')::boolean then return _done(p_action_id, 'confirm_delivery', _fail(c->>'reason', l.status)); end if;
  v_short := l.quantity - p_received;
  v_on_time := sim_now() <= b.expires_at - setting_num('safety_buffer_min')::float8 * interval '1 minute';
  if v_short > 0 then
    update allocations set quantity = p_received where id = a.id;
    update leases set quantity = p_received where id = l.id;
    insert into unresolved(batch_id, quantity, reason) values (b.id, v_short, format('Shortfall at delivery: %s of %s units received', p_received, l.quantity));
    perform _event('batch', b.id, null, 'UNRESOLVED', format('%s units short at delivery', v_short), 'unresolved', v_short);
  end if;
  update shelters set unmet_demand = greatest(0, unmet_demand - p_received), updated_at = now() where id = a.shelter_id;
  update leases set custody = 'confirmed' where id = l.id;
  perform _set_alloc(a.id, 'DELIVERED', format('Delivery confirmed: %s units received', p_received), 'delivered');
  update events set meta = meta || jsonb_build_object('on_time', v_on_time, 'received', p_received)
    where id = (select max(id) from events where entity_type = 'allocation' and entity_id = a.id and event_type = 'delivered');
  update events set quantity = p_received
    where id = (select max(id) from events where entity_type = 'allocation' and entity_id = a.id and event_type = 'delivered');
  perform _refresh_rider(l.rider_id);
  perform _rollup(b.id);
  return _done(p_action_id, 'confirm_delivery', _ok('DELIVERED', format('Delivered %s %s', p_received, b.unit),
    jsonb_build_object('shortfall', v_short, 'on_time', v_on_time)));
end $$;

create or replace function resolve_custody(p_action_id text, p_lease_id text, p_decision text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; l leases%rowtype; a allocations%rowtype;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into l from leases where id = p_lease_id for update;
  if not found then return _done(p_action_id, 'resolve_custody', _fail('Lease not found')); end if;
  select * into a from allocations where id = l.allocation_id;
  if l.status <> 'CUSTODY_UNCERTAIN' then
    return _done(p_action_id, 'resolve_custody', _fail('Lease is not in uncertain custody (current: ' || l.status || ')', l.status));
  end if;
  if p_decision = 'resume' then
    update leases set custody = 'confirmed', last_heartbeat_at = sim_now(), ack_deadline = sim_now() + _ack_window() where id = l.id;
    perform _set_alloc(a.id, 'IN_TRANSIT', 'Dispatcher confirmed the rider still has the cargo: ' || coalesce(p_note, ''), 'custody_resolved');
    perform _rollup(a.batch_id);
    return _done(p_action_id, 'resolve_custody', _ok('IN_TRANSIT', 'Custody confirmed by dispatcher; delivery resumes'));
  elsif p_decision = 'write_off' then
    perform _set_alloc(a.id, 'CANCELLED', 'Dispatcher wrote off the cargo: ' || coalesce(p_note, ''), 'written_off');
    insert into unresolved(batch_id, quantity, reason, cargo_with_rider, status)
      values (a.batch_id, a.quantity, 'Custody could not be confirmed; written off by dispatcher', true, 'closed');
    perform _refresh_rider(l.rider_id);
    perform _rollup(a.batch_id);
    return _done(p_action_id, 'resolve_custody', _ok('CANCELLED', 'Cargo written off; it is not counted as delivered'));
  end if;
  return _done(p_action_id, 'resolve_custody', _fail('Decision must be resume or write_off'));
end $$;

create or replace function sweep_leases(p_action_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; res jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  res := _sweep();
  return _done(p_action_id, 'sweep_leases', _ok('SWEPT', format('Sweep complete: %s released, %s custody uncertain, %s batches expired',
    res->>'released', res->>'custody_uncertain', res->>'expired_batches'), res));
end $$;

create or replace function reroute_lease(p_action_id text, p_lease_id text, p_reason text default 'Dispatcher requested a reroute') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; l leases%rowtype; res jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into l from leases where id = p_lease_id;
  if not found then return _done(p_action_id, 'reroute_lease', _fail('Lease not found')); end if;
  res := _reroute(l.allocation_id, l.quantity, p_reason);
  return _done(p_action_id, 'reroute_lease', case when (res->>'success')::boolean
    then _ok('REROUTED', format('%s units placed, %s unresolved', res->>'moved', res->>'unresolved_qty'), res) else res end);
end $$;

create or replace function set_shelter_status(p_action_id text, p_shelter_id text, p_status text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; s shelters%rowtype; a record; v_results jsonb := '[]'::jsonb; res jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  if p_status not in ('open','closed') then return _done(p_action_id, 'set_shelter_status', _fail('Status must be open or closed')); end if;
  select * into s from shelters where id = p_shelter_id for update;
  if not found then return _done(p_action_id, 'set_shelter_status', _fail('Shelter not found')); end if;
  update shelters set status = p_status, updated_at = now() where id = s.id;
  perform _event('shelter', s.id, s.status, p_status, coalesce(nullif(p_reason, ''), 'Status changed'), 'shelter_status');
  if p_status = 'closed' then
    for a in select * from allocations where shelter_id = s.id and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT')
             order by case status when 'IN_TRANSIT' then 3 when 'PICKUP_CONFIRMED' then 2 else 1 end, id loop
      res := _reroute(a.id, a.quantity, s.name || ' closed');
      v_results := v_results || jsonb_build_array(res || jsonb_build_object('allocation_id', a.id));
    end loop;
  end if;
  return _done(p_action_id, 'set_shelter_status', _ok(p_status, format('%s is now %s', s.name, p_status),
    jsonb_build_object('reroutes', v_results)));
end $$;

create or replace function set_shelter_demand(p_action_id text, p_shelter_id text, p_unmet int, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; s shelters%rowtype; a allocations%rowtype; v_over int; v_results jsonb := '[]'::jsonb; res jsonb; v_guard int := 0;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  if p_unmet is null or p_unmet < 0 then return _done(p_action_id, 'set_shelter_demand', _fail('Demand must be zero or more')); end if;
  select * into s from shelters where id = p_shelter_id for update;
  if not found then return _done(p_action_id, 'set_shelter_demand', _fail('Shelter not found')); end if;
  update shelters set unmet_demand = p_unmet, updated_at = now() where id = s.id;
  perform _event('shelter', s.id, s.unmet_demand::text, p_unmet::text, coalesce(nullif(p_reason, ''), 'Unmet demand changed'), 'shelter_demand');
  loop
    v_guard := v_guard + 1;
    v_over := _reserved(s.id) - p_unmet;
    exit when v_over <= 0 or v_guard > 20;
    select * into a from allocations where shelter_id = s.id and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT')
      order by case status when 'RESERVED' then 1 when 'PICKUP_CONFIRMED' then 2 else 3 end, created_at desc limit 1;
    exit when not found;
    res := _reroute(a.id, least(v_over, a.quantity), s.name || ' demand is now ' || p_unmet);
    v_results := v_results || jsonb_build_array(res || jsonb_build_object('allocation_id', a.id));
  end loop;
  return _done(p_action_id, 'set_shelter_demand', _ok(s.status, format('%s unmet demand set to %s', s.name, p_unmet),
    jsonb_build_object('reroutes', v_results)));
end $$;

create or replace function set_shelter_resources(p_action_id text, p_shelter_id text, p_water boolean, p_fuel boolean, p_cold boolean,
  p_categories text[], p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; s shelters%rowtype; a allocations%rowtype; c jsonb; res jsonb; v_results jsonb := '[]'::jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into s from shelters where id = p_shelter_id for update;
  if not found then return _done(p_action_id, 'set_shelter_resources', _fail('Shelter not found')); end if;
  update shelters set has_water = p_water, has_cooking_fuel = p_fuel, has_cold_storage = p_cold,
    accepted_categories = coalesce(p_categories, accepted_categories), updated_at = now() where id = s.id;
  perform _event('shelter', s.id, null, null,
    format('Resources now: water %s, cooking fuel %s, cold storage %s. %s', p_water, p_fuel, p_cold, coalesce(p_reason, '')), 'shelter_resources');
  for a in select al.* from allocations al where al.shelter_id = s.id and al.status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT') loop
    c := _compat((select category from batches where id = a.batch_id), s.id);
    if not (c->>'ok')::boolean then
      res := _reroute(a.id, a.quantity, c->>'reason');
      v_results := v_results || jsonb_build_array(res || jsonb_build_object('allocation_id', a.id));
    else
      update allocations set blocking_reason = nullif(concat_ws('; ', c->>'flag'), ''),
        feasibility = case when c->>'flag' is not null and feasibility = 'feasible' then 'at_risk' else feasibility end,
        updated_at = now() where id = a.id;
    end if;
  end loop;
  return _done(p_action_id, 'set_shelter_resources', _ok(s.status, 'Shelter resources updated and assignments rechecked',
    jsonb_build_object('reroutes', v_results)));
end $$;

create or replace function set_rider_capacity(p_action_id text, p_rider_id text, p_capacity int, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; r riders%rowtype; l record; v_excess int; v_take int; v_trimmed int := 0; v_flagged int := 0; res jsonb; v_guard int := 0;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  if p_capacity is null or p_capacity < 0 then return _done(p_action_id, 'set_rider_capacity', _fail('Capacity must be zero or more')); end if;
  select * into r from riders where id = p_rider_id for update;
  if not found then return _done(p_action_id, 'set_rider_capacity', _fail('Rider not found')); end if;
  update riders set capacity_units = p_capacity where id = r.id;
  perform _event('rider', r.id, r.capacity_units::text, p_capacity::text, coalesce(nullif(p_reason, ''), 'Capacity changed'), 'rider_capacity');
  loop
    v_guard := v_guard + 1;
    v_excess := _committed(r.id) - p_capacity;
    exit when v_excess <= 0 or v_guard > 10;
    select ls.*, a.batch_id as a_batch into l from leases ls join allocations a on a.id = ls.allocation_id
      where ls.rider_id = r.id and ls.status = 'RESERVED' order by ls.claimed_at desc limit 1;
    exit when not found;
    v_take := least(v_excess, l.quantity);
    if v_take = l.quantity then
      perform _release(l.id, format('Rider capacity reduced to %s; lease no longer fits', p_capacity), false);
    else
      update allocations set quantity = quantity - v_take, updated_at = now() where id = l.allocation_id;
      update leases set quantity = quantity - v_take where id = l.id;
      update batches set remaining_qty = remaining_qty + v_take where id = l.a_batch;
      perform _event('allocation', l.allocation_id, 'RESERVED', 'RESERVED', format('Trimmed by %s units: rider capacity is now %s', v_take, p_capacity), 'release', v_take);
      perform _rollup(l.a_batch);
    end if;
    v_trimmed := v_trimmed + v_take;
    res := _reassign(l.a_batch, v_take, r.id);
    if (res->>'placed')::int > 0 then
      perform _event('batch', l.a_batch, null, null, format('%s of %s trimmed units reassigned to other riders', res->>'placed', v_take), 'recovery', (res->>'placed')::numeric);
    end if;
  end loop;
  if _committed(r.id) > p_capacity then
    update allocations set feasibility = 'at_risk', blocking_reason = format('Rider capacity reduced to %s after pickup; cargo already on board', p_capacity), updated_at = now()
    where id in (select allocation_id from leases where rider_id = r.id and status in ('PICKUP_CONFIRMED','IN_TRANSIT'));
    v_flagged := 1;
  end if;
  perform _refresh_rider(r.id);
  return _done(p_action_id, 'set_rider_capacity', _ok(r.availability, format('Capacity set to %s; %s units trimmed from reservations', p_capacity, v_trimmed),
    jsonb_build_object('trimmed', v_trimmed, 'flagged_after_pickup', v_flagged > 0)));
end $$;

create or replace function advance_time(p_action_id text, p_minutes int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; res jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  if p_minutes is null or p_minutes <= 0 or p_minutes > 720 then return _done(p_action_id, 'advance_time', _fail('Minutes must be between 1 and 720')); end if;
  update settings set value = value + p_minutes where key = 'clock_offset_min';
  -- Responsive simulated riders keep heartbeating while the clock moves; silent and device riders do not.
  update riders set last_heartbeat_at = sim_now() where mode = 'simulated' and not sim_silent and availability <> 'offline';
  update leases set last_heartbeat_at = sim_now(), ack_deadline = sim_now() + _ack_window()
    where rider_id in (select id from riders where mode = 'simulated' and not sim_silent) and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT');
  perform _event('clock', 'sim', null, null, format('Simulated clock advanced by %s minutes', p_minutes), 'clock', p_minutes);
  res := _sweep();
  return _done(p_action_id, 'advance_time', _ok('CLOCK', format('Clock advanced %s min. Sweep: %s released, %s custody uncertain, %s expired',
    p_minutes, res->>'released', res->>'custody_uncertain', res->>'expired_batches'), res));
end $$;

create or replace function report_traffic_delay(p_action_id text, p_rider_id text, p_minutes int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; r riders%rowtype; l record; asm jsonb; res jsonb; v_out jsonb := '[]'::jsonb; c jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  if p_minutes is null or p_minutes <= 0 or p_minutes > 240 then return _done(p_action_id, 'report_traffic_delay', _fail('Delay must be between 1 and 240 minutes')); end if;
  select * into r from riders where id = p_rider_id for update;
  if not found then return _done(p_action_id, 'report_traffic_delay', _fail('Rider not found')); end if;
  perform _event('rider', r.id, null, null, format('Traffic delay of %s minutes reported', p_minutes), 'delay', p_minutes);
  for l in select ls.*, a.batch_id as a_batch, a.shelter_id as a_shelter, a.quantity as a_qty from leases ls join allocations a on a.id = ls.allocation_id
           where ls.rider_id = r.id and ls.status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT') loop
    update leases set delay_min = delay_min + p_minutes where id = l.id;
    asm := _assess(l.a_batch, l.a_shelter, r.lat, r.lng, l.status = 'RESERVED', l.delay_min + p_minutes);
    if asm->>'feasibility' = 'infeasible' then
      res := _reroute(l.allocation_id, l.a_qty, format('A %s minute delay breaks the safe window: %s', p_minutes, asm->>'reason'));
      v_out := v_out || jsonb_build_array(res || jsonb_build_object('allocation_id', l.allocation_id));
    else
      c := _compat((select category from batches where id = l.a_batch), l.a_shelter);
      update leases set eta_at = (asm->>'eta')::timestamptz where id = l.id;
      update allocations set feasibility = case when c->>'flag' is not null and asm->>'feasibility' = 'feasible' then 'at_risk' else asm->>'feasibility' end,
        blocking_reason = nullif(concat_ws('; ', c->>'flag', asm->>'reason'), ''), updated_at = now() where id = l.allocation_id;
      perform _event('allocation', l.allocation_id, null, null, format('ETA moved by %s min to %s; feasibility %s', p_minutes, asm->>'eta', asm->>'feasibility'),
        'eta_update', null, jsonb_build_object('eta', asm->>'eta', 'slack_min', asm->'slack_min'));
      v_out := v_out || jsonb_build_array(jsonb_build_object('allocation_id', l.allocation_id, 'feasibility', asm->>'feasibility',
        'eta', asm->>'eta', 'slack_min', asm->'slack_min'));
    end if;
  end loop;
  return _done(p_action_id, 'report_traffic_delay', _ok(r.availability, format('Delay of %s min applied to %s lease(s)', p_minutes, jsonb_array_length(v_out)),
    jsonb_build_object('leases', v_out)));
end $$;

create or replace function add_incident(p_action_id text, p_rider_id text, p_type text, p_lease_id text default null,
  p_note text default '', p_minutes int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_id text; res jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  if not exists (select 1 from riders where id = p_rider_id) then return _done(p_action_id, 'add_incident', _fail('Rider not found')); end if;
  if p_type not in ('delay','road_blocked','vehicle_issue','other') then return _done(p_action_id, 'add_incident', _fail('Unknown incident type')); end if;
  insert into incidents(rider_id, type, related_lease_id, note, sync_status)
  values (p_rider_id, p_type, (select id from leases where id = p_lease_id), coalesce(p_note, ''), 'received') returning id into v_id;
  perform _event('incident', v_id, null, 'received', format('%s reported by %s. %s', replace(p_type, '_', ' '), p_rider_id, coalesce(p_note, '')), 'incident');
  if p_type = 'delay' and coalesce(p_minutes, 0) > 0 then
    res := report_traffic_delay('incident-delay-' || p_action_id, p_rider_id, p_minutes);
    update incidents set sync_status = 'processed' where id = v_id;
  end if;
  return _done(p_action_id, 'add_incident', _ok('received', 'Incident received by the server', jsonb_build_object('incident_id', v_id)));
end $$;

create or replace function process_incident(p_action_id text, p_incident_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  update incidents set sync_status = 'processed' where id = p_incident_id;
  if not found then return _done(p_action_id, 'process_incident', _fail('Incident not found')); end if;
  perform _event('incident', p_incident_id, 'received', 'processed', 'Dispatcher marked the incident as processed', 'incident');
  return _done(p_action_id, 'process_incident', _ok('processed', 'Incident processed'));
end $$;

create or replace function set_rider_silent(p_action_id text, p_rider_id text, p_silent boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; r riders%rowtype;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into r from riders where id = p_rider_id for update;
  if not found then return _done(p_action_id, 'set_rider_silent', _fail('Rider not found')); end if;
  update riders set sim_silent = p_silent where id = r.id;
  perform _event('rider', r.id, case when r.sim_silent then 'silent' else 'responsive' end, case when p_silent then 'silent' else 'responsive' end,
    case when p_silent then 'Rider stopped sending heartbeats' else 'Rider resumed heartbeats' end, 'rider_silent');
  return _done(p_action_id, 'set_rider_silent', _ok(case when p_silent then 'silent' else 'responsive' end,
    case when p_silent then 'Heartbeats from this rider have stopped' else 'Heartbeats resumed' end));
end $$;

-- Moves simulated riders toward their target and keeps responsive riders alive. Never changes delivery state.
create or replace function simulate_tick(p_action_id text, p_seconds int default 5) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; r record; t record; v_step double precision; v_dist double precision; v_frac double precision; v_n int := 0;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  v_step := setting_num('speed_kmph')::float8 * greatest(p_seconds, 1) * setting_num('sim_time_scale')::float8 / 3600.0;
  for r in select * from riders where mode = 'simulated' and not sim_silent and availability <> 'offline' loop
    update riders set last_heartbeat_at = sim_now() where id = r.id;
    update leases set last_heartbeat_at = sim_now(), ack_deadline = sim_now() + _ack_window()
      where rider_id = r.id and status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT');
    select case when ls.status = 'RESERVED' then d.lat else s.lat end as tlat, case when ls.status = 'RESERVED' then d.lng else s.lng end as tlng into t
    from leases ls join allocations a on a.id = ls.allocation_id join batches b on b.id = a.batch_id
      join donors d on d.id = b.donor_id join shelters s on s.id = a.shelter_id
    where ls.rider_id = r.id and ls.status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT') order by ls.claimed_at limit 1;
    if found then
      v_dist := haversine_km(r.lat, r.lng, t.tlat, t.tlng);
      if v_dist <= v_step then
        update riders set lat = t.tlat, lng = t.tlng where id = r.id;
      elsif v_dist > 0 then
        v_frac := v_step / v_dist;
        update riders set lat = r.lat + (t.tlat - r.lat) * v_frac, lng = r.lng + (t.tlng - r.lng) * v_frac where id = r.id;
      end if;
      v_n := v_n + 1;
    end if;
  end loop;
  delete from action_log where created_at < now() - interval '1 day' and rpc in ('simulate_tick','heartbeat');
  return _done(p_action_id, 'simulate_tick', _ok('MOVED', format('%s riders moved', v_n)));
end $$;

create or replace function reopen_unresolved(p_action_id text, p_unresolved_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; u unresolved%rowtype; b batches%rowtype;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  select * into u from unresolved where id = p_unresolved_id for update;
  if not found or u.status <> 'open' then return _done(p_action_id, 'reopen_unresolved', _fail('No open unresolved record')); end if;
  if u.cargo_with_rider then return _done(p_action_id, 'reopen_unresolved', _fail('The cargo is with a rider; it cannot return to the pool until a dispatcher decides')); end if;
  select * into b from batches where id = u.batch_id for update;
  if sim_now() >= b.expires_at then return _done(p_action_id, 'reopen_unresolved', _fail('Batch has expired')); end if;
  delete from unresolved where id = u.id;
  update batches set remaining_qty = remaining_qty + u.quantity where id = b.id;
  perform _event('batch', b.id, b.status, null, format('%s unresolved units returned to the pool', u.quantity), 'reopened', u.quantity);
  perform _rollup(b.id);
  return _done(p_action_id, 'reopen_unresolved', _ok('AVAILABLE', 'Quantity returned to the pool for allocation'));
end $$;

create or replace function server_time() returns timestamptz
language sql stable security definer set search_path = public as $$ select sim_now() $$;

create or replace function reset_simulation(p_action_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  v := _dup(p_action_id); if v is not null then return v; end if;
  perform _seed_data();
  return _done(p_action_id, 'reset_simulation', _ok('RESET', 'Simulation restored to the seeded state'));
end $$;

-- Grants: public RPCs to anon; internal helpers are not callable from the client.
do $$
declare f record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
      if f.proname like '\_%' then
        execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
      else
        execute format('grant execute on function %s to anon, authenticated', f.sig);
      end if;
    end loop;
  end if;
end $$;
