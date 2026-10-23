"use client";
import { useState } from "react";
import { format } from "date-fns";
import { LayoutList, Rows3, X } from "lucide-react";
import { useSim } from "@/lib/sim";
import type { EventRow } from "@/lib/types";
import { Button, Empty, Field, Input, Status, Table, cn } from "@/components/ui";
import { Screen } from "@/components/shared";
import { SimStatusCard } from "@/components/SimPanel";

type Source = "Donor" | "Rider" | "Shelter" | "Operations";
interface Item { key: string; at: number; source: Source; title: string; description: string; prev: string | null; next: string | null; entity: string; simulated: boolean; raw?: EventRow }

const TITLES: Record<string, string> = {
  created: "Batch created", claim: "Kit claimed", pickup: "Pickup confirmed", transit: "In transit", delivered: "Delivery confirmed", release: "Claim released",
  custody_uncertain: "Custody uncertain", custody_resolved: "Custody resolved", reroute_start: "Reroute started", reroute_piece: "Reroute assignment", reroute_done: "Reroute complete",
  reroute_success: "Reroute succeeded", reroute_partial: "Partial reroute", reroute_failed: "Reroute failed", unresolved: "Quantity unresolved", expired: "Expired", recovery: "Recovery",
  recovery_pending: "Recovery pending", eta_update: "ETA updated", delay: "Delay reported", incident: "Incident", shelter_status: "Shelter status changed", shelter_demand: "Shelter demand updated",
  shelter_resources: "Shelter resources updated", rider_capacity: "Rider capacity changed", rider_silent: "Rider heartbeat change", clock: "Simulated clock advanced", written_off: "Cargo written off", reopened: "Returned to pool",
};
function sourceOf(e: EventRow): Source {
  const k = e.event_type ?? "";
  if (e.entity_type === "batch" && k === "created") return "Donor";
  if (e.entity_type === "shelter") return "Shelter";
  if (["claim", "pickup", "transit", "delivered", "delay", "incident"].includes(k) || e.entity_type === "rider" && k !== "rider_silent") return "Rider";
  if (e.entity_type === "incident") return "Rider";
  return "Operations";
}

