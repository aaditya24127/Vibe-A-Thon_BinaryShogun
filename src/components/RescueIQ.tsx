"use client";
import { useState } from "react";
import { act } from "@/lib/actions";
import type { OutboxRecord } from "@/lib/data/mirror";
import { computeRescue, copilotLines } from "@/lib/derive";
import { formatMinutes } from "@/lib/engine/time";
import type { Snapshot } from "@/lib/types";
import { Button, Card, Empty, Notice, Status } from "./ui";
import { FeasBadge, hhmm } from "./shared";

type Result = { success: boolean; reason: string; batch_id?: string };

export function RescueIQ({ view, now }: { view: Snapshot; now: number }) {
  const { items, plan } = computeRescue(view, now);
  const [results, setResults] = useState<Record<string, { tone: "calm" | "warn" | "critical"; lines: string[] }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const name = (id: string) => view.riders.find((r) => r.id === id)?.name ?? id;
  const shelter = (id: string) => view.shelters.find((s) => s.id === id)?.name ?? id;

  function report(key: string, rec: OutboxRecord) {
    if (rec.status === "confirmed" || rec.status === "rejected") {
      const rs = ((rec.result?.results as Result[] | undefined) ?? []);
      const bad = rs.filter((r) => !r.success);
      setResults((m) => ({
        ...m,
        [key]: {
          tone: rec.status === "rejected" || bad.length ? "critical" : "calm",
          lines: [rec.reason ?? "", ...bad.map((b) => `Rejected by the database: ${b.reason}`)].filter(Boolean),
        },
      }));
    } else setResults((m) => ({ ...m, [key]: { tone: "warn", lines: ["Saved on this device, will sync. Nothing is applied until the server confirms it."] } }));
  }

  async function apply(batchIds: string[], key: string) {
    setBusy(key);
    const assignments = plan.assignments.filter((a) => batchIds.includes(a.batch_id)).map(({ batch_id, shelter_id, rider_id, quantity }) => ({ batch_id, shelter_id, rider_id, quantity }));
    const unresolved = plan.unresolved.filter((u) => batchIds.includes(u.batch_id));
    report(key, await act.applyPlan(assignments, unresolved));
    setBusy(null);
  }

  return (
    <section className="flex flex-col gap-3" aria-label="RescueIQ">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-mocha-600 pb-2">
        <h2>RescueIQ</h2>
        <Button variant="primary" disabled={!items.length || busy !== null} onClick={() => apply(items.map((i) => i.batch.id), "all")}>Apply all recommendations</Button>
      </div>
      {results.all && <Notice tone={results.all.tone}>{results.all.lines.join(" ")}</Notice>}
      <p className="text-[13px] text-mocha-700">Recommendations are calculated from live data. Nothing changes until you apply one, and the database re-checks every assignment.</p>
      {!items.length ? <Empty>No batch is at risk. Every offered batch has a feasible allocation with time to spare.</Empty> : <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,23rem),1fr))]">{items.map((it) => (
        <Card key={it.batch.id} className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3>{it.batch.id}: {it.batch.item_name}</h3>
              <p className="text-[13px] text-mocha-700">{it.batch.remaining_qty} {it.batch.unit} unallocated. Pickup must start within {formatMinutes(it.remainingSafeMin)}.</p>
            </div>
            {it.remainingSafeMin < view.settings.at_risk_threshold_min ? <Status tone="critical">Urgent</Status> : it.unresolved.length ? <Status tone="warn">Quantity unresolved</Status> : <Status tone="warn">At risk</Status>}
          </div>
          <p className="text-[15px]"><span className="font-semibold">Recommended action. </span>{it.action}</p>
          {it.assignments.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {it.assignments.map((a, i) => (
                <li key={i} className="min-w-0 rounded-[6px] border border-mocha-600/60 bg-cream/60 p-2 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 break-words font-semibold">{name(a.rider_id)} to {shelter(a.shelter_id)}</span>
                    <FeasBadge f={a.feasibility} />
                  </div>
                  <p className="text-mocha-700">{a.quantity} {it.batch.unit}. ETA {hhmm(a.etaMs)}.</p>
                  <ul className="m-0 mt-1 list-disc pl-4 text-mocha-700">{a.checks.map((c) => <li key={c} className="break-words">{c}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
          {it.unresolved.map((u) => <Notice key={u.reason} tone="critical">{`${u.quantity} ${it.batch.unit} unresolved. ${u.reason}.`}</Notice>)}
          <ul className="m-0 list-disc pl-5 text-[13px] text-mocha-700">{copilotLines(view, it, now).map((l) => <li key={l}>{l}</li>)}</ul>
          <div className="flex flex-col gap-2">
            <Button variant="primary" disabled={busy !== null} onClick={() => apply([it.batch.id], it.batch.id)}>Apply recommendation</Button>
            {results[it.batch.id] && <Notice tone={results[it.batch.id].tone}>{results[it.batch.id].lines.join(" ")}</Notice>}
          </div>
        </Card>
      ))}</div>}
    </section>
  );
}
