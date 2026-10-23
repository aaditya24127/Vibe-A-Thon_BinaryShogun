import type { Allocation, Batch, Donor, Feasibility, Lease, Rider, Rule, Settings, Shelter } from "../types";
import { checkCompatibility } from "./compatibility";
import { haversineKm } from "./geo";
import { isRiderConnected } from "./labels";
import { activeLeaseCount, committedByRider, reservedByShelter } from "./state";
import { assess, remainingSafeMinutes } from "./time";

export interface AllocInput {
  batches: Batch[]; donors: Donor[]; shelters: Shelter[]; riders: Rider[]; leases: Lease[]; allocations: Allocation[];
  rules: Rule[]; settings: Settings; now: number;
  /** FairShare tie-breaker between equally near shelters. On by default. */
  fairShare?: boolean;
}

export interface Assignment {
  batch_id: string; shelter_id: string; rider_id: string; quantity: number;
  etaMs: number; slackMin: number; feasibility: Feasibility; flag: string | null; reason: string | null;
  /** Human-readable list of the checks this assignment passed. */
  checks: string[];
}
export interface UnresolvedPlan { batch_id: string; quantity: number; reason: string }
export interface Plan { assignments: Assignment[]; unresolved: UnresolvedPlan[] }

export const TERMINAL = new Set(["EXPIRED", "CANCELLED", "DELIVERED"]);
/** Distances within this many km are treated as equal for the FairShare tie-breaker. */
const TIE_KM = 0.25;

export function offerableBatches(input: Pick<AllocInput, "batches" | "now">): Batch[] {
  return input.batches
    .filter((b) => b.remaining_qty > 0 && !TERMINAL.has(b.status) && Date.parse(b.expires_at) > input.now)
    .sort((a, b) => Date.parse(a.safe_by_at) - Date.parse(b.safe_by_at) || a.id.localeCompare(b.id));
}

