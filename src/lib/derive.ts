import type { Allocation, Batch, EventRow, Lease, Snapshot } from "./types";
import { allocate, offerableBatches, type Plan } from "./engine/allocate";
import { ackWindowMs, isRiderConnected, riderStatus } from "./engine/labels";
import { ACTIVE_STATES, reservedByShelter } from "./engine/state";
import { formatMinutes, remainingSafeMinutes } from "./engine/time";

const TERMINAL = ["DELIVERED", "EXPIRED", "CANCELLED"];

export interface Metrics {
  activeBatches: number;
  awaitingQty: number;
  riders: { available: number; assigned: number; unresponsive: number; disconnected: number };
  delivered: { count: number; qty: number };
  recoveries: number;
  reroutes: number;
  openUnresolvedQty: number;
  riskCount: number;
  lastSweepMs: number | null;
}

/** Every figure is derived from the snapshot tables; the derivation for each is listed in PROJECT_CAPSULE.md. */
export function computeMetrics(s: Snapshot, now: number): Metrics {
  const live = s.batches.filter((b) => !TERMINAL.includes(b.status));
  const awaiting = live.reduce((n, b) => n + b.remaining_qty, 0)
    + s.allocations.filter((a) => ACTIVE_STATES.includes(a.status) || a.status === "REROUTING").reduce((n, a) => n + a.quantity, 0);
  const counts = { available: 0, assigned: 0, unresponsive: 0, disconnected: 0 };
  for (const r of s.riders) {
    const status = riderStatus(r, s.leases, s.allocations, now, s.settings);
    const hasLease = s.leases.some((l) => l.rider_id === r.id && ACTIVE_STATES.includes(l.status));
    if (status === "Offline or disconnected") (hasLease ? counts.unresponsive++ : counts.disconnected++);
    else if (status === "Available") counts.available++;
    else counts.assigned++;
  }
  const delivered = s.allocations.filter((a) => a.status === "DELIVERED");
  return {
    activeBatches: live.length, awaitingQty: awaiting, riders: counts,
    delivered: { count: delivered.length, qty: delivered.reduce((n, a) => n + a.quantity, 0) },
    recoveries: s.events.filter((e) => e.event_type === "recovery").length,
    reroutes: s.events.filter((e) => e.event_type === "reroute_success").length,
    openUnresolvedQty: s.unresolved.filter((u) => u.status === "open").reduce((n, u) => n + u.quantity, 0),
    riskCount: riskRows(s, now).length,
    lastSweepMs: s.settings.last_sweep_epoch ? s.settings.last_sweep_epoch * 1000 : null,
  };
}

export interface RiskRow {
  allocation: Allocation; lease: Lease; batch: Batch; shelterName: string; riderName: string; slackMin: number | null; reason: string;
}

/** Live deliveries that are at risk, infeasible, or about to run out of safe time. */
export function riskRows(s: Snapshot, now: number): RiskRow[] {
  const out: RiskRow[] = [];
  for (const a of s.allocations) {
    if (!ACTIVE_STATES.includes(a.status)) continue;
    const lease = s.leases.find((l) => l.allocation_id === a.id);
    const batch = s.batches.find((b) => b.id === a.batch_id);
    if (!lease || !batch) continue;
    const slack = lease.eta_at ? (Date.parse(batch.expires_at) - s.settings.safety_buffer_min * 60000 - Date.parse(lease.eta_at)) / 60000 : null;
    const sinceExpiry = (Date.parse(batch.expires_at) - now) / 60000;
    const risky = a.feasibility !== "feasible" || a.status === "CUSTODY_UNCERTAIN" || sinceExpiry < s.settings.at_risk_threshold_min;
    if (!risky) continue;
    out.push({
      allocation: a, lease, batch, slackMin: slack,
      shelterName: s.shelters.find((x) => x.id === a.shelter_id)?.name ?? a.shelter_id,
      riderName: s.riders.find((r) => r.id === lease.rider_id)?.name ?? lease.rider_id,
      reason: a.status === "CUSTODY_UNCERTAIN" ? "Custody is uncertain" : a.blocking_reason ?? `${formatMinutes(sinceExpiry)} until expiry`,
    });
  }
  return out.sort((a, b) => (a.slackMin ?? 1e9) - (b.slackMin ?? 1e9));
}

