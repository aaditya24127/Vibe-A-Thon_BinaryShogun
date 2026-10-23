"use client";
import dynamic from "next/dynamic";
import { useEffect, useState, type FormEvent } from "react";
import { Maximize2, X } from "lucide-react";
import { useApp } from "@/lib/data/store";
import { act, sendHeartbeat } from "@/lib/actions";
import { incidentForm } from "@/lib/data/schemas";
import { optionsForRider } from "@/lib/engine/allocate";
import { INCIDENT_LABEL, STATE_LABEL } from "@/lib/engine/labels";
import { ACTIVE_STATES } from "@/lib/engine/state";
import { formatMinutes } from "@/lib/engine/time";
import { notify } from "@/lib/toast";
import { useSim } from "@/lib/sim";
import type { Snapshot } from "@/lib/types";
import { Button, Empty, Field, Input, Select, Status, cn } from "@/components/ui";
import { FeasBadge, OfflineNotice, Pick, Screen, StateBadge, hhmm, hhmmss } from "@/components/shared";
import { LeaseActions } from "@/components/LeaseActions";
import { SchematicMap } from "@/components/SchematicMap";
import { SimStatusCard } from "@/components/SimPanel";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false, loading: () => <p className="p-4 text-mocha-700">Loading map</p> });

function Heartbeat({ riderId }: { riderId: string }) {
  const { hbLastSentAt, hbNotSentAt, online } = useApp();
  useEffect(() => {
    void sendHeartbeat(riderId);
    const id = setInterval(() => void sendHeartbeat(riderId), 30_000);
    return () => clearInterval(id);
  }, [riderId]);
  return (
    <span className={cn("text-[13px]", !online && "text-cherry")}>
      {online ? (hbLastSentAt ? `Heartbeat sent ${hhmmss(hbLastSentAt)}` : "Sending heartbeat") : `Last heartbeat not sent${hbNotSentAt ? ` (${hhmmss(hbNotSentAt)})` : ""}. Not queued offline.`}
    </span>
  );
}

function MapPane({ view, now, height, onExpand }: { view: Snapshot; now: number; height: number | string; onExpand?: () => void }) {
  const online = useApp((s) => s.online);
  const [tileErr, setTileErr] = useState(false);
  void setTileErr;
  const schematic = !online || tileErr;
  return schematic
    ? <div className="overflow-auto"><SchematicMap view={view} now={now} selected={null} onSelect={() => undefined} /></div>
    : <LiveMap view={view} now={now} selected={null} onSelect={() => undefined} height={height} onMapClick={onExpand} />;
}

