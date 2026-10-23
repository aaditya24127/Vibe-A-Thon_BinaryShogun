"use client";
import { useState } from "react";
import { act } from "@/lib/actions";
import { INCIDENT_LABEL, RIDER_TONE, riderStatus } from "@/lib/engine/labels";
import { ACTIVE_STATES } from "@/lib/engine/state";
import { formatMinutes } from "@/lib/engine/time";
import type { Snapshot } from "@/lib/types";
import { Button, Card, Notice, Status } from "./ui";
import { FeasBadge, StateBadge, hhmm } from "./shared";
import { LeaseActions } from "./LeaseActions";

/** Contextual panel for a rider. Same content on the street map and on the schematic map. */
export function RiderPanel({ view, now, riderId, onClose, dispatcher = false }: { view: Snapshot; now: number; riderId: string; onClose: () => void; dispatcher?: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const rider = view.riders.find((r) => r.id === riderId);
  if (!rider) return null;
  const status = riderStatus(rider, view.leases, view.allocations, now, view.settings);
  const leases = view.leases.filter((l) => l.rider_id === rider.id && ACTIVE_STATES.includes(l.status));
  const incidents = view.incidents.filter((i) => i.rider_id === rider.id).slice(-4).reverse();
  const hbAge = Math.max(0, Math.round((now - Date.parse(rider.last_heartbeat_at)) / 1000));

  return (
    <Card className="flex flex-col gap-3" aria-label={`Rider ${rider.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2>{rider.name} <span className="font-normal text-mocha-700">({rider.id})</span></h2>
          <p className="text-[13px] text-mocha-700">Capacity {rider.capacity_units}. Last heartbeat {hbAge < 120 ? `${hbAge} s ago` : formatMinutes(hbAge / 60) + " ago"}.{rider.release_count ? ` Released ${rider.release_count} lease(s).` : ""}</p>
        </div>
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>
      <div><Status tone={RIDER_TONE[status]}>{status}</Status>{rider.sim_silent && <Status tone="critical" className="ml-2">Not sending heartbeats</Status>}</div>
      {!leases.length ? <p className="text-[13px] text-mocha-700">No current assignment.</p> : leases.map((l) => {
        const a = view.allocations.find((x) => x.id === l.allocation_id)!;
        const b = view.batches.find((x) => x.id === a.batch_id)!;
        const s = view.shelters.find((x) => x.id === a.shelter_id)!;
        const donor = view.donors.find((d) => d.id === b.donor_id)!;
        const safe = l.eta_at ? (Date.parse(b.expires_at) - view.settings.safety_buffer_min * 60000 - Date.parse(l.eta_at)) / 60000 : null;
        return (
          <div key={l.id} className="flex flex-col gap-2 border-t border-mocha-600 pt-3">
            <div className="flex flex-wrap items-center gap-2"><StateBadge state={l.status} /><FeasBadge f={a.feasibility} /></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-mocha-700">Assignment</dt><dd>{b.id} {b.item_name}</dd>
              <dt className="text-mocha-700">Cargo</dt><dd>{l.quantity} {b.unit}</dd>
              <dt className="text-mocha-700">From</dt><dd>{donor.name}</dd>
              <dt className="text-mocha-700">Destination</dt><dd>{s.name}</dd>
              <dt className="text-mocha-700">Estimated arrival</dt><dd>{l.eta_at ? hhmm(l.eta_at) : "Not set"}{l.delay_min ? ` (includes ${l.delay_min} min delay)` : ""}</dd>
              <dt className="text-mocha-700">Safe window left</dt><dd>{safe == null ? "Not set" : safe < 0 ? "Past the safe-by limit" : `${formatMinutes(safe)} after arrival`}</dd>
              <dt className="text-mocha-700">Feasibility</dt><dd>{a.blocking_reason ?? "All checks pass"}</dd>
            </dl>
            {dispatcher && <LeaseActions lease={l} dispatcher />}
            {dispatcher && ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT"].includes(l.status) && (
              <Button size="sm" onClick={async () => { const r = await act.reroute(l.id, "Dispatcher requested a reroute"); setNote(r.status === "confirmed" ? (r.reason ?? "Rerouted") : r.status === "rejected" ? `Rejected: ${r.reason}` : "Saved on this device, will sync"); }}>Reroute this lease</Button>
            )}
          </div>
        );
      })}
      {note && <Notice>{note}</Notice>}
      <div className="border-t border-mocha-600 pt-3">
        <h3>Reported incidents</h3>
        {!incidents.length ? <p className="text-[13px] text-mocha-700">None reported.</p> : (
          <ul className="mt-1 flex flex-col gap-1 text-[13px]">{incidents.map((i) => <li key={i.id}>{INCIDENT_LABEL[i.type]}: {i.note || "no note"} <span className="text-mocha-700">({i.sync_status})</span></li>)}</ul>
        )}
      </div>
    </Card>
  );
}
