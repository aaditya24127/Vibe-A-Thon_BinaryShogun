"use client";
import { useState, type ReactNode } from "react";
import { act } from "@/lib/actions";
import { useApp } from "@/lib/data/store";
import type { OutboxRecord } from "@/lib/data/mirror";
import { describeEntityBefore } from "@/lib/derive";
import { CATEGORY_LABEL } from "@/lib/engine/labels";
import { applyLocal, type LocalAction } from "@/lib/localChaos";
import type { Snapshot } from "@/lib/types";
import { Button, Card, Field, Input, Notice, Select, Status } from "./ui";
import { OfflineNotice } from "./shared";

interface Report {
  key: number; mode: "server" | "local"; ok: boolean; triggered: string; previous: string; response: string;
  assignments: string[]; unresolved: string[]; reasons: string[];
}

function buildReport(before: Snapshot, after: Snapshot, base: Pick<Report, "mode" | "ok" | "triggered" | "previous" | "response">): Report {
  const beforeAlloc = new Map(before.allocations.map((a) => [a.id, a]));
  const shelterName = (id: string) => after.shelters.find((s) => s.id === id)?.name ?? id;
  const assignments: string[] = [];
  for (const a of after.allocations) {
    const old = beforeAlloc.get(a.id);
    if (old && old.status === a.status && old.quantity === a.quantity && old.shelter_id === a.shelter_id && old.feasibility === a.feasibility) continue;
    const l = after.leases.find((x) => x.allocation_id === a.id);
    const rider = after.riders.find((r) => r.id === l?.rider_id)?.name ?? "";
    assignments.push(`${a.id} (${a.batch_id}): ${a.quantity} units to ${shelterName(a.shelter_id)} with ${rider}. ${a.status.replace(/_/g, " ").toLowerCase()}, ${a.feasibility.replace("_", " ")}${a.blocking_reason ? `. ${a.blocking_reason}` : ""}`);
  }
  const knownUnres = new Set(before.unresolved.map((u) => u.id));
  const unresolved = after.unresolved.filter((u) => !knownUnres.has(u.id)).map((u) => `${u.quantity} units of ${u.batch_id}: ${u.reason}`);
  const known = new Set(before.events.map((e) => e.id));
  const reasons = after.events.filter((e) => !known.has(e.id)).reverse().map((e) => `${e.entity_type} ${e.entity_id}: ${e.reason}`);
  return { key: Date.now(), ...base, assignments, unresolved, reasons };
}

