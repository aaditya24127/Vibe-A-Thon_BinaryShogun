"use client";
import Link from "next/link";
import { useState } from "react";
import { act } from "@/lib/actions";
import { computeAlerts, computeLedger, computeMetrics, riskRows } from "@/lib/derive";
import { useApp } from "@/lib/data/store";
import { reservedByShelter } from "@/lib/engine/state";
import { formatMinutes } from "@/lib/engine/time";
import { Button, Empty, Metric, Section, Status, Table } from "@/components/ui";
import { SimStatusCard } from "@/components/SimPanel";
import { OfflineNotice, Screen, StateBadge, FeasBadge, hhmm, hhmmss } from "@/components/shared";
import { MapView } from "@/components/MapView";
import { RescueIQ } from "@/components/RescueIQ";
import { ChaosLab } from "@/components/ChaosLab";
import { LeaseActions } from "@/components/LeaseActions";

export default function OperationsPage() {
  const local = useApp((s) => s.local);
  const [note, setNote] = useState<string | null>(null);

  return (
    <Screen>
      {(view, now) => {
        const m = computeMetrics(view, now);
        const alerts = computeAlerts(view);
        const risk = riskRows(view, now);
        const reserved = reservedByShelter(view.allocations);
        const events = view.events.slice(0, 8);
        const ledger = computeLedger(view);
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-mocha-700">
              Last sweep {m.lastSweepMs ? `${hhmmss(m.lastSweepMs)} (${formatMinutes((now - m.lastSweepMs) / 60000)} ago)` : "not yet run"}. Sweeps run every 30 seconds while any device is connected. Server time {hhmmss(now)}. <Link href="/timeline" className="underline underline-offset-4">Event timeline</Link>
            </p>
            <SimStatusCard perspective="operations" />
            <OfflineNotice />
            {local && <div role="status" className="rounded-[6px] border border-dashed border-cherry px-3 py-2 text-[13px] text-cherry">Showing local results that are not yet synced.</div>}

            <section aria-label="Metrics" className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 xl:grid-cols-9">
              <Metric label="Active donations" value={m.activeBatches} note={`${m.awaitingQty} units awaiting delivery`} />
              <Metric label="Riders available" value={m.riders.available} />
              <Metric label="Riders assigned" value={m.riders.assigned} />
              <Metric label="Riders unresponsive" value={m.riders.unresponsive} tone={m.riders.unresponsive ? "critical" : "calm"} note={`${m.riders.disconnected} disconnected`} />
              <Metric label="Deadline-risk deliveries" value={m.riskCount} tone={m.riskCount ? "warn" : "calm"} />
              <Metric label="Delivered and confirmed" value={m.delivered.qty} note={`${m.delivered.count} deliveries`} />
              <Metric label="Unresolved units" value={m.openUnresolvedQty} tone={m.openUnresolvedQty ? "critical" : "calm"} />
              <Metric label="Successful recoveries" value={m.recoveries} />
              <Metric label="Successful reroutes" value={m.reroutes} />
            </section>

            <Section title="Critical alerts" aside={`${alerts.length}`}>
              {!alerts.length ? <Empty>No critical alerts.</Empty> : (
                <ul className="m-0 flex list-none flex-col divide-y divide-mocha-600 border-y border-cherry p-0">
                  {alerts.map((a) => {
                    const lease = a.leaseId ? view.leases.find((l) => l.id === a.leaseId) : undefined;
                    const un = a.unresolvedId ? view.unresolved.find((u) => u.id === a.unresolvedId) : undefined;
                    return (
                      <li key={a.key} className="flex flex-col gap-2 py-3">
                        <div className="flex flex-wrap items-center gap-2"><Status tone="critical">{a.kind === "custody" ? "Custody uncertain" : a.kind === "unresolved" ? "Unresolved" : a.kind === "closed" ? "Shelter closed" : a.kind === "expired" ? "Expired" : "Not feasible"}</Status><span className="font-semibold">{a.title}</span></div>
                        <p className="text-[13px]">{a.detail}</p>
                        {lease && <LeaseActions lease={lease} dispatcher />}
                        {un && !un.cargo_with_rider && (
                          <div><Button size="sm" onClick={async () => { const r = await act.reopen(un.id); setNote(r.status === "confirmed" ? "Returned to the pool." : r.status === "rejected" ? `Rejected: ${r.reason}` : "Saved on this device, will sync."); }}>Return to pool</Button></div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {note && <p className="text-[13px]">{note}</p>}
            </Section>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Section title="Live rider map">
                <MapView view={view} now={now} dispatcher />
              </Section>
              <Section title="Shelter demand and supply">
                <Table head={["Shelter", "Status", "Demand", "Incoming", "Open"]}>
                  {view.shelters.map((s) => {
                    const inc = reserved.get(s.id) ?? 0;
                    return (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td><Status tone={s.status === "open" ? "calm" : "critical"}>{s.status === "open" ? "Open" : "Closed"}</Status></td>
                        <td>{s.unmet_demand}</td><td>{inc}</td><td>{Math.max(0, s.unmet_demand - inc)}</td>
                      </tr>
                    );
                  })}
                </Table>
              </Section>
            </div>

            <RescueIQ view={view} now={now} />

            <Section title="Deadline-risk deliveries" aside={`${risk.length}`}>
              {!risk.length ? <Empty>No delivery is at risk.</Empty> : (
                <Table head={["Batch", "Rider", "Destination", "Quantity", "Status", "Margin", "Why"]}>
                  {risk.map((r) => (
                    <tr key={r.allocation.id}>
                      <td className="font-semibold">{r.batch.id}</td><td>{r.riderName}</td><td>{r.shelterName}</td><td>{r.allocation.quantity} {r.batch.unit}</td>
                      <td><StateBadge state={r.allocation.status} /> <FeasBadge f={r.allocation.feasibility} /></td>
                      <td>{r.slackMin == null ? "Not set" : r.slackMin < 0 ? "Past limit" : formatMinutes(r.slackMin)}</td><td>{r.reason}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
              <Section title="Impact ledger" aside="From recorded events">
                <Table head={["Measure", "Total"]}>
                  {ledger.map((r) => <tr key={r.label}><td>{r.label}{r.projection ? " (projection)" : ""}</td><td className="font-semibold">{r.value}</td></tr>)}
                </Table>
              </Section>
            </div>

            <Section title="Recent events" aside={<Link href="/timeline" className="underline underline-offset-4">All events</Link>}>
              <ul className="m-0 flex list-none flex-col divide-y divide-mocha-600 border-y border-mocha-600 p-0 text-[13px]">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                    <span className="text-mocha-700">{hhmmss(e.created_at)}</span><span className="font-semibold">{e.entity_id}</span>
                    <span>{e.previous_state ?? "none"} to {e.new_state ?? "none"}</span><span className="text-mocha-700">{e.reason}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <ChaosLab view={view} />
            <p className="text-[13px] text-mocha-700">Times shown in this device's local zone. Deadlines use server time {hhmm(now)}.</p>
          </div>
        );
      }}
    </Screen>
  );
}