export function allocate(input: AllocInput): Plan {
  const { donors, shelters, riders, rules, settings, now } = input;
  const fairShare = input.fairShare ?? true;
  const reserved = reservedByShelter(input.allocations);
  const committed = committedByRider(input.leases);
  const slots = activeLeaseCount(input.leases);
  const donorOf = new Map(donors.map((d) => [d.id, d]));
  const usable = riders.filter((r) => isRiderConnected(r, now, settings));
  const plan: Plan = { assignments: [], unresolved: [] };

  const room = (s: Shelter) => s.unmet_demand - (reserved.get(s.id) ?? 0);
  const riderFree = (r: Rider) => r.capacity_units - (committed.get(r.id) ?? 0);
  const riderHasSlot = (r: Rider) => (slots.get(r.id) ?? 0) < settings.max_active_leases && riderFree(r) > 0;

  for (const batch of offerableBatches(input)) {
    const donor = donorOf.get(batch.donor_id);
    if (!donor) continue;
    let remaining = batch.remaining_qty;
    let guard = 0;
    while (remaining > 0 && guard++ < 200) {
      const ordered = shelters
        .filter((s) => s.status === "open")
        .map((s) => ({ s, dist: haversineKm(donor, s) }))
        .sort((a, b) => {
          if (fairShare) {
            const bucket = Math.round(a.dist / TIE_KM) - Math.round(b.dist / TIE_KM);
            if (bucket !== 0) return bucket;
            const share = room(b.s) - room(a.s);
            if (share !== 0) return share;
          }
          return a.dist - b.dist || a.s.id.localeCompare(b.s.id);
        });
      let placed = false;
      for (const { s } of ordered) {
        const compat = checkCompatibility(batch.category, s, rules);
        if (!compat.ok || room(s) <= 0) continue;
        const candidates = usable.filter(riderHasSlot).sort((a, b) => haversineKm(a, donor) - haversineKm(b, donor) || a.id.localeCompare(b.id));
        for (const r of candidates) {
          const a = assess({ batch, donor, shelter: s, from: r, viaDonor: true, offsetMin: 0, now, settings });
          if (a.feasibility === "infeasible") continue;
          const qty = Math.min(remaining, riderFree(r), room(s));
          const feasibility: Feasibility = compat.flag && a.feasibility === "feasible" ? "at_risk" : a.feasibility;
          plan.assignments.push({
            batch_id: batch.id, shelter_id: s.id, rider_id: r.id, quantity: qty, etaMs: a.etaMs, slackMin: a.slackMin, feasibility,
            flag: compat.flag, reason: [compat.flag, a.reason].filter(Boolean).join("; ") || null,
            checks: [
              `Rider capacity: ${qty} of ${riderFree(r)} free units`,
              `Shelter demand: ${qty} of ${room(s)} units still needed`,
              compat.flag ? "Compatibility: flagged, rule pending verification" : "Compatibility: resources match",
              `Arrives ${Math.round(a.slackMin)} min before the safe-by limit`,
            ],
          });
          committed.set(r.id, (committed.get(r.id) ?? 0) + qty);
          slots.set(r.id, (slots.get(r.id) ?? 0) + 1);
          reserved.set(s.id, (reserved.get(s.id) ?? 0) + qty);
          remaining -= qty;
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) break;
    }
    if (remaining > 0) {
      plan.unresolved.push({ batch_id: batch.id, quantity: remaining, reason: unresolvedReason(batch, input, reserved, committed, slots, usable) });
    }
  }
  return plan;
}

/** Plain reason a quantity could not be placed. */
export function unresolvedReason(
  batch: Batch, input: Pick<AllocInput, "shelters" | "rules" | "settings" | "now">,
  reserved: Map<string, number>, committed: Map<string, number>, slots: Map<string, number>, usable: Rider[],
): string {
  const open = input.shelters.filter((s) => s.status === "open");
  if (!open.length) return "Shelter closed: no shelter is open";
  const accepting = open.filter((s) => s.accepted_categories.includes(batch.category));
  if (!accepting.length) return "No eligible shelter accepts this category";
  const compatible = accepting.filter((s) => checkCompatibility(batch.category, s, input.rules).ok);
  if (!compatible.length) return "Missing resource: no open shelter has the resources this category needs";
  if (!compatible.some((s) => s.unmet_demand - (reserved.get(s.id) ?? 0) > 0)) return "No eligible shelter has unmet demand remaining";
  const anyRider = usable.some((r) => r.capacity_units - (committed.get(r.id) ?? 0) > 0 && (slots.get(r.id) ?? 0) < input.settings.max_active_leases);
  if (!anyRider) return "No rider capacity: every rider is full, offline or at the lease limit";
  return "Too far for the safe window: no shelter can be reached before the deadline";
}

/** Independent re-check of a plan. Returns violations; an empty list means every limit holds. */
export function verifyPlan(input: AllocInput, plan: Plan): string[] {
  const errs: string[] = [];
  const reserved = reservedByShelter(input.allocations);
  const committed = committedByRider(input.leases);
  const slots = activeLeaseCount(input.leases);
  const batchOf = new Map(input.batches.map((b) => [b.id, b]));
  const shelterOf = new Map(input.shelters.map((s) => [s.id, s]));
  const riderOf = new Map(input.riders.map((r) => [r.id, r]));
  const donorOf = new Map(input.donors.map((d) => [d.id, d]));
  const perBatch = new Map<string, number>();
  for (const a of plan.assignments) {
    const b = batchOf.get(a.batch_id)!, s = shelterOf.get(a.shelter_id)!, r = riderOf.get(a.rider_id)!;
    reserved.set(s.id, (reserved.get(s.id) ?? 0) + a.quantity);
    committed.set(r.id, (committed.get(r.id) ?? 0) + a.quantity);
    slots.set(r.id, (slots.get(r.id) ?? 0) + 1);
    perBatch.set(b.id, (perBatch.get(b.id) ?? 0) + a.quantity);
    if (!checkCompatibility(b.category, s, input.rules).ok) errs.push(`${a.batch_id}->${s.id}: incompatible`);
    const asm = assess({ batch: b, donor: donorOf.get(b.donor_id)!, shelter: s, from: r, viaDonor: true, offsetMin: 0, now: input.now, settings: input.settings });
    if (asm.feasibility === "infeasible") errs.push(`${a.batch_id}->${s.id}: arrives after safe-by`);
  }
  for (const [id, v] of reserved) if (v > shelterOf.get(id)!.unmet_demand) errs.push(`${id}: demand exceeded`);
  for (const [id, v] of committed) if (v > riderOf.get(id)!.capacity_units) errs.push(`${id}: rider capacity exceeded`);
  for (const [id, v] of slots) if (v > input.settings.max_active_leases) errs.push(`${id}: lease limit exceeded`);
  for (const b of offerableBatches(input)) {
    const placed = perBatch.get(b.id) ?? 0;
    const unresolved = plan.unresolved.filter((u) => u.batch_id === b.id).reduce((n, u) => n + u.quantity, 0);
    if (placed + unresolved !== b.remaining_qty) errs.push(`${b.id}: allocated ${placed} + unresolved ${unresolved} != ${b.remaining_qty}`);
  }
  return errs;
}

export interface RiderOption {
  batch: Batch; donor: Donor; shelter: Shelter; quantity: number; feasibility: Feasibility; etaMs: number; slackMin: number;
  remainingSafeMin: number; flag: string | null;
}

/** Ranked list of batches a given rider can reach, least remaining safe time first. */
export function optionsForRider(input: AllocInput, riderId: string): RiderOption[] {
  const rider = input.riders.find((r) => r.id === riderId);
  if (!rider) return [];
  const reserved = reservedByShelter(input.allocations);
  const free = rider.capacity_units - (committedByRider(input.leases).get(rider.id) ?? 0);
  const slotOk = (activeLeaseCount(input.leases).get(rider.id) ?? 0) < input.settings.max_active_leases;
  if (free <= 0 || !slotOk || rider.availability === "offline") return [];
  const out: RiderOption[] = [];
  for (const batch of offerableBatches(input)) {
    const donor = input.donors.find((d) => d.id === batch.donor_id);
    if (!donor) continue;
    const ordered = input.shelters.filter((s) => s.status === "open").sort((a, b) => haversineKm(donor, a) - haversineKm(donor, b));
    for (const s of ordered) {
      const compat = checkCompatibility(batch.category, s, input.rules);
      const roomLeft = s.unmet_demand - (reserved.get(s.id) ?? 0);
      if (!compat.ok || roomLeft <= 0) continue;
      const a = assess({ batch, donor, shelter: s, from: rider, viaDonor: true, offsetMin: 0, now: input.now, settings: input.settings });
      if (a.feasibility === "infeasible") continue;
      out.push({
        batch, donor, shelter: s, quantity: Math.min(free, batch.remaining_qty, roomLeft),
        feasibility: compat.flag && a.feasibility === "feasible" ? "at_risk" : a.feasibility,
        etaMs: a.etaMs, slackMin: a.slackMin, remainingSafeMin: remainingSafeMinutes(batch, input.now), flag: compat.flag,
      });
      break;
    }
  }
  return out.sort((a, b) => a.remainingSafeMin - b.remainingSafeMin);
}
