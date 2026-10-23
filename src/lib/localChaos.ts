import type { Allocation, Batch, Category, Feasibility, Lease, LifecycleState, Snapshot } from "./types";
import { allocate } from "./engine/allocate";
import { checkCompatibility } from "./engine/compatibility";
import { planReroute } from "./engine/reroute";
import { ACTIVE_STATES, clone, reservedByShelter } from "./engine/state";
import { decideSweep } from "./engine/sweep";
import { ackWindowMs } from "./engine/labels";
import { assess, nowMs, safeByMs } from "./engine/time";

/**
 * Local mode for the Chaos Lab: the same rules as the database functions, applied to a copy of the mirror.
 * Nothing here is ever shown as confirmed; results are labelled "Local, not yet synced".
 */
export interface LocalOutcome { snap: Snapshot; ok: boolean; response: string }

let seq = 0;
const iso = (ms: number) => new Date(ms).toISOString();

function ev(s: Snapshot, entity: string, id: string, prev: string | null, next: string | null, reason: string, kind: string | null, qty: number | null = null, meta: Record<string, unknown> = {}) {
  const minId = s.events.reduce((m, e) => Math.min(m, e.id), 0);
  s.events.unshift({ id: minId - 1, entity_type: entity, entity_id: id, previous_state: prev, new_state: next, reason, event_type: kind, quantity: qty, meta, created_at: iso(nowMs(s)) });
}

function setAlloc(s: Snapshot, a: Allocation, status: LifecycleState, reason: string, kind: string | null) {
  const prev = a.status;
  a.status = status; a.updated_at = iso(nowMs(s));
  const l = s.leases.find((x) => x.allocation_id === a.id);
  if (l) l.status = status;
  ev(s, "allocation", a.id, prev, status, reason, kind, a.quantity);
}

function refreshRider(s: Snapshot, riderId: string) {
  const r = s.riders.find((x) => x.id === riderId);
  if (!r) return;
  r.active_lease_count = s.leases.filter((l) => l.rider_id === riderId && ACTIVE_STATES.includes(l.status)).length;
  if (r.availability !== "offline") r.availability = r.active_lease_count > 0 ? "assigned" : "available";
}

function rollup(s: Snapshot, batchId: string) {
  const b = s.batches.find((x) => x.id === batchId);
  if (!b || b.status === "EXPIRED" || b.status === "CANCELLED") return;
  const al = s.allocations.filter((a) => a.batch_id === batchId);
  const has = (st: LifecycleState) => al.some((a) => a.status === st);
  const delivered = al.filter((a) => a.status === "DELIVERED").reduce((n, a) => n + a.quantity, 0);
  const unres = s.unresolved.filter((u) => u.batch_id === batchId && u.status === "open").reduce((n, u) => n + u.quantity, 0);
  const next: LifecycleState = has("CUSTODY_UNCERTAIN") ? "CUSTODY_UNCERTAIN" : has("RESERVED") ? "RESERVED" : has("PICKUP_CONFIRMED") ? "PICKUP_CONFIRMED"
    : has("IN_TRANSIT") ? "IN_TRANSIT" : has("REROUTING") ? "REROUTING" : b.remaining_qty > 0 ? "AVAILABLE" : unres > 0 ? "UNRESOLVED" : delivered > 0 ? "DELIVERED" : "AVAILABLE";
  if (next !== b.status) { ev(s, "batch", b.id, b.status, next, "Batch status follows its allocations", null); b.status = next; }
}

function newAlloc(s: Snapshot, b: Batch, shelterId: string, riderId: string, qty: number, status: LifecycleState, a: ReturnType<typeof assess>, flag: string | null, delay: number, why: string, kind: string) {
  const id = `AL-L${++seq}`;
  const feas: Feasibility = flag && a.feasibility === "feasible" ? "at_risk" : a.feasibility;
  const now = nowMs(s);
  s.allocations.push({ id, batch_id: b.id, shelter_id: shelterId, quantity: qty, feasibility: feas, blocking_reason: [flag, a.reason].filter(Boolean).join("; ") || null, status, created_at: iso(now), updated_at: iso(now) });
  s.leases.push({
    id: `LS-L${seq}`, allocation_id: id, rider_id: riderId, quantity: qty, claimed_at: iso(now), ack_deadline: iso(now + ackWindowMs(s.settings)),
    last_heartbeat_at: iso(now), custody: status === "RESERVED" ? "none" : "confirmed", status: status as Lease["status"], eta_at: iso(a.etaMs), delay_min: delay,
  });
  ev(s, "allocation", id, null, status, why, kind, qty, { rider_id: riderId, shelter_id: shelterId });
  refreshRider(s, riderId);
  return id;
}

