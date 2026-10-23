import type { Allocation, Lease, LifecycleState, Snapshot } from "../types";

export const ACTIVE_STATES: LifecycleState[] = ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT", "CUSTODY_UNCERTAIN"];
export const MOVING_STATES: LifecycleState[] = ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT"];
export const isActive = (s: LifecycleState) => ACTIVE_STATES.includes(s);

/** Units reserved at each shelter by live allocations (matches _reserved in the database). */
export function reservedByShelter(allocations: Allocation[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of allocations) if (isActive(a.status)) m.set(a.shelter_id, (m.get(a.shelter_id) ?? 0) + a.quantity);
  return m;
}

/** Units committed by each rider across live leases (matches _committed in the database). */
export function committedByRider(leases: Lease[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of leases) if (isActive(l.status)) m.set(l.rider_id, (m.get(l.rider_id) ?? 0) + l.quantity);
  return m;
}

export function activeLeaseCount(leases: Lease[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of leases) if (isActive(l.status)) m.set(l.rider_id, (m.get(l.rider_id) ?? 0) + 1);
  return m;
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function indexById<T extends { id: string }>(xs: T[]): Map<string, T> {
  return new Map(xs.map((x) => [x.id, x]));
}

export function emptySnapshot(): Snapshot {
  return {
    donors: [], shelters: [], riders: [], batches: [], allocations: [], leases: [], rules: [], events: [], incidents: [], unresolved: [],
    settings: {
      speed_kmph: 25, pickup_allowance_min: 10, safety_buffer_min: 15, heartbeat_interval_s: 30, missed_heartbeat_threshold: 2,
      ack_grace_s: 30, max_active_leases: 2, at_risk_threshold_min: 45, clock_offset_min: 0, sim_time_scale: 30,
    },
    serverNowMs: Date.now(), readAtMs: Date.now(),
  };
}
