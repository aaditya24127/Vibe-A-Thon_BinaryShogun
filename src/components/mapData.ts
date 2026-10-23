import type { Snapshot } from "@/lib/types";
import { RIDER_TONE, riderStatus, type RiderStatus, type Tone } from "@/lib/engine/labels";
import { ACTIVE_STATES } from "@/lib/engine/state";

export interface RiderMark { id: string; name: string; lat: number; lng: number; status: RiderStatus; tone: Tone; etaMs: number | null }
export interface Route { leaseId: string; riderId: string; points: [number, number][]; pickupDone: boolean }

export function mapData(view: Snapshot, now: number) {
  const riders: RiderMark[] = view.riders.map((r) => {
    const status = riderStatus(r, view.leases, view.allocations, now, view.settings);
    const lease = view.leases.find((l) => l.rider_id === r.id && ACTIVE_STATES.includes(l.status));
    return { id: r.id, name: r.name, lat: r.lat, lng: r.lng, status, tone: RIDER_TONE[status], etaMs: lease?.eta_at ? Date.parse(lease.eta_at) : null };
  });
  const routes: Route[] = [];
  for (const l of view.leases) {
    if (!ACTIVE_STATES.includes(l.status)) continue;
    const a = view.allocations.find((x) => x.id === l.allocation_id);
    const b = a && view.batches.find((x) => x.id === a.batch_id);
    const d = b && view.donors.find((x) => x.id === b.donor_id);
    const s = a && view.shelters.find((x) => x.id === a.shelter_id);
    const r = view.riders.find((x) => x.id === l.rider_id);
    if (!a || !d || !s || !r) continue;
    const pts: [number, number][] = [[r.lat, r.lng]];
    if (l.status === "RESERVED") pts.push([d.lat, d.lng]);
    pts.push([s.lat, s.lng]);
    routes.push({ leaseId: l.id, riderId: r.id, points: pts, pickupDone: l.status !== "RESERVED" });
  }
  return { riders, routes };
}

export const LEGEND = [
  "Square: donor (pickup point)",
  "Triangle: shelter (delivery point). Filled means closed.",
  "Circle: rider, labelled with its status in text",
  "Solid line: route to the shelter. Dashed line: leg to the pickup.",
];