function reassign(s: Snapshot, batchId: string, qty: number, excludeRider: string | null): number {
  const b = s.batches.find((x) => x.id === batchId)!;
  const original = b.remaining_qty;
  const plan = allocate({
    batches: [{ ...b, remaining_qty: Math.min(qty, b.remaining_qty) }], donors: s.donors, shelters: s.shelters,
    riders: s.riders.filter((r) => r.id !== excludeRider), leases: s.leases, allocations: s.allocations, rules: s.rules, settings: s.settings, now: nowMs(s),
  });
  let placed = 0;
  for (const p of plan.assignments) {
    const donor = s.donors.find((d) => d.id === b.donor_id)!;
    const sh = s.shelters.find((x) => x.id === p.shelter_id)!;
    const r = s.riders.find((x) => x.id === p.rider_id)!;
    const a = assess({ batch: b, donor, shelter: sh, from: r, viaDonor: true, offsetMin: 0, now: nowMs(s), settings: s.settings });
    newAlloc(s, b, p.shelter_id, p.rider_id, p.quantity, "RESERVED", a, p.flag, 0, `${r.name} reserved ${p.quantity} ${b.unit} for ${sh.name}`, "claim");
    b.remaining_qty -= p.quantity; placed += p.quantity;
  }
  void original;
  rollup(s, batchId);
  return placed;
}

/** Reserve a quantity locally using the same arithmetic as claim_lease. Used by tests and local previews. */
export function assignLocal(s: Snapshot, batchId: string, shelterId: string, riderId: string, qty: number): string {
  const b = s.batches.find((x) => x.id === batchId)!;
  const a = assess({ batch: b, donor: s.donors.find((d) => d.id === b.donor_id)!, shelter: s.shelters.find((x) => x.id === shelterId)!, from: s.riders.find((r) => r.id === riderId)!, viaDonor: true, offsetMin: 0, now: nowMs(s), settings: s.settings });
  const id = newAlloc(s, b, shelterId, riderId, qty, "RESERVED", a, null, 0, "Reserved locally", "claim");
  b.remaining_qty -= qty;
  rollup(s, batchId);
  return id;
}

export function releaseLocal(s: Snapshot, leaseId: string, reason: string, ghost: boolean) {
  const l = s.leases.find((x) => x.id === leaseId)!;
  const a = s.allocations.find((x) => x.id === l.allocation_id)!;
  l.custody = "none";
  setAlloc(s, a, "RELEASED", reason, "release");
  const b = s.batches.find((x) => x.id === a.batch_id)!;
  b.remaining_qty += a.quantity;
  const donor = s.donors.find((d) => d.id === b.donor_id)!;
  b.safe_by_at = iso(safeByMs(b, donor, s.shelters, s.settings));
  if (ghost) { const r = s.riders.find((x) => x.id === l.rider_id)!; r.release_count += 1; }
  refreshRider(s, l.rider_id);
  rollup(s, b.id);
}