export default function RiderPage() {
  const riderId = useApp((s) => s.identity.riderId);
  const setIdentity = useApp((s) => s.setIdentity);
  const [tab, setTab] = useState<"claim" | "map" | "issues">("map");
  const [full, setFull] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [incErr, setIncErr] = useState<string | undefined>();
  const simActive = useSim((s) => s.active);

  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full]);

  return (
    <Screen>
      {(view, now) => {
        const rider = view.riders.find((r) => r.id === riderId);
        const options = rider ? optionsForRider({ ...view, now }, rider.id) : [];
        const mine = rider ? view.leases.filter((l) => l.rider_id === rider.id && ACTIVE_STATES.includes(l.status)) : [];
        const incidents = rider ? view.incidents.filter((i) => i.rider_id === rider.id).slice(-8).reverse() : [];
        const lease = mine[0];
        const alloc = lease && view.allocations.find((a) => a.id === lease.allocation_id);
        const batch = alloc && view.batches.find((b) => b.id === alloc.batch_id);
        const shelter = alloc && view.shelters.find((s) => s.id === alloc.shelter_id);
        const donor = batch && view.donors.find((d) => d.id === batch.donor_id);
        const history = rider ? view.leases.filter((l) => l.rider_id === rider.id && ["DELIVERED", "RELEASED", "CANCELLED", "EXPIRED"].includes(l.status)).slice(-4).reverse() : [];

        async function claim(batchId: string, shelterId: string, qty: number) {
          setClaiming(batchId);
          await act.claim(batchId, shelterId, rider!.id, qty);
          setClaiming(null);
        }
        function report(e: FormEvent<HTMLFormElement>) {
          e.preventDefault();
          const form = e.currentTarget;
          const p = incidentForm.safeParse(Object.fromEntries(new FormData(form)));
          if (!p.success) { setIncErr(p.error.issues[0].message); return; }
          setIncErr(undefined);
          void act.incident(rider!.id, p.data.type, lease?.id ?? null, p.data.note, p.data.type === "delay" ? p.data.minutes : 0).then((r) => { if (r.status === "confirmed") form.reset(); });
        }

        const summary = lease && batch && shelter && donor ? (
          <div className="flex flex-col gap-2 wc-card p-3">
            <div className="flex flex-wrap items-center gap-2"><StateBadge state={lease.status} />{alloc && <FeasBadge f={alloc.feasibility} />}
              <span className="font-semibold">{batch.item_name}: {lease.quantity} {batch.unit}</span></div>
            <p className="text-[13px] text-mocha-700">{donor.name} to {shelter.name}. ETA {lease.eta_at ? hhmm(lease.eta_at) : "not set"}. Expires in {formatMinutes((Date.parse(batch.expires_at) - now) / 60000)}. Rider capacity {rider!.capacity_units}.</p>
            <LeaseActions lease={lease} />
          </div>
        ) : <p className="rounded-[10px] border border-dashed border-mocha-600 p-3 text-[13px] text-mocha-700">No active delivery. Claim a kit on the left.</p>;

        const claimPanel = (
          <section aria-label="Claim kits" className="flex min-h-0 flex-col gap-2">
            <h2>Claim kits <span className="font-normal text-mocha-700">({options.length})</span></h2>
            {!options.length ? <Empty>Nothing reachable: capacity is full, or every batch is taken or out of range.</Empty> : options.map((o) => (
              <article key={o.batch.id} className="flex flex-col gap-1.5 wc-card p-2.5 text-[13px] ">
                <div className="flex items-start justify-between gap-2"><h3>{o.batch.item_name}</h3><FeasBadge f={o.feasibility} /></div>
                <p>{o.quantity} of {o.batch.remaining_qty} {o.batch.unit}. {o.donor.area_name} to {o.shelter.name}.</p>
                <p className="text-mocha-700">Pickup within {formatMinutes(o.remainingSafeMin)}. ETA {hhmm(o.etaMs)}. {o.batch.handling_notes || "No handling notes"}.</p>
                {o.flag && <p className="text-cherry">{o.flag}</p>}
                <Button size="sm" variant="primary" disabled={claiming !== null} onClick={() => claim(o.batch.id, o.shelter.id, o.quantity)}>{claiming === o.batch.id ? "Claiming" : `Claim ${o.quantity} ${o.batch.unit}`}</Button>
              </article>
            ))}
            {history.length > 0 && <div className="border-t border-mocha-600 pt-2 text-[13px]"><h3>Recent</h3>{history.map((l) => <p key={l.id} className="text-mocha-700">{l.quantity} units: {STATE_LABEL[l.status]}</p>)}</div>}
          </section>
        );

        const issuesPanel = (
          <section aria-label="Issues" className="flex min-h-0 flex-col gap-2">
            <h2>Issues <span className="font-normal text-mocha-700">({incidents.length})</span></h2>
            {simActive && <p className="rounded-[6px] border border-dashed border-cherry px-2 py-1 text-[13px]"><Status tone="warn">SIMULATION</Status> Simulated incidents appear in the Timeline, not here.</p>}
            {!incidents.length ? <Empty>No incidents reported by this rider.</Empty> : incidents.map((i) => (
              <article key={i.id} className="flex flex-col gap-1 wc-card p-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{INCIDENT_LABEL[i.type]}</span><Status tone={i.sync_status === "processed" ? "calm" : "warn"}>{i.sync_status === "processed" ? "Resolved" : "Open"}</Status></div>
                <p>{i.note || "No note"}</p>
                {i.sync_status !== "processed" && <Button size="sm" onClick={() => act.processIncident(i.id)}>Mark resolved</Button>}
              </article>
            ))}
            {lease && ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT"].includes(lease.status) && (
              <Button size="sm" onClick={() => act.reroute(lease.id, "Rider requested a reroute")}>Request reroute</Button>
            )}
            <form onSubmit={report} className="flex flex-col gap-2 wc-card p-2.5" aria-label="Report an issue">
              <h3>Report an issue</h3>
              <Field label="Type" htmlFor="inc-type"><Select id="inc-type" name="type" defaultValue="delay">{Object.entries(INCIDENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Minutes lost (delay only)" htmlFor="inc-min" error={incErr}><Input id="inc-min" name="minutes" type="number" min={0} max={240} defaultValue={0} /></Field>
              <Field label="Note" htmlFor="inc-note"><Input id="inc-note" name="note" /></Field>
              <Button type="submit" size="sm" variant="primary">Send report</Button>
            </form>
          </section>
        );

        const mapPanel = (
          <section aria-label="Delivery map" className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2>Delivery map</h2>
              <Button size="sm" onClick={() => setFull(true)} aria-label="Open full-screen map"><Maximize2 size={14} aria-hidden />Expand</Button>
            </div>
            <div className="overflow-hidden rounded-[10px]"><MapPane view={view} now={now} height="min(58vh, 520px)" onExpand={() => setFull(true)} /></div>
            <SimStatusCard perspective="rider" />
            {summary}
          </section>
        );

        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Pick label="Rider" items={view.riders} value={riderId} onChange={(id) => { setIdentity({ role: "rider", riderId: id }); notify("info", "Rider selected", "Heartbeats now come from this device."); }} />
              {rider && <Heartbeat riderId={rider.id} />}
            </div>
            <OfflineNotice>Offline. Actions are saved on this device and sent when the connection returns.</OfflineNotice>
            {!rider ? <Empty>Choose a rider to see kits you can claim.</Empty> : (
              <>
                <div role="tablist" aria-label="Rider panels" className="flex gap-2 lg:hidden">
                  {([["claim", "Claim kits"], ["map", "Map"], ["issues", "Issues"]] as const).map(([k, l]) => (
                    <Button key={k} role="tab" size="sm" aria-selected={tab === k} variant={tab === k ? "primary" : "secondary"} onClick={() => setTab(k)}>{l}</Button>
                  ))}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[17rem_minmax(0,1fr)_17rem]">
                  <div className={cn("lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto", tab === "claim" ? "block" : "hidden")}>{claimPanel}</div>
                  <div className={cn("lg:block", tab === "map" ? "block" : "hidden")}>{mapPanel}</div>
                  <div className={cn("lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto", tab === "issues" ? "block" : "hidden")}>{issuesPanel}</div>
                </div>
              </>
            )}
            {full && (
              <div role="dialog" aria-modal="true" aria-label="Full-screen map" className="fixed inset-0 z-50 flex flex-col bg-cream">
                <div className="flex flex-wrap items-center gap-2 border-b border-mocha-600 bg-latte px-3 py-2">
                  <h2 className="mr-auto">Delivery map</h2>
                  {lease && <span className="text-[13px]">{STATE_LABEL[lease.status]}. ETA {lease.eta_at ? hhmm(lease.eta_at) : "not set"}</span>}
                  <Button size="sm" variant="primary" onClick={() => setFull(false)} autoFocus aria-label="Close full-screen map"><X size={14} aria-hidden />Close</Button>
                </div>
                <div className="min-h-0 flex-1 p-2"><MapPane view={view} now={now} height="calc(100vh - 11rem)" /></div>
                <div className="max-h-44 overflow-y-auto border-t border-mocha-600 bg-latte p-2"><SimStatusCard perspective="rider" />{summary}</div>
              </div>
            )}
          </div>
        );
      }}
    </Screen>
  );
}