export default function TimelinePage() {
  const [src, setSrc] = useState<"all" | Source>("all");
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [mode, setMode] = useState<"timeline" | "table">("timeline");
  const [open, setOpen] = useState<Item | null>(null);
  const simEvents = useSim((s) => s.events);

  return (
    <Screen>
      {(view) => {
        const real: Item[] = view.events.map((e) => ({
          key: `e${e.id}`, at: Date.parse(e.created_at), source: sourceOf(e), title: TITLES[e.event_type ?? ""] ?? "State change", description: e.reason,
          prev: e.previous_state, next: e.new_state, entity: `${e.entity_type} ${e.entity_id}`, simulated: false, raw: e,
        }));
        const sim: Item[] = simEvents.map((e) => ({
          key: `s${e.id}`, at: e.at, source: /Pickup|Rider|Travel|transit|Arriving|Delivered|assigned|reassign|Delay|Route/i.test(e.title) ? "Rider" : /receipt/i.test(e.title) ? "Shelter" : /ready/i.test(e.title) ? "Donor" : "Operations",
          title: e.title, description: e.detail, prev: null, next: e.stage, entity: "SIM-001", simulated: true,
        }));
        const all = [...real, ...sim].sort((a, b) => b.at - a.at || b.key.localeCompare(a.key));
        const rows = all.filter((i) => (src === "all" || i.source === src) && (!q || `${i.title} ${i.description} ${i.entity}`.toLowerCase().includes(q.toLowerCase())) && (!day || format(i.at, "yyyy-MM-dd") === day));

        return (
          <div className="flex flex-col gap-3">
            <SimStatusCard perspective="operations" />
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex gap-1" role="group" aria-label="Filter by module">
                {(["all", "Donor", "Rider", "Shelter", "Operations"] as const).map((s) => (
                  <Button key={s} size="sm" variant={src === s ? "primary" : "secondary"} aria-pressed={src === s} onClick={() => setSrc(s)}>{s === "all" ? "All" : s}</Button>
                ))}
              </div>
              <div className="w-44"><Field label="Search" htmlFor="tq"><Input id="tq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Batch, rider, shelter" /></Field></div>
              <div className="w-40"><Field label="Date" htmlFor="td"><Input id="td" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field></div>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant={mode === "timeline" ? "primary" : "secondary"} aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}><Rows3 size={14} aria-hidden />Timeline</Button>
                <Button size="sm" variant={mode === "table" ? "primary" : "secondary"} aria-pressed={mode === "table"} onClick={() => setMode("table")}><LayoutList size={14} aria-hidden />Table</Button>
              </div>
            </div>
            <p className="text-[13px] text-mocha-700">{rows.length} events, newest first. Times in your local zone. Events marked SIMULATION come from the local simulation and are not production history.</p>
            {!rows.length ? <Empty>No events match these filters.</Empty> : mode === "table" ? (
              <Table head={["Time", "Module", "Event", "Entity", "Change", "Description"]}>
                {rows.map((i) => (
                  <tr key={i.key} className="cursor-pointer hover:bg-mocha-200" onClick={() => setOpen(i)}>
                    <td className="whitespace-nowrap">{format(i.at, "dd MMM HH:mm:ss")}</td><td>{i.source}</td>
                    <td>{i.title} {i.simulated && <Status tone="warn">SIMULATION</Status>}</td><td>{i.entity}</td><td>{i.prev ?? "none"} to {i.next ?? "none"}</td><td>{i.description}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <ol className="relative m-0 flex list-none flex-col gap-2 p-0 pl-5 before:absolute before:left-[7px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-mocha-600">
                {rows.slice(0, 200).map((i) => (
                  <li key={i.key} className="relative">
                    <span aria-hidden className={cn("absolute -left-[18px] top-3 size-3 rounded-full border-2 border-burgundy", i.simulated ? "bg-latte" : "bg-cherry")} />
                    <button onClick={() => setOpen(i)} className="flex w-full flex-col gap-0.5 rounded-[10px] border border-mocha-600 bg-latte px-3 py-2 text-left text-[13px] transition-colors hover:bg-mocha-200 focus-visible:outline-2 focus-visible:outline-cherry">
                      <span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[15px]">{i.title}</span><Status tone="active">{i.source}</Status>{i.simulated && <Status tone="warn">SIMULATION</Status>}<span className="ml-auto text-mocha-700">{format(i.at, "dd MMM HH:mm:ss")}</span></span>
                      <span>{i.description}</span>
                      <span className="text-mocha-700">{i.entity}{i.prev || i.next ? `: ${i.prev ?? "none"} to ${i.next ?? "none"}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {open && (
              <div className="fixed inset-0 z-50 flex justify-end bg-burgundy/30" onClick={() => setOpen(null)}>
                <aside role="dialog" aria-modal="true" aria-label="Event details" onClick={(e) => e.stopPropagation()} className="flex h-full w-[min(26rem,100vw)] flex-col gap-3 overflow-y-auto border-l border-mocha-600 bg-latte p-4">
                  <div className="flex items-center justify-between"><h2>{open.title}</h2><Button size="sm" autoFocus aria-label="Close details" onClick={() => setOpen(null)}><X size={14} aria-hidden />Close</Button></div>
                  <div className="flex flex-wrap gap-2"><Status tone="active">{open.source}</Status>{open.simulated ? <Status tone="warn">SIMULATION</Status> : <Status tone="calm">Recorded by the database</Status>}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-mocha-700">Time</dt><dd>{format(open.at, "dd MMM yyyy HH:mm:ss")}</dd>
                    <dt className="text-mocha-700">Entity</dt><dd>{open.entity}</dd>
                    <dt className="text-mocha-700">Previous</dt><dd>{open.prev ?? "none"}</dd>
                    <dt className="text-mocha-700">New</dt><dd>{open.next ?? "none"}</dd>
                    {open.raw?.quantity != null && <><dt className="text-mocha-700">Quantity</dt><dd>{open.raw.quantity}</dd></>}
                    <dt className="text-mocha-700">Description</dt><dd>{open.description}</dd>
                  </dl>
                  {open.raw && Object.keys(open.raw.meta ?? {}).length > 0 && <pre className="m-0 overflow-x-auto rounded-[6px] border border-mocha-600 bg-cream p-2 text-[12px]">{JSON.stringify(open.raw.meta, null, 2)}</pre>}
                </aside>
              </div>
            )}
          </div>
        );
      }}
    </Screen>
  );
}