export function rerouteLocal(s: Snapshot, allocId: string, moveQty: number, reason: string): { moved: number; unresolved: number; reasonText: string | null } {
  const a = s.allocations.find((x) => x.id === allocId)!;
  const l = s.leases.find((x) => x.allocation_id === allocId)!;
  const b = s.batches.find((x) => x.id === a.batch_id)!;
  const donor = s.donors.find((d) => d.id === b.donor_id)!;
  const rider = s.riders.find((r) => r.id === l.rider_id)!;
  const plan = planReroute({ allocation: a, lease: l, batch: b, donor, rider, shelters: s.shelters, allocations: s.allocations, rules: s.rules, settings: s.settings, now: nowMs(s) }, moveQty);
  const from = s.shelters.find((x) => x.id === a.shelter_id)!;
  const prev = a.status;
  if (plan.stay > 0) { a.quantity = plan.stay; l.quantity = plan.stay; ev(s, "allocation", a.id, prev, prev, `${plan.moved + plan.unresolvedQty} units moved off ${from.name}: ${reason}`, "reroute_start"); }
  else setAlloc(s, a, "REROUTING", reason, "reroute_start");
  for (const p of plan.pieces) {
    const sh = s.shelters.find((x) => x.id === p.shelter_id)!;
    const asm = { etaMs: p.etaMs, slackMin: p.slackMin, feasibility: p.feasibility, reason: p.reason, minutes: 0 };
    newAlloc(s, b, p.shelter_id, rider.id, p.quantity, prev, asm, null, l.delay_min, `Rerouted from ${from.name} to ${sh.name}: ${reason}`, "reroute_piece");
  }
  if (plan.unresolvedQty > 0) {
    s.unresolved.push({ id: `UR-L${++seq}`, batch_id: b.id, quantity: plan.unresolvedQty, reason: plan.unresolvedReason ?? "No destination", cargo_with_rider: prev !== "RESERVED", status: "open", created_at: iso(nowMs(s)) });
    ev(s, "batch", b.id, null, "UNRESOLVED", `${plan.unresolvedQty} units unplaced: ${plan.unresolvedReason}`, "unresolved", plan.unresolvedQty);
  }
  if (plan.stay === 0) {
    if (plan.moved > 0) setAlloc(s, a, "RELEASED", `Rerouted away from ${from.name} (${plan.moved} units placed elsewhere)`, "reroute_done");
    else setAlloc(s, a, "UNRESOLVED", plan.unresolvedReason ?? "No destination", "reroute_failed");
  }
  ev(s, "allocation", a.id, null, null, plan.unresolvedQty === 0 ? `Reroute complete: ${plan.moved} units placed` : `Partial reroute: ${plan.moved} placed, ${plan.unresolvedQty} unresolved`,
    plan.unresolvedQty === 0 ? "reroute_success" : plan.moved > 0 ? "reroute_partial" : null, plan.moved);
  refreshRider(s, rider.id);
  rollup(s, b.id);
  return { moved: plan.moved, unresolved: plan.unresolvedQty, reasonText: plan.unresolvedReason };
}

