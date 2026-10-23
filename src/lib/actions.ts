import { useApp } from "./data/store";
import type { OutboxRecord } from "./data/mirror";

/**
 * The single action dispatcher. Every write from every screen goes through here, then through the outbox,
 * then to a database function that re-checks the rule before it changes anything.
 */
const send = (type: string, payload: Record<string, unknown>, label: string): Promise<OutboxRecord> =>
  useApp.getState().dispatch(type, payload, label);

export const act = {
  createBatch: (v: { donor_id: string; item_name: string; category: string; quantity: number; unit: string; pickup_start_min: number; pickup_end_min: number; expires_in_min: number; handling: string; storage: string; compat: string }) =>
    send("create_batch", {
      p_donor_id: v.donor_id, p_item_name: v.item_name, p_category: v.category, p_quantity: v.quantity, p_unit: v.unit,
      p_pickup_start_min: v.pickup_start_min, p_pickup_end_min: v.pickup_end_min, p_expires_in_min: v.expires_in_min,
      p_handling: v.handling, p_storage: v.storage, p_compat: v.compat,
    }, `Post ${v.item_name}`),
  claim: (batchId: string, shelterId: string, riderId: string, qty: number) =>
    send("claim_lease", { p_batch_id: batchId, p_shelter_id: shelterId, p_rider_id: riderId, p_quantity: qty }, `Claim ${batchId}`),
  applyPlan: (assignments: { batch_id: string; shelter_id: string; rider_id: string; quantity: number }[], unresolved: { batch_id: string; quantity: number; reason: string }[]) =>
    send("apply_plan", { p_plan: { assignments, unresolved } }, "Apply RescueIQ recommendation"),
  pickup: (leaseId: string) => send("confirm_pickup", { p_lease_id: leaseId }, "Confirm pickup"),
  inTransit: (leaseId: string) => send("mark_in_transit", { p_lease_id: leaseId }, "Mark in transit"),
  deliver: (leaseId: string, received: number) => send("confirm_delivery", { p_lease_id: leaseId, p_received: received }, `Confirm delivery of ${received}`),
  resolveCustody: (leaseId: string, decision: "resume" | "write_off", note: string) =>
    send("resolve_custody", { p_lease_id: leaseId, p_decision: decision, p_note: note }, decision === "resume" ? "Resume delivery" : "Write off cargo"),
  reroute: (leaseId: string, reason: string) => send("reroute_lease", { p_lease_id: leaseId, p_reason: reason }, "Reroute lease"),
  reopen: (unresolvedId: string) => send("reopen_unresolved", { p_unresolved_id: unresolvedId }, "Return unresolved quantity to pool"),
  shelterStatus: (id: string, status: "open" | "closed", reason: string) =>
    send("set_shelter_status", { p_shelter_id: id, p_status: status, p_reason: reason }, `Set shelter ${status}`),
  shelterDemand: (id: string, unmet: number, reason: string) =>
    send("set_shelter_demand", { p_shelter_id: id, p_unmet: unmet, p_reason: reason }, "Set unmet demand"),
  shelterResources: (id: string, water: boolean, fuel: boolean, cold: boolean, categories: string[], reason: string) =>
    send("set_shelter_resources", { p_shelter_id: id, p_water: water, p_fuel: fuel, p_cold: cold, p_categories: categories, p_reason: reason }, "Update shelter resources"),
  riderCapacity: (id: string, cap: number, reason: string) =>
    send("set_rider_capacity", { p_rider_id: id, p_capacity: cap, p_reason: reason }, "Change rider capacity"),
  silent: (id: string, silent: boolean) => send("set_rider_silent", { p_rider_id: id, p_silent: silent }, silent ? "Stop rider heartbeats" : "Resume rider heartbeats"),
  advance: (minutes: number) => send("advance_time", { p_minutes: minutes }, `Advance clock ${minutes} min`),
  delay: (riderId: string, minutes: number) => send("report_traffic_delay", { p_rider_id: riderId, p_minutes: minutes }, `Traffic delay ${minutes} min`),
  incident: (riderId: string, type: string, leaseId: string | null, note: string, minutes: number) =>
    send("add_incident", { p_rider_id: riderId, p_type: type, p_lease_id: leaseId, p_note: note, p_minutes: minutes }, `Report ${type.replace("_", " ")}`),
  processIncident: (id: string) => send("process_incident", { p_incident_id: id }, "Mark incident processed"),
  reset: () => send("reset_simulation", {}, "Reset simulation"),
};

/** Heartbeats are sent directly and never queued. While offline they are recorded locally as not sent. */
export async function sendHeartbeat(riderId: string, pos?: { lat: number; lng: number }) {
  const st = useApp.getState();
  if (!st.online || st.connection === "not_configured") { st.noteHeartbeat(false); return false; }
  const res = await st.callRpc("heartbeat", { p_rider_id: riderId, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_source: "device" });
  st.noteHeartbeat(!!res?.success);
  return !!res?.success;
}