export interface Alert { key: string; title: string; detail: string; kind: "custody" | "unresolved" | "closed" | "infeasible" | "expired"; leaseId?: string; unresolvedId?: string }

export function computeAlerts(s: Snapshot): Alert[] {
  const out: Alert[] = [];
  for (const l of s.leases.filter((x) => x.status === "CUSTODY_UNCERTAIN")) {
    const a = s.allocations.find((x) => x.id === l.allocation_id);
    const r = s.riders.find((x) => x.id === l.rider_id);
    out.push({ key: `c-${l.id}`, kind: "custody", leaseId: l.id, title: `Custody uncertain: ${a?.batch_id ?? ""}`,
      detail: `${r?.name ?? l.rider_id} confirmed pickup of ${l.quantity} units, then stopped responding. The dispatcher decides.` });
  }
  for (const u of s.unresolved.filter((x) => x.status === "open")) {
    out.push({ key: `u-${u.id}`, kind: "unresolved", unresolvedId: u.id, title: `${u.quantity} units unresolved: ${u.batch_id}`, detail: u.reason });
  }
  for (const sh of s.shelters.filter((x) => x.status === "closed")) {
    const n = s.allocations.filter((a) => a.shelter_id === sh.id && ACTIVE_STATES.includes(a.status));
    if (n.length) out.push({ key: `s-${sh.id}`, kind: "closed", title: `${sh.name} is closed with ${n.length} active lease(s)`, detail: "Reroute or resolve these leases." });
  }
  for (const b of s.batches.filter((x) => x.status === "EXPIRED")) {
    out.push({ key: `e-${b.id}`, kind: "expired", title: `${b.id} expired`, detail: `${b.item_name} passed its expiry time before it was all delivered.` });
  }
  return out;
}

export interface LedgerRow { label: string; value: number; note?: string; projection?: boolean }

/** Impact ledger, calculated from events. Awaiting allocation is the one current-state figure and is labelled as such. */
export function computeLedger(s: Snapshot): LedgerRow[] {
  const sum = (kind: string, pick?: (e: EventRow) => boolean) =>
    s.events.filter((e) => e.event_type === kind && (!pick || pick(e))).reduce((n, e) => n + Number(e.quantity ?? 0), 0);
  const count = (kind: string) => s.events.filter((e) => e.event_type === kind).length;
  const pool = s.batches.filter((b) => !TERMINAL.includes(b.status)).reduce((n, b) => n + b.remaining_qty, 0);
  return [
    { label: "Donated (units posted)", value: sum("created") },
    { label: "Delivered and confirmed", value: sum("delivered") },
    { label: "Delivered within the safe window", value: sum("delivered", (e) => e.meta?.on_time === true) },
    { label: "Awaiting allocation (current pool)", value: pool },
    { label: "Expired or undeliverable", value: sum("expired") + sum("written_off") },
    { label: "Successful recoveries", value: count("recovery") },
    { label: "Successful reroutes", value: count("reroute_success") },
  ];
}

export interface RescueItem {
  batch: Batch; remainingSafeMin: number; assignments: Plan["assignments"]; unresolved: Plan["unresolved"]; action: string;
}