const movingAt = (s: Snapshot, shelterId: string) =>
  s.allocations.filter((a) => a.shelter_id === shelterId && ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT"].includes(a.status));

export function sweepLocal(s: Snapshot): { released: number; custody: number; expired: number; recovered: number } {
  const d = decideSweep({ batches: s.batches, leases: s.leases, allocations: s.allocations, now: nowMs(s) });
  let recovered = 0;
  for (const id of d.expireBatches) {
    const b = s.batches.find((x) => x.id === id)!;
    const qty = b.remaining_qty + s.allocations.filter((a) => a.batch_id === id && [...ACTIVE_STATES, "REROUTING"].includes(a.status)).reduce((n, a) => n + a.quantity, 0);
    for (const a of s.allocations.filter((x) => x.batch_id === id && [...ACTIVE_STATES, "REROUTING"].includes(x.status))) { setAlloc(s, a, "EXPIRED", "Batch passed its expiry time before delivery", "expired"); refreshRider(s, s.leases.find((l) => l.allocation_id === a.id)!.rider_id); }
    ev(s, "batch", id, b.status, "EXPIRED", "Expiry time reached", "expired", qty);
    b.status = "EXPIRED";
  }
  for (const id of d.release) {
    const l = s.leases.find((x) => x.id === id)!;
    const a = s.allocations.find((x) => x.id === l.allocation_id)!;
    releaseLocal(s, id, "No heartbeat before the acknowledgement deadline and pickup was not confirmed", true);
    const placed = reassign(s, a.batch_id, l.quantity, l.rider_id);
    if (placed > 0) { recovered++; ev(s, "batch", a.batch_id, null, null, `Released quantity reassigned: ${placed} of ${l.quantity} units`, "recovery", placed); }
    else ev(s, "batch", a.batch_id, null, null, "Released quantity could not be reassigned yet; it is back in the pool", "recovery_pending", l.quantity);
  }
  for (const id of d.custodyUncertain) {
    const l = s.leases.find((x) => x.id === id)!;
    const a = s.allocations.find((x) => x.id === l.allocation_id)!;
    l.custody = "uncertain";
    setAlloc(s, a, "CUSTODY_UNCERTAIN", "No heartbeat after pickup was confirmed. Custody is uncertain; a dispatcher must decide", "custody_uncertain");
    rollup(s, a.batch_id);
  }
  s.settings.last_sweep_epoch = nowMs(s) / 1000;
  return { released: d.release.length, custody: d.custodyUncertain.length, expired: d.expireBatches.length, recovered };
}

export type LocalAction =
  | { kind: "create_batch"; donorId: string; qty: number; expiresInMin: number; category: Category; item: string }
  | { kind: "silent"; riderId: string }
  | { kind: "close_shelter"; shelterId: string }
  | { kind: "fulfil_shelter"; shelterId: string }
  | { kind: "reduce_capacity"; riderId: string; capacity: number }
  | { kind: "delay"; riderId: string; minutes: number }
  | { kind: "remove_water"; shelterId: string }
  | { kind: "advance"; minutes: number };

export function applyLocal(base: Snapshot, act: LocalAction): LocalOutcome {
  const s = clone(base);
  const now = nowMs(s);
  s.readAtMs = Date.now(); s.serverNowMs = now;
  const shelterName = (id: string) => s.shelters.find((x) => x.id === id)?.name ?? id;

  switch (act.kind) {
    case "create_batch": {
      const donor = s.donors.find((d) => d.id === act.donorId)!;
      const id = `FD-L${++seq}`;
      const expires_at = iso(now + act.expiresInMin * 60000);
      s.batches.push({
        id, donor_id: donor.id, item_name: act.item, category: act.category, quantity: act.qty, remaining_qty: act.qty, unit: "units",
        pickup_window_start: iso(now), pickup_window_end: iso(now + Math.max(5, act.expiresInMin / 2) * 60000), expires_at,
        safe_by_at: iso(safeByMs({ category: act.category, expires_at }, donor, s.shelters, s.settings)), handling_notes: "", storage_requirement: "",
        compatibility_requirement: "", status: "AVAILABLE", created_at: iso(now),
      });
      ev(s, "batch", id, null, "AVAILABLE", "Batch posted from the Chaos Lab", "created", act.qty);
      return { snap: s, ok: true, response: `Batch ${id} created locally with ${act.expiresInMin} minutes to expiry` };
    }
    case "silent": {
      const r = s.riders.find((x) => x.id === act.riderId)!;
      r.sim_silent = true;
      ev(s, "rider", r.id, "responsive", "silent", "Rider stopped sending heartbeats", "rider_silent");
      return { snap: s, ok: true, response: `${r.name} no longer sends heartbeats. Advance the clock to see the sweep respond.` };
    }
    case "close_shelter": {
      const sh = s.shelters.find((x) => x.id === act.shelterId)!;
      ev(s, "shelter", sh.id, sh.status, "closed", `${sh.name} closed`, "shelter_status");
      sh.status = "closed";
      let moved = 0, left = 0;
      for (const a of movingAt(s, sh.id)) { const r = rerouteLocal(s, a.id, a.quantity, `${sh.name} closed`); moved += r.moved; left += r.unresolved; }
      return { snap: s, ok: true, response: `${sh.name} closed. ${moved} units rerouted, ${left} unresolved.` };
    }
    case "fulfil_shelter": {
      const sh = s.shelters.find((x) => x.id === act.shelterId)!;
      ev(s, "shelter", sh.id, String(sh.unmet_demand), "0", "Unmet demand set to zero", "shelter_demand");
      sh.unmet_demand = 0;
      let moved = 0, left = 0, guard = 0;
      for (;;) {
        const over = (reservedByShelter(s.allocations).get(sh.id) ?? 0) - sh.unmet_demand;
        const a = movingAt(s, sh.id)[0];
        if (over <= 0 || !a || guard++ > 20) break;
        const r = rerouteLocal(s, a.id, Math.min(over, a.quantity), `${sh.name} demand is now 0`);
        moved += r.moved; left += r.unresolved;
      }
      return { snap: s, ok: true, response: `${sh.name} demand fulfilled. ${moved} units rerouted, ${left} unresolved.` };
    }
    case "reduce_capacity": {
      const r = s.riders.find((x) => x.id === act.riderId)!;
      ev(s, "rider", r.id, String(r.capacity_units), String(act.capacity), "Capacity reduced", "rider_capacity");
      r.capacity_units = act.capacity;
      let trimmed = 0, guard = 0;
      for (;;) {
        const committed = s.leases.filter((l) => l.rider_id === r.id && ACTIVE_STATES.includes(l.status)).reduce((n, l) => n + l.quantity, 0);
        const excess = committed - act.capacity;
        const l = [...s.leases].reverse().find((x) => x.rider_id === r.id && x.status === "RESERVED");
        if (excess <= 0 || !l || guard++ > 10) break;
        const a = s.allocations.find((x) => x.id === l.allocation_id)!;
        const take = Math.min(excess, l.quantity);
        if (take === l.quantity) releaseLocal(s, l.id, `Rider capacity reduced to ${act.capacity}; lease no longer fits`, false);
        else { a.quantity -= take; l.quantity -= take; s.batches.find((b) => b.id === a.batch_id)!.remaining_qty += take; rollup(s, a.batch_id); }
        trimmed += take;
        reassign(s, a.batch_id, take, r.id);
      }
      return { snap: s, ok: true, response: `${r.name} capacity set to ${act.capacity}. ${trimmed} reserved units trimmed and offered to others.` };
    }
    case "delay": {
      const r = s.riders.find((x) => x.id === act.riderId)!;
      ev(s, "rider", r.id, null, null, `Traffic delay of ${act.minutes} minutes reported`, "delay", act.minutes);
      let n = 0;
      for (const l of s.leases.filter((x) => x.rider_id === r.id && ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT"].includes(x.status))) {
        const a = s.allocations.find((x) => x.id === l.allocation_id)!;
        const b = s.batches.find((x) => x.id === a.batch_id)!;
        l.delay_min += act.minutes; n++;
        const asm = assess({ batch: b, donor: s.donors.find((d) => d.id === b.donor_id)!, shelter: s.shelters.find((x) => x.id === a.shelter_id)!, from: r, viaDonor: l.status === "RESERVED", offsetMin: l.delay_min, now, settings: s.settings });
        if (asm.feasibility === "infeasible") rerouteLocal(s, a.id, a.quantity, `A ${act.minutes} minute delay breaks the safe window: ${asm.reason}`);
        else {
          l.eta_at = iso(asm.etaMs); a.feasibility = asm.feasibility; a.blocking_reason = asm.reason;
          ev(s, "allocation", a.id, null, null, `ETA moved by ${act.minutes} min; feasibility ${asm.feasibility}`, "eta_update");
        }
      }
      return { snap: s, ok: true, response: `Delay of ${act.minutes} min applied to ${n} lease(s) held by ${r.name}.` };
    }
    case "remove_water": {
      const sh = s.shelters.find((x) => x.id === act.shelterId)!;
      sh.has_water = false;
      ev(s, "shelter", sh.id, null, null, `Resources now: water false. Clean water removed`, "shelter_resources");
      let rerouted = 0, flagged = 0;
      for (const a of movingAt(s, sh.id)) {
        const b = s.batches.find((x) => x.id === a.batch_id)!;
        const c = checkCompatibility(b.category, sh, s.rules);
        if (!c.ok) { rerouteLocal(s, a.id, a.quantity, c.reason ?? "Incompatible"); rerouted++; }
        else if (c.flag) { a.blocking_reason = c.flag; if (a.feasibility === "feasible") a.feasibility = "at_risk"; flagged++; }
      }
      return { snap: s, ok: true, response: `Water removed at ${shelterName(sh.id)}. ${rerouted} assignment(s) blocked and rerouted, ${flagged} flagged as pending verification.` };
    }
    case "advance": {
      s.settings.clock_offset_min += act.minutes;
      s.serverNowMs = now + act.minutes * 60000; s.readAtMs = Date.now();
      const t = nowMs(s);
      const live = new Set(s.riders.filter((r) => r.mode === "simulated" && !r.sim_silent).map((r) => r.id));
      for (const r of s.riders) if (live.has(r.id)) r.last_heartbeat_at = iso(t);
      for (const l of s.leases) if (live.has(l.rider_id) && ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT"].includes(l.status)) { l.ack_deadline = iso(t + ackWindowMs(s.settings)); l.last_heartbeat_at = iso(t); }
      ev(s, "clock", "sim", null, null, `Simulated clock advanced by ${act.minutes} minutes`, "clock", act.minutes);
      const r = sweepLocal(s);
      return { snap: s, ok: true, response: `Clock advanced ${act.minutes} min. Sweep: ${r.released} released, ${r.custody} custody uncertain, ${r.expired} batches expired.` };
    }
  }
}
