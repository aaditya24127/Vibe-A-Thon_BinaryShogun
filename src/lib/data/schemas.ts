import { z } from "zod";

const iso = z.string();
const category = z.enum(["cooked_food", "medical", "ration_kit", "infant_formula", "essential_kit"]);
const state = z.string();

export const donorRow = z.object({ id: z.string(), name: z.string(), type: z.string(), lat: z.number(), lng: z.number(), area_name: z.string() });
export const shelterRow = z.object({
  id: z.string(), name: z.string(), lat: z.number(), lng: z.number(), area_name: z.string(), total_capacity: z.number(), unmet_demand: z.number(),
  status: z.enum(["open", "closed"]), accepted_categories: z.array(category), has_water: z.boolean(), has_cooking_fuel: z.boolean(),
  has_cold_storage: z.boolean(), updated_at: iso,
});
export const riderRow = z.object({
  id: z.string(), name: z.string(), capacity_units: z.number(), lat: z.number(), lng: z.number(), availability: z.enum(["available", "assigned", "offline"]),
  last_heartbeat_at: iso, active_lease_count: z.number(), release_count: z.number(), mode: z.enum(["simulated", "device"]), sim_silent: z.boolean(),
});
export const batchRow = z.object({
  id: z.string(), donor_id: z.string(), item_name: z.string(), category, quantity: z.number(), remaining_qty: z.number(), unit: z.string(),
  pickup_window_start: iso, pickup_window_end: iso, expires_at: iso, safe_by_at: iso, handling_notes: z.string(), storage_requirement: z.string(),
  compatibility_requirement: z.string(), status: state, created_at: iso,
});
export const allocationRow = z.object({
  id: z.string(), batch_id: z.string(), shelter_id: z.string(), quantity: z.number(), feasibility: z.enum(["feasible", "at_risk", "infeasible"]),
  blocking_reason: z.string().nullable(), status: state, created_at: iso, updated_at: iso,
});
export const leaseRow = z.object({
  id: z.string(), allocation_id: z.string(), rider_id: z.string(), quantity: z.number(), claimed_at: iso, ack_deadline: iso, last_heartbeat_at: iso,
  custody: z.enum(["none", "uncertain", "confirmed"]), status: state, eta_at: iso.nullable(), delay_min: z.number(),
});
export const ruleRow = z.object({
  id: z.string(), category, required_resources: z.array(z.enum(["water", "cooking_fuel", "cold_storage"])), source_note: z.string(), verified: z.boolean(),
});
export const eventRow = z.object({
  id: z.number(), entity_type: z.string(), entity_id: z.string(), previous_state: z.string().nullable(), new_state: z.string().nullable(), reason: z.string(),
  event_type: z.string().nullable(), quantity: z.coerce.number().nullable(), meta: z.record(z.string(), z.unknown()), created_at: iso,
});
export const incidentRow = z.object({
  id: z.string(), rider_id: z.string(), type: z.enum(["delay", "road_blocked", "vehicle_issue", "other"]), related_lease_id: z.string().nullable(),
  note: z.string(), sync_status: z.enum(["saved_locally", "pending", "received", "processed"]), created_at: iso,
});
export const unresolvedRow = z.object({
  id: z.string(), batch_id: z.string(), quantity: z.number(), reason: z.string(), cargo_with_rider: z.boolean(), status: z.enum(["open", "closed"]), created_at: iso,
});

/** Parse incoming rows. Rows that fail validation are dropped rather than rendered half-trusted. */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown[] | null): T[] {
  const out: T[] = [];
  for (const r of rows ?? []) {
    const p = schema.safeParse(r);
    if (p.success) out.push(p.data);
  }
  return out;
}

// ---- form schemas ----
export const batchForm = z.object({
  donor_id: z.string().min(1, "Choose the donor"),
  item_name: z.string().trim().min(2, "Enter the item name"),
  category,
  quantity: z.coerce.number().int("Whole units only").positive("Quantity must be more than zero").max(5000, "Quantity is too large"),
  unit: z.string().trim().min(1, "Enter a unit"),
  pickup_start_min: z.coerce.number().int().min(0, "Pickup cannot start in the past"),
  pickup_end_min: z.coerce.number().int().min(1, "Pickup window must end in the future"),
  expires_in_min: z.coerce.number().int().min(1, "Safe-use deadline must be in the future"),
  handling: z.string().max(300).default(""),
  storage: z.string().max(300).default(""),
  compat: z.string().max(300).default(""),
}).refine((v) => v.pickup_end_min >= v.pickup_start_min, { path: ["pickup_end_min"], message: "Pickup must end after it starts" })
  .refine((v) => v.pickup_end_min <= v.expires_in_min, { path: ["pickup_end_min"], message: "Pickup must end before the safe-use deadline" });

export const shelterDemandForm = z.object({
  unmet: z.coerce.number().int().min(0, "Demand cannot be negative").max(100000),
  reason: z.string().trim().min(3, "Give a short reason"),
});
export const reasonForm = z.object({ reason: z.string().trim().min(3, "Give a short reason") });
export const deliveryForm = z.object({ received: z.coerce.number().int().positive("Enter the quantity received") });
export const incidentForm = z.object({
  type: z.enum(["delay", "road_blocked", "vehicle_issue", "other"]),
  minutes: z.coerce.number().int().min(0).max(240).default(0),
  note: z.string().max(300).default(""),
});
