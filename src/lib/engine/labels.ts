import type { Feasibility, Lease, LifecycleState, Rider, Settings, Allocation } from "../types";

/** Tones map to the five palette families; every tone is always paired with text. */
export type Tone = "calm" | "active" | "warn" | "critical" | "muted";

export const STATE_LABEL: Record<LifecycleState, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved, waiting for pickup",
  PICKUP_CONFIRMED: "Picked up",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered and confirmed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  RELEASED: "Released",
  REROUTING: "Being rerouted",
  CUSTODY_UNCERTAIN: "Custody uncertain",
  UNRESOLVED: "Unresolved",
};

export const STATE_TONE: Record<LifecycleState, Tone> = {
  AVAILABLE: "calm", RESERVED: "active", PICKUP_CONFIRMED: "active", IN_TRANSIT: "active", DELIVERED: "calm",
  EXPIRED: "critical", CANCELLED: "muted", RELEASED: "muted", REROUTING: "warn", CUSTODY_UNCERTAIN: "critical", UNRESOLVED: "critical",
};

export const FEASIBILITY_LABEL: Record<Feasibility, string> = {
  feasible: "Feasible", at_risk: "At risk", infeasible: "Not feasible",
};
export const FEASIBILITY_TONE: Record<Feasibility, Tone> = { feasible: "calm", at_risk: "warn", infeasible: "critical" };

export const CATEGORY_LABEL: Record<string, string> = {
  cooked_food: "Cooked food", medical: "Medical supplies", ration_kit: "Ration kit", infant_formula: "Infant formula", essential_kit: "Essential kit",
};

export const RESOURCE_LABEL: Record<string, string> = { water: "Clean water", cooking_fuel: "Cooking fuel", cold_storage: "Cold storage" };

export const INCIDENT_LABEL: Record<string, string> = {
  delay: "Delay", road_blocked: "Road blocked", vehicle_issue: "Vehicle issue", other: "Other",
};

export type RiderStatus = "Available" | "Assigned" | "In transit" | "Delayed" | "Critical risk" | "Offline or disconnected";
export const RIDER_TONE: Record<RiderStatus, Tone> = {
  Available: "calm", Assigned: "active", "In transit": "active", Delayed: "warn", "Critical risk": "critical", "Offline or disconnected": "muted",
};

const ACTIVE = new Set<LifecycleState>(["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT", "CUSTODY_UNCERTAIN"]);

export function ackWindowMs(s: Settings) {
  return (s.missed_heartbeat_threshold * s.heartbeat_interval_s + s.ack_grace_s) * 1000;
}

export function isRiderConnected(r: Rider, now: number, s: Settings) {
  return r.availability !== "offline" && now - Date.parse(r.last_heartbeat_at) <= ackWindowMs(s);
}

export function riderStatus(
  r: Rider, leases: Lease[], allocations: Allocation[], now: number, s: Settings,
): RiderStatus {
  if (!isRiderConnected(r, now, s)) return "Offline or disconnected";
  const mine = leases.filter((l) => l.rider_id === r.id && ACTIVE.has(l.status));
  if (!mine.length) return "Available";
  const allocs = mine.map((l) => allocations.find((a) => a.id === l.allocation_id)).filter(Boolean) as Allocation[];
  if (mine.some((l) => l.status === "CUSTODY_UNCERTAIN") || allocs.some((a) => a.feasibility === "infeasible")) return "Critical risk";
  if (mine.some((l) => l.delay_min > 0) || allocs.some((a) => a.feasibility === "at_risk")) return "Delayed";
  if (mine.some((l) => l.status === "IN_TRANSIT" || l.status === "PICKUP_CONFIRMED")) return "In transit";
  return "Assigned";
}

/** Sync labels for the offline outbox. */
export const SYNC_LABEL = {
  local: "Saved on this device, will sync",
  sent: "Sent to server",
  confirmed: "Confirmed by server",
  rejected: "Rejected",
} as const;
