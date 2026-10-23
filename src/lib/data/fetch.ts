import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings, Snapshot } from "../types";
import {
  allocationRow, batchRow, donorRow, eventRow, incidentRow, leaseRow, parseRows, riderRow, ruleRow, shelterRow, unresolvedRow,
} from "./schemas";

async function table(sb: SupabaseClient, name: string, order?: { col: string; asc: boolean }, limit?: number) {
  let q = sb.from(name).select("*");
  if (order) q = q.order(order.col, { ascending: order.asc });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as unknown[];
}

/** Read every table once. Every incoming record is validated with zod before it reaches the UI. */
export async function fetchSnapshot(sb: SupabaseClient): Promise<Snapshot> {
  const [donors, shelters, riders, batches, allocations, leases, rules, events, incidents, unresolved, settingsRows, time] = await Promise.all([
    table(sb, "donors"), table(sb, "shelters"), table(sb, "riders"), table(sb, "batches"), table(sb, "allocations"), table(sb, "leases"),
    table(sb, "compatibility_rules"), table(sb, "events", { col: "id", asc: false }, 600), table(sb, "incidents"), table(sb, "unresolved"),
    table(sb, "settings"), sb.rpc("server_time"),
  ]);
  const settings = Object.fromEntries((settingsRows as { key: string; value: number | string }[]).map((r) => [r.key, Number(r.value)])) as unknown as Settings;
  const readAtMs = Date.now();
  const serverNowMs = typeof time.data === "string" ? Date.parse(time.data) : readAtMs;
  return {
    donors: parseRows(donorRow, donors) as Snapshot["donors"],
    shelters: parseRows(shelterRow, shelters) as Snapshot["shelters"],
    riders: parseRows(riderRow, riders) as Snapshot["riders"],
    batches: parseRows(batchRow, batches) as Snapshot["batches"],
    allocations: parseRows(allocationRow, allocations) as Snapshot["allocations"],
    leases: parseRows(leaseRow, leases) as Snapshot["leases"],
    rules: parseRows(ruleRow, rules) as Snapshot["rules"],
    events: parseRows(eventRow, events) as Snapshot["events"],
    incidents: parseRows(incidentRow, incidents) as Snapshot["incidents"],
    unresolved: parseRows(unresolvedRow, unresolved) as Snapshot["unresolved"],
    settings, serverNowMs, readAtMs,
  };
}

export const REALTIME_TABLES = ["leases", "allocations", "batches", "shelters", "riders", "events", "unresolved", "incidents"] as const;
