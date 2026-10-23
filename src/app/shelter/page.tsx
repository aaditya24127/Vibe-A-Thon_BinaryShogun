"use client";
import { useState, type FormEvent } from "react";
import { useApp } from "@/lib/data/store";
import { act } from "@/lib/actions";
import type { OutboxRecord } from "@/lib/data/mirror";
import { reasonForm, shelterDemandForm } from "@/lib/data/schemas";
import { CATEGORY_LABEL } from "@/lib/engine/labels";
import { ACTIVE_STATES, reservedByShelter } from "@/lib/engine/state";
import { Button, Card, Field, Input, Metric, Notice, Section, Select, Table } from "@/components/ui";
import { Empty, FeasBadge, PageHead, PendingActions, Pick, Screen, StateBadge, hhmm } from "@/components/shared";

function outcome(rec: OutboxRecord) {
  if (rec.status === "confirmed") return { tone: "calm" as const, text: rec.reason ?? "Saved by the server." };
  if (rec.status === "rejected") return { tone: "critical" as const, text: `Not saved. ${rec.reason ?? ""}` };
  return { tone: "warn" as const, text: "Saved on this device, will sync. The server has not confirmed this change." };
}

export default function ShelterPage() {
  const shelterId = useApp((s) => s.identity.shelterId);
  const setIdentity = useApp((s) => s.setIdentity);
  const [msg, setMsg] = useState<Record<string, { tone: "calm" | "warn" | "critical"; text: string }>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  return (
    <Screen>
      {(view, now) => {
        const sh = view.shelters.find((s) => s.id === shelterId);
        const reserved = sh ? (reservedByShelter(view.allocations).get(sh.id) ?? 0) : 0;
        const incoming = sh ? view.allocations.filter((a) => a.shelter_id === sh.id && a.status !== "RELEASED" && a.status !== "CANCELLED") : [];

        async function run(key: string, fn: () => Promise<OutboxRecord>) {
          const rec = await fn();
          setMsg((m) => ({ ...m, [key]: outcome(rec) }));
        }
        function demand(e: FormEvent<HTMLFormElement>) {
          e.preventDefault();
          const p = shelterDemandForm.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
          if (!p.success) { setErr({ demand: p.error.issues[0].message }); return; }
          setErr({}); void run("demand", () => act.shelterDemand(sh!.id, p.data.unmet, p.data.reason));
        }
        function status(e: FormEvent<HTMLFormElement>) {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const p = reasonForm.safeParse({ reason: fd.get("reason") });
          if (!p.success) { setErr({ status: p.error.issues[0].message }); return; }
          setErr({}); void run("status", () => act.shelterStatus(sh!.id, fd.get("status") as "open" | "closed", p.data.reason));
        }
        function resources(e: FormEvent<HTMLFormElement>) {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const p = reasonForm.safeParse({ reason: fd.get("reason") });
          if (!p.success) { setErr({ resources: p.error.issues[0].message }); return; }
          const cats = fd.getAll("cat").map(String);
          if (!cats.length) { setErr({ resources: "Accept at least one category" }); return; }
          setErr({});
          void run("resources", () => act.shelterResources(sh!.id, fd.get("water") === "on", fd.get("fuel") === "on", fd.get("cold") === "on", cats, p.data.reason));
        }

        return (
          <>
            <PageHead title="Shelter"><p className="text-[13px] text-mocha-700">Changes here can reroute deliveries that are already on the way.</p></PageHead>
            <div className="mb-6"><Pick label="Shelter" items={view.shelters} value={shelterId} onChange={(id) => setIdentity({ role: "shelter", shelterId: id })} /></div>
            {!sh ? <Empty>Choose a shelter to continue.</Empty> : (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-3 gap-3">
                    <Metric label="Status" value={sh.status === "open" ? "Open" : "Closed"} tone={sh.status === "open" ? "calm" : "critical"} />
                    <Metric label="Unmet demand" value={sh.unmet_demand} />
                    <Metric label="Reserved incoming" value={reserved} note={`${Math.max(0, sh.unmet_demand - reserved)} still open`} />
                  </div>

                  <Card>
                    <form onSubmit={demand} className="flex flex-col gap-3" aria-label="Set unmet demand">
                      <h2>Unmet demand</h2>
                      <Field label="Units still needed" htmlFor="unmet" error={err.demand}><Input id="unmet" name="unmet" type="number" min={0} defaultValue={sh.unmet_demand} key={sh.unmet_demand} /></Field>
                      <Field label="Reason" htmlFor="d-reason"><Input id="d-reason" name="reason" placeholder="Another group delivered 30 meals" /></Field>
                      <Button type="submit" variant="primary">Save demand</Button>
                      {msg.demand && <Notice tone={msg.demand.tone}>{msg.demand.text}</Notice>}
                    </form>
                  </Card>

                  <Card>
                    <form onSubmit={status} className="flex flex-col gap-3" aria-label="Open or closed">
                      <h2>Open or closed</h2>
                      <Field label="Status" htmlFor="status"><Select id="status" name="status" defaultValue={sh.status}><option value="open">Open</option><option value="closed">Closed</option></Select></Field>
                      <Field label="Reason" htmlFor="s-reason" error={err.status}><Input id="s-reason" name="reason" placeholder="Roof damage, closed for the night" /></Field>
                      <Button type="submit" variant="secondary">Save status</Button>
                      {msg.status && <Notice tone={msg.status.tone}>{msg.status.text}</Notice>}
                    </form>
                  </Card>

                  <Card>
                    <form onSubmit={resources} className="flex flex-col gap-3" aria-label="Resources and accepted categories" key={`${sh.id}-${sh.updated_at}`}>
                      <h2>Resources on site</h2>
                      {[["water", "Clean water", sh.has_water], ["fuel", "Cooking fuel", sh.has_cooking_fuel], ["cold", "Cold storage", sh.has_cold_storage]].map(([n, l, v]) => (
                        <label key={String(n)} className="flex items-center gap-2 text-[15px]"><input type="checkbox" name={String(n)} defaultChecked={Boolean(v)} className="size-4 accent-[#4a0f1f]" />{String(l)}</label>
                      ))}
                      <fieldset className="flex flex-col gap-1"><legend className="text-[13px] font-semibold">Accepted categories</legend>
                        {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
                          <label key={k} className="flex items-center gap-2 text-[15px]"><input type="checkbox" name="cat" value={k} defaultChecked={sh.accepted_categories.includes(k as never)} className="size-4 accent-[#4a0f1f]" />{l}</label>
                        ))}
                      </fieldset>
                      <Field label="Reason" htmlFor="r-reason" error={err.resources}><Input id="r-reason" name="reason" placeholder="Water tank refilled" /></Field>
                      <Button type="submit" variant="secondary">Save resources</Button>
                      {msg.resources && <Notice tone={msg.resources.tone}>{msg.resources.text}</Notice>}
                    </form>
                  </Card>
                  <PendingActions filter={(o) => o.type.startsWith("set_shelter")} />
                </div>

                <Section title="Incoming allocations" aside={`${incoming.filter((a) => ACTIVE_STATES.includes(a.status)).length} active`}>
                  {!incoming.length ? <Empty>No deliveries are assigned to this shelter.</Empty> : (
                    <Table head={["Batch", "Quantity", "Status", "ETA", "Feasibility", "Why it may be at risk"]}>
                      {incoming.map((a) => {
                        const b = view.batches.find((x) => x.id === a.batch_id);
                        const l = view.leases.find((x) => x.allocation_id === a.id);
                        return (
                          <tr key={a.id}>
                            <td className="font-semibold">{a.batch_id}<div className="font-normal text-mocha-700">{b?.item_name}</div></td>
                            <td>{a.quantity} {b?.unit}</td>
                            <td><StateBadge state={a.status} /></td>
                            <td>{a.status === "DELIVERED" ? "Delivered" : l?.eta_at ? hhmm(l.eta_at) : "Not set"}</td>
                            <td><FeasBadge f={a.feasibility} /></td>
                            <td>{a.blocking_reason ?? (a.status === "UNRESOLVED" ? "No destination found" : "None")}</td>
                          </tr>
                        );
                      })}
                    </Table>
                  )}
                  <p className="text-[13px] text-mocha-700">Deliveries show as delivered only after the rider enters the quantity received and the server confirms it. Time now {hhmm(now)}.</p>
                </Section>
              </div>
            )}
          </>
        );
      }}
    </Screen>
  );
}
