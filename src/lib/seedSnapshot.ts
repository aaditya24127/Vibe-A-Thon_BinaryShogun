import { SEED_BATCHES, SEED_DONORS, SEED_RIDERS, SEED_RULES, SEED_SETTINGS, SEED_SHELTERS } from "./seed";
import { safeByMs } from "./engine/time";
import type { Batch, Settings, Snapshot } from "./types";

const iso = (ms: number) => new Date(ms).toISOString();

/** The seeded operating state as a snapshot. Used as the first-load baseline and as the local reset target. */
export function buildSeedSnapshot(now = Date.now()): Snapshot {
  const settings = Object.fromEntries(Object.entries(SEED_SETTINGS).map(([k, [v]]) => [k, v])) as unknown as Settings;
  const shelters = SEED_SHELTERS.map((s) => ({ ...s, accepted_categories: [...s.accepted_categories], updated_at: iso(now) }));
  const donors = SEED_DONORS.map((d) => ({ ...d }));
  const batches: Batch[] = SEED_BATCHES.map((b) => {
    const donor = donors.find((d) => d.id === b.donor_id)!;
    const expires_at = iso(now + b.expires * 60_000);
    return {
      id: b.id, donor_id: b.donor_id, item_name: b.item_name, category: b.category, quantity: b.quantity, remaining_qty: b.quantity,
      unit: b.unit, pickup_window_start: iso(now + b.start * 60_000), pickup_window_end: iso(now + b.end * 60_000), expires_at,
      safe_by_at: iso(safeByMs({ category: b.category, expires_at }, donor, shelters as never, settings)),
      handling_notes: b.handling, storage_requirement: b.storage, compatibility_requirement: b.compat, status: "AVAILABLE", created_at: iso(now),
    };
  });
  return {
    donors,
    shelters: shelters as Snapshot["shelters"],
    riders: SEED_RIDERS.map((r) => ({
      ...r, availability: "available" as const, last_heartbeat_at: iso(now), active_lease_count: 0, release_count: 0, mode: "simulated" as const, sim_silent: false,
    })),
    batches, allocations: [], leases: [],
    rules: SEED_RULES.map((r) => ({ ...r, required_resources: [...r.required_resources] })) as Snapshot["rules"],
    events: batches.map((b, i) => ({
      id: i + 1, entity_type: "batch", entity_id: b.id, previous_state: null, new_state: "AVAILABLE", reason: "Batch posted by donor",
      event_type: "created", quantity: b.quantity, meta: {}, created_at: iso(now),
    })),
    incidents: [], unresolved: [], settings, serverNowMs: now, readAtMs: now,
  };
}
