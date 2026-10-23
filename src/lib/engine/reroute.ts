import type { Allocation, Batch, Donor, Feasibility, Lease, Rider, Rule, Settings, Shelter } from "../types";
import { checkCompatibility } from "./compatibility";
import { haversineKm, type Point } from "./geo";
import { reservedByShelter } from "./state";
import { assess } from "./time";

export interface RerouteInput {
  allocation: Allocation; lease: Lease; batch: Batch; donor: Donor; rider: Rider;
  shelters: Shelter[]; allocations: Allocation[]; rules: Rule[]; settings: Settings; now: number;
}

export interface ReroutePiece { shelter_id: string; quantity: number; etaMs: number; slackMin: number; feasibility: Feasibility; flag: string | null; reason: string | null }
export interface ReroutePlan {
  moved: number; unresolvedQty: number; unresolvedReason: string | null; pieces: ReroutePiece[];
  /** Quantity that stays on the original shelter. */
  stay: number;
}

/**
 * Mirrors _reroute in the database: split the moved quantity across open compatible shelters with remaining demand,
 * nearest first along a chain from the rider's position, recalculating feasibility for every piece.
 */
export function planReroute(input: RerouteInput, moveQty: number): ReroutePlan {
  const { allocation, lease, batch, donor, rider, shelters, rules, settings, now } = input;
  const move = Math.min(Math.max(moveQty, 1), allocation.quantity);
  const stay = allocation.quantity - move;
  const reserved = reservedByShelter(input.allocations.filter((a) => a.id !== allocation.id));
  if (stay > 0) reserved.set(allocation.shelter_id, (reserved.get(allocation.shelter_id) ?? 0) + stay);
  let rem = move;
  let from: Point = { lat: rider.lat, lng: rider.lng };
  let viaDonor = allocation.status === "RESERVED";
  let offset = lease.delay_min;
  const pieces: ReroutePiece[] = [];
  let guard = 0;
  while (rem > 0 && guard++ < 10) {
    const candidates = shelters
      .filter((s) => s.status === "open" && s.id !== allocation.shelter_id)
      .map((s) => ({ s, d: haversineKm(from, s) }))
      .sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id));
    let chosen: { s: Shelter; avail: number; a: ReturnType<typeof assess>; flag: string | null } | null = null;
    for (const { s } of candidates) {
      const c = checkCompatibility(batch.category, s, rules);
      const avail = s.unmet_demand - (reserved.get(s.id) ?? 0);
      if (!c.ok || avail <= 0) continue;
      const a = assess({ batch, donor, shelter: s, from, viaDonor, offsetMin: offset, now, settings });
      if (a.feasibility === "infeasible") continue;
      chosen = { s, avail, a, flag: c.flag };
      break;
    }
    if (!chosen) break;
    const qty = Math.min(rem, chosen.avail);
    pieces.push({
      shelter_id: chosen.s.id, quantity: qty, etaMs: chosen.a.etaMs, slackMin: chosen.a.slackMin,
      feasibility: chosen.flag && chosen.a.feasibility === "feasible" ? "at_risk" : chosen.a.feasibility,
      flag: chosen.flag, reason: [chosen.flag, chosen.a.reason].filter(Boolean).join("; ") || null,
    });
    reserved.set(chosen.s.id, (reserved.get(chosen.s.id) ?? 0) + qty);
    rem -= qty;
    from = chosen.s; viaDonor = false; offset = chosen.a.minutes;
  }
  return {
    moved: move - rem, unresolvedQty: rem, stay, pieces,
    unresolvedReason: rem > 0 ? whyNone(batch, shelters, rules, allocation.shelter_id, reserved) : null,
  };
}

export function whyNone(batch: Batch, shelters: Shelter[], rules: Rule[], exclude: string, reserved: Map<string, number>): string {
  const open = shelters.filter((s) => s.status === "open" && s.id !== exclude);
  if (!open.length) return "No other shelter is open";
  const ok = open.filter((s) => checkCompatibility(batch.category, s, rules).ok);
  if (!ok.length) return "No open shelter accepts this category with the resources it needs";
  if (!ok.some((s) => s.unmet_demand - (reserved.get(s.id) ?? 0) > 0)) return "No compatible shelter has unmet demand remaining";
  return "No compatible shelter is reachable before the safe-by deadline";
}
