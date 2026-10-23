import type { Allocation, Batch, Lease } from "../types";

export interface SweepDecision {
  /** Batches whose expiry time has passed with undelivered quantity. */
  expireBatches: string[];
  /** Overdue leases whose pickup was never confirmed: release and offer to the next rider. */
  release: string[];
  /** Overdue leases with confirmed pickup: custody becomes uncertain. Never reassigned. */
  custodyUncertain: string[];
}

/**
 * Decision logic only. The database applies the same rules inside sweep_leases; tests check both agree on shared fixtures.
 * A lease is overdue when its ack_deadline has passed (two missed heartbeats plus grace).
 */
export function decideSweep(args: { batches: Batch[]; leases: Lease[]; allocations?: Allocation[]; now: number }): SweepDecision {
  const { batches, leases, now } = args;
  const expireBatches = batches
    .filter((b) => Date.parse(b.expires_at) <= now && !["DELIVERED", "EXPIRED", "CANCELLED"].includes(b.status))
    .map((b) => b.id);
  const expired = new Set(expireBatches);
  const batchOfLease = new Map((args.allocations ?? []).map((a) => [a.id, a.batch_id]));
  const overdue = leases.filter(
    (l) => ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT"].includes(l.status) && Date.parse(l.ack_deadline) < now,
  );
  // Leases of batches that expire in this sweep are expired, not released or flagged.
  const live = overdue.filter((l) => !expired.has(batchOfLease.get(l.allocation_id) ?? ""));
  return {
    expireBatches,
    release: live.filter((l) => l.status === "RESERVED").map((l) => l.id),
    custodyUncertain: live.filter((l) => l.status !== "RESERVED").map((l) => l.id),
  };
}
