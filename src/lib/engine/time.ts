import type { Batch, Donor, Feasibility, Settings, Shelter, Snapshot } from "../types";
import { haversineKm, type Point } from "./geo";

const MIN = 60_000;

/** Travel minutes for a straight-line distance at the configured scooter speed. */
export const legMinutes = (km: number, s: Settings) => (km / s.speed_kmph) * 60;

/** Simulated server time for a snapshot. Device clocks are used only to advance between reads. */
export function nowMs(snap: Snapshot, deviceNow = Date.now()): number {
  return snap.serverNowMs + Math.max(0, deviceNow - snap.readAtMs);
}

export interface Assessment {
  etaMs: number;
  slackMin: number;
  feasibility: Feasibility;
  reason: string | null;
  minutes: number;
}

/**
 * Mirrors _assess in the database.
 * minutes = offset + [leg to donor + pickup allowance] + leg to shelter. Deadline = expiry minus safety buffer.
 */
export function assess(args: {
  batch: Batch; donor: Donor; shelter: Shelter; from: Point; viaDonor: boolean; offsetMin: number; now: number; settings: Settings;
}): Assessment {
  const { batch, donor, shelter, from, viaDonor, offsetMin, now, settings } = args;
  let minutes: number;
  let pickupMin: number | null = null;
  if (viaDonor) {
    pickupMin = offsetMin + legMinutes(haversineKm(from, donor), settings);
    minutes = pickupMin + settings.pickup_allowance_min + legMinutes(haversineKm(donor, shelter), settings);
  } else {
    minutes = offsetMin + legMinutes(haversineKm(from, shelter), settings);
  }
  const etaMs = now + minutes * MIN;
  const slackMin = (Date.parse(batch.expires_at) - settings.safety_buffer_min * MIN - etaMs) / MIN;
  let feasibility: Feasibility = "feasible";
  let reason: string | null = null;
  if (pickupMin !== null && now + pickupMin * MIN > Date.parse(batch.pickup_window_end)) {
    feasibility = "infeasible";
    reason = "Rider cannot reach the donor before the pickup window closes";
  } else if (slackMin < 0) {
    feasibility = "infeasible";
    reason = `Arrival ${Math.round(-slackMin)} min after the safe-by limit (expiry minus ${settings.safety_buffer_min} min buffer)`;
  } else if (slackMin < settings.at_risk_threshold_min) {
    feasibility = "at_risk";
    reason = `Only ${Math.round(slackMin)} min of margin before the safe-by limit`;
  }
  return { etaMs, slackMin: Math.round(slackMin * 10) / 10, feasibility, reason, minutes };
}

/** safe_by_at = expires_at - estimated transit time - safety buffer, using the nearest open shelter that accepts the category. */
export function safeByMs(batch: Pick<Batch, "category" | "expires_at">, donor: Point, shelters: Shelter[], s: Settings): number {
  const km = shelters
    .filter((sh) => sh.status === "open" && sh.accepted_categories.includes(batch.category))
    .map((sh) => haversineKm(donor, sh));
  const transit = s.pickup_allowance_min + (km.length ? legMinutes(Math.min(...km), s) : 0);
  return Date.parse(batch.expires_at) - (transit + s.safety_buffer_min) * MIN;
}

/** Minutes left before pickup must happen for the batch to stay deliverable. */
export const remainingSafeMinutes = (batch: Batch, now: number) => (Date.parse(batch.safe_by_at) - now) / MIN;

export const minutesUntil = (iso: string, now: number) => (Date.parse(iso) - now) / MIN;

export function formatMinutes(min: number): string {
  if (min <= 0) return "0 min";
  if (min < 90) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