export function ChaosLab({ view }: { view: Snapshot }) {
  const { online, connection } = useApp();
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const serverMode = online && connection === "connected";
  const open = view.shelters;
  const first = view.riders[0]?.id ?? "";

  async function run(triggered: string, entity: [string, string], server: () => Promise<OutboxRecord>, local: LocalAction) {
    setBusy(true);
    const before = view;
    const previous = describeEntityBefore(before, entity[0], entity[1]);
    if (serverMode) {
      const rec = await server();
      await useApp.getState().refresh();
      const after = useApp.getState().snapshot ?? before;
      setReport(buildReport(before, after, { mode: "server", ok: rec.status === "confirmed", triggered, previous, response: rec.status === "rejected" ? `Rejected: ${rec.reason}` : rec.reason ?? "Confirmed by server" }));
    } else {
      const out = applyLocal(before, local);
      useApp.getState().setLocal(out.snap);
      void server(); // queued in the outbox so the server repeats it once the connection returns
      setReport(buildReport(before, out.snap, { mode: "local", ok: out.ok, triggered, previous, response: out.response }));
    }
    setBusy(false);
  }

  async function reset() {
    setBusy(true);
    if (serverMode) {
      const rec = await act.reset();
      await useApp.getState().refresh();
      setReport({ key: Date.now(), mode: "server", ok: rec.status === "confirmed", triggered: "Reset simulation", previous: "Current simulation state", response: rec.status === "confirmed" ? "Seeded state restored by the database" : `Rejected: ${rec.reason}`, assignments: [], unresolved: [], reasons: [] });
    } else {
      await useApp.getState().resetLocalToSeed();
      void act.reset();
      setReport({ key: Date.now(), mode: "local", ok: true, triggered: "Reset simulation", previous: "Current local state", response: "Seed snapshot restored on this device", assignments: [], unresolved: [], reasons: [] });
    }
    setBusy(false);
  }

  const form = (title: string, fields: ReactNode, onSubmit: (fd: FormData) => void, label = "Run") => (
    <Card className="flex flex-col gap-3">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} aria-label={title}>
        <h3>{title}</h3>{fields}
        <Button type="submit" disabled={busy}>{label}</Button>
      </form>
    </Card>
  );
  const riderSel = (id: string) => <Field label="Rider" htmlFor={id}><Select id={id} name="rider" defaultValue={first}>{view.riders.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}</Select></Field>;
  const shelterSel = (id: string) => <Field label="Shelter" htmlFor={id}><Select id={id} name="shelter">{open.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>;
  const riderName = (id: string) => view.riders.find((r) => r.id === id)?.name ?? id;
  const shName = (id: string) => view.shelters.find((s) => s.id === id)?.name ?? id;

  return (
    <section className="flex flex-col gap-4" aria-label="Chaos Lab">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-mocha-600 pb-2">
        <h2>Chaos Lab</h2>
        <Status tone={serverMode ? "calm" : "warn"}>{serverMode ? "Runs on the server" : "Runs locally on this device"}</Status>
      </div>
      <p className="text-[13px] text-mocha-700">Operational controls that change live conditions. Each run reports what happened and why.</p>
      {!serverMode && <OfflineNotice>Offline: runs use the local mirror and the local engine. Results show as Local, not yet synced.</OfflineNotice>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {form("Create an expiring batch", <>
          <Field label="Donor" htmlFor="c1d"><Select id="c1d" name="donor">{view.donors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Category" htmlFor="c1c"><Select id="c1c" name="cat" defaultValue="cooked_food">{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantity" htmlFor="c1q"><Input id="c1q" name="qty" type="number" min={1} defaultValue={60} /></Field>
            <Field label="Minutes to expiry" htmlFor="c1m"><Input id="c1m" name="min" type="number" min={5} defaultValue={50} /></Field>
          </div></>, (fd) => {
          const donor = String(fd.get("donor") ?? view.donors[0].id), cat = String(fd.get("cat")), qty = Math.max(1, Number(fd.get("qty"))), min = Math.max(5, Number(fd.get("min")));
          void run(`Create an expiring batch: ${qty} units, expires in ${min} min`, ["clock", "sim"],
            () => act.createBatch({ donor_id: donor, item_name: "Surplus batch from Chaos Lab", category: cat, quantity: qty, unit: "units", pickup_start_min: 0, pickup_end_min: Math.max(1, Math.floor(min / 2)), expires_in_min: min, handling: "", storage: "", compat: "" }),
            { kind: "create_batch", donorId: donor, qty, expiresInMin: min, category: cat as never, item: "Surplus batch from Chaos Lab" });
        }, "Create batch")}

        {form("Make a rider unresponsive", riderSel("c2r"), (fd) => {
          const id = String(fd.get("rider"));
          void run(`Make ${riderName(id)} unresponsive`, ["rider", id], () => act.silent(id, true), { kind: "silent", riderId: id });
        }, "Stop heartbeats")}

        {form("Close a shelter", shelterSel("c3s"), (fd) => {
          const id = String(fd.get("shelter"));
          void run(`Close ${shName(id)}`, ["shelter", id], () => act.shelterStatus(id, "closed", "Chaos Lab: shelter closed"), { kind: "close_shelter", shelterId: id });
        }, "Close shelter")}

        {form("Fulfil a shelter's demand", shelterSel("c4s"), (fd) => {
          const id = String(fd.get("shelter"));
          void run(`Fulfil demand at ${shName(id)}`, ["shelter", id], () => act.shelterDemand(id, 0, "Chaos Lab: demand fulfilled elsewhere"), { kind: "fulfil_shelter", shelterId: id });
        }, "Set demand to zero")}

        {form("Reduce a rider's capacity", <>{riderSel("c5r")}<Field label="New capacity" htmlFor="c5c"><Input id="c5c" name="cap" type="number" min={0} defaultValue={10} /></Field></>, (fd) => {
          const id = String(fd.get("rider")), cap = Math.max(0, Number(fd.get("cap")));
          void run(`Reduce ${riderName(id)} capacity to ${cap}`, ["rider", id], () => act.riderCapacity(id, cap, "Chaos Lab: capacity reduced"), { kind: "reduce_capacity", riderId: id, capacity: cap });
        }, "Reduce capacity")}

        {form("Report a traffic delay", <>{riderSel("c6r")}<Field label="Minutes added" htmlFor="c6m"><Input id="c6m" name="min" type="number" min={1} max={240} defaultValue={30} /></Field></>, (fd) => {
          const id = String(fd.get("rider")), min = Math.min(240, Math.max(1, Number(fd.get("min"))));
          void run(`Traffic delay of ${min} min for ${riderName(id)}`, ["rider", id], () => act.delay(id, min), { kind: "delay", riderId: id, minutes: min });
        }, "Add delay")}

        {form("Remove clean water from a shelter", shelterSel("c7s"), (fd) => {
          const id = String(fd.get("shelter"));
          const sh = view.shelters.find((s) => s.id === id)!;
          void run(`Remove clean water at ${sh.name}`, ["shelter", id], () => act.shelterResources(id, false, sh.has_cooking_fuel, sh.has_cold_storage, sh.accepted_categories, "Chaos Lab: clean water removed"), { kind: "remove_water", shelterId: id });
        }, "Remove water")}

        {form("Advance simulated time", <Field label="Minutes" htmlFor="c8m"><Select id="c8m" name="min" defaultValue="5">{[2, 5, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>, (fd) => {
          const min = Number(fd.get("min"));
          void run(`Advance the clock by ${min} min`, ["clock", "sim"], () => act.advance(min), { kind: "advance", minutes: min });
        }, "Advance clock")}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="danger" disabled={busy} onClick={reset}>Reset simulation</Button>
        <span className="text-[13px] text-mocha-700">Restores the seeded state{serverMode ? " through the database" : " from the snapshot saved on this device"}.</span>
      </div>

      {report && (
        <Card key={report.key} className="fade flex flex-col gap-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <h3>Result</h3>
            <Status tone={report.mode === "local" ? "warn" : report.ok ? "calm" : "critical"}>{report.mode === "local" ? "Local, not yet synced" : report.ok ? "Confirmed by server" : "Rejected"}</Status>
          </div>
          <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-[13px]">
            <li><span className="font-semibold">Event triggered. </span>{report.triggered}</li>
            <li><span className="font-semibold">Previous state. </span>{report.previous}</li>
            <li><span className="font-semibold">System response. </span>{report.response}</li>
            <li><span className="font-semibold">Updated assignments. </span>{report.assignments.length ? <ul className="m-0 list-disc pl-5">{report.assignments.map((a) => <li key={a}>{a}</li>)}</ul> : "No assignment changed."}</li>
            <li><span className="font-semibold">Unresolved quantity. </span>{report.unresolved.length ? <ul className="m-0 list-disc pl-5">{report.unresolved.map((a) => <li key={a}>{a}</li>)}</ul> : "None."}</li>
            <li><span className="font-semibold">Reasons behind each decision. </span>{report.reasons.length ? <ul className="m-0 list-disc pl-5">{report.reasons.map((a, i) => <li key={i}>{a}</li>)}</ul> : "No decisions were needed."}</li>
          </ol>
          {report.mode === "local" && <Notice tone="warn">This result exists only on this device. It becomes real when the outbox is confirmed by the server.</Notice>}
        </Card>
      )}
    </section>
  );
}