/** RescueIQ: at-risk batches with the calculated allocation and the action in plain words. */
export function computeRescue(s: Snapshot, now: number): { plan: Plan; items: RescueItem[] } {
  const plan = allocate({ batches: s.batches, donors: s.donors, shelters: s.shelters, riders: s.riders, leases: s.leases, allocations: s.allocations, rules: s.rules, settings: s.settings, now });
  const items: RescueItem[] = [];
  for (const b of offerableBatches({ batches: s.batches, now })) {
    const safe = remainingSafeMinutes(b, now);
    const assignments = plan.assignments.filter((a) => a.batch_id === b.id);
    const unresolved = plan.unresolved.filter((u) => u.batch_id === b.id);
    const atRisk = safe < s.settings.at_risk_threshold_min * 2 || unresolved.length > 0 || assignments.some((a) => a.feasibility !== "feasible");
    if (!atRisk) continue;
    items.push({ batch: b, remainingSafeMin: safe, assignments, unresolved, action: describeAction(s, b, assignments, unresolved) });
  }
  return { plan, items: items.sort((a, b) => a.remainingSafeMin - b.remainingSafeMin) };
}

export function describeAction(s: Snapshot, b: Batch, assignments: Plan["assignments"], unresolved: Plan["unresolved"]): string {
  const rider = (id: string) => s.riders.find((r) => r.id === id)?.name ?? id;
  const shelter = (id: string) => s.shelters.find((x) => x.id === id)?.name ?? id;
  const parts = assignments.map((a) => `${rider(a.rider_id)} carries ${a.quantity} ${b.unit} to ${shelter(a.shelter_id)}`);
  const lead = parts.length ? `${parts.join("; ")}.` : "No rider can take this batch right now.";
  const rest = unresolved.length ? ` ${unresolved.reduce((n, u) => n + u.quantity, 0)} ${b.unit} stay unresolved: ${unresolved[0].reason}.` : "";
  return lead + rest;
}

/** Templated sentences built from data. No language model is involved. */
export function copilotLines(s: Snapshot, item: RescueItem, now: number): string[] {
  const out: string[] = [];
  const b = item.batch;
  out.push(`${b.item_name} has ${formatMinutes(item.remainingSafeMin)} before pickup must happen to stay inside the safe window (expires in ${formatMinutes((Date.parse(b.expires_at) - now) / 60000)}).`);
  const seen = new Set<string>();
  for (const a of item.assignments) {
    if (seen.has(a.shelter_id) || seen.size >= 2) continue;
    seen.add(a.shelter_id);
    const sh = s.shelters.find((x) => x.id === a.shelter_id)!;
    out.push(`${sh.name} still needs ${sh.unmet_demand - (reservedByShelter(s.allocations).get(sh.id) ?? 0)} units and is reachable with ${Math.round(a.slackMin)} min to spare.`);
  }
  for (const u of item.unresolved) out.push(`${u.quantity} units cannot be placed. Reason: ${u.reason}.`);
  return out;
}

export function describeEntityBefore(s: Snapshot, kind: string, id: string): string {
  if (kind === "shelter") {
    const sh = s.shelters.find((x) => x.id === id);
    if (!sh) return id;
    const active = s.allocations.filter((a) => a.shelter_id === id && ACTIVE_STATES.includes(a.status));
    return `${sh.name}: ${sh.status}, unmet demand ${sh.unmet_demand}, water ${sh.has_water ? "yes" : "no"}; ${active.length} active allocation(s) holding ${active.reduce((n, a) => n + a.quantity, 0)} units`;
  }
  if (kind === "rider") {
    const r = s.riders.find((x) => x.id === id);
    if (!r) return id;
    const ls = s.leases.filter((l) => l.rider_id === id && ACTIVE_STATES.includes(l.status));
    return `${r.name}: capacity ${r.capacity_units}, ${ls.length} active lease(s) holding ${ls.reduce((n, l) => n + l.quantity, 0)} units, ${r.sim_silent ? "silent" : "responsive"}`;
  }
  if (kind === "clock") return `Simulated clock offset is ${s.settings.clock_offset_min} min`;
  return id;
}

export const connectedRiders = (s: Snapshot, now: number) => s.riders.filter((r) => isRiderConnected(r, now, s.settings));
export const ackWindowSeconds = (s: Snapshot) => ackWindowMs(s.settings) / 1000;
