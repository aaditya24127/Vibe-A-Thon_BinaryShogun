export type Category = "cooked_food" | "medical" | "ration_kit" | "infant_formula" | "essential_kit";
export type Resource = "water" | "cooking_fuel" | "cold_storage";
export type Feasibility = "feasible" | "at_risk" | "infeasible";

export type LifecycleState =
  | "AVAILABLE" | "RESERVED" | "PICKUP_CONFIRMED" | "IN_TRANSIT" | "DELIVERED"
  | "EXPIRED" | "CANCELLED" | "RELEASED" | "REROUTING" | "CUSTODY_UNCERTAIN" | "UNRESOLVED";

export interface Donor { id: string; name: string; type: "restaurant" | "hostel_mess" | "pharmacy" | "other"; lat: number; lng: number; area_name: string }
export interface Shelter {
  id: string; name: string; lat: number; lng: number; area_name: string; total_capacity: number; unmet_demand: number;
  status: "open" | "closed"; accepted_categories: Category[]; has_water: boolean; has_cooking_fuel: boolean; has_cold_storage: boolean; updated_at: string;
}
export interface Rider {
  id: string; name: string; capacity_units: number; lat: number; lng: number; availability: "available" | "assigned" | "offline";
  last_heartbeat_at: string; active_lease_count: number; release_count: number; mode: "simulated" | "device"; sim_silent: boolean;
}
export interface Batch {
  id: string; donor_id: string; item_name: string; category: Category; quantity: number; remaining_qty: number; unit: string;
  pickup_window_start: string; pickup_window_end: string; expires_at: string; safe_by_at: string; handling_notes: string;
  storage_requirement: string; compatibility_requirement: string; status: LifecycleState; created_at: string;
}
export interface Allocation {
  id: string; batch_id: string; shelter_id: string; quantity: number; feasibility: Feasibility; blocking_reason: string | null;
  status: LifecycleState; created_at: string; updated_at: string;
}
export interface Lease {
  id: string; allocation_id: string; rider_id: string; quantity: number; claimed_at: string; ack_deadline: string;
  last_heartbeat_at: string; custody: "none" | "uncertain" | "confirmed"; status: LifecycleState; eta_at: string | null; delay_min: number;
}
export interface Rule { id: string; category: Category; required_resources: Resource[]; source_note: string; verified: boolean }
export interface EventRow {
  id: number; entity_type: string; entity_id: string; previous_state: string | null; new_state: string | null; reason: string;
  event_type: string | null; quantity: number | null; meta: Record<string, unknown>; created_at: string;
}
export interface Incident {
  id: string; rider_id: string; type: "delay" | "road_blocked" | "vehicle_issue" | "other"; related_lease_id: string | null;
  note: string; sync_status: "saved_locally" | "pending" | "received" | "processed"; created_at: string;
}
export interface Unresolved { id: string; batch_id: string; quantity: number; reason: string; cargo_with_rider: boolean; status: "open" | "closed"; created_at: string }

export type Settings = {
  speed_kmph: number; pickup_allowance_min: number; safety_buffer_min: number; heartbeat_interval_s: number;
  missed_heartbeat_threshold: number; ack_grace_s: number; max_active_leases: number; at_risk_threshold_min: number;
  clock_offset_min: number; sim_time_scale: number; last_sweep_epoch?: number;
};

export interface Snapshot {
  donors: Donor[]; shelters: Shelter[]; riders: Rider[]; batches: Batch[]; allocations: Allocation[]; leases: Lease[];
  rules: Rule[]; events: EventRow[]; incidents: Incident[]; unresolved: Unresolved[]; settings: Settings;
  /** Simulated server time (ms since epoch) at the moment the snapshot was read. */
  serverNowMs: number;
  /** Wall-clock ms when the snapshot was read on this device; used only to advance serverNowMs between reads. */
  readAtMs: number;
}

export interface RpcResult {
  success: boolean; new_state?: string | null; reason: string; duplicate?: boolean; [k: string]: unknown;
}
