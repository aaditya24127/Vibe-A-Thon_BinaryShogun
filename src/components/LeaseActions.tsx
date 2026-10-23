"use client";
import { useState } from "react";
import { act } from "@/lib/actions";
import type { OutboxRecord } from "@/lib/data/mirror";
import { deliveryForm } from "@/lib/data/schemas";
import type { Lease } from "@/lib/types";
import { Button, Field, Input, Notice } from "./ui";

function say(rec: OutboxRecord, ok: string) {
  if (rec.status === "confirmed") return { tone: "calm" as const, text: ok };
  if (rec.status === "rejected") return { tone: "critical" as const, text: `Rejected: ${rec.reason ?? "refused by the server"}` };
  return { tone: "warn" as const, text: "Saved on this device, will sync. Not confirmed by the server yet." };
}

/** The lifecycle buttons for one lease. Each calls a database function; nothing is shown as done until the server says so. */
export function LeaseActions({ lease, dispatcher = false }: { lease: Lease; dispatcher?: boolean }) {
  const [msg, setMsg] = useState<{ tone: "calm" | "warn" | "critical"; text: string } | null>(null);
  const [err, setErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<OutboxRecord>, ok: string) {
    setBusy(true);
    const rec = await fn();
    setBusy(false);
    setMsg(say(rec, ok));
  }

  return (
    <div className="flex flex-col gap-2">
      {lease.status === "RESERVED" && <Button variant="primary" disabled={busy} onClick={() => run(() => act.pickup(lease.id), "Pickup confirmed")}>Confirm pickup</Button>}
      {lease.status === "PICKUP_CONFIRMED" && <Button variant="primary" disabled={busy} onClick={() => run(() => act.inTransit(lease.id), "Marked in transit")}>Mark in transit</Button>}
      {lease.status === "IN_TRANSIT" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const p = deliveryForm.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
            if (!p.success) { setErr(p.error.issues[0].message); return; }
            setErr(undefined);
            void run(() => act.deliver(lease.id, p.data.received), "Delivery confirmed by the server");
          }}
        >
          <Field label={`Quantity received (leased ${lease.quantity})`} htmlFor={`recv-${lease.id}`} error={err} hint="Count what the shelter actually received.">
            <Input id={`recv-${lease.id}`} name="received" type="number" min={1} max={lease.quantity} inputMode="numeric" />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>Confirm delivery</Button>
        </form>
      )}
      {lease.status === "CUSTODY_UNCERTAIN" && (dispatcher ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => run(() => act.resolveCustody(lease.id, "resume", "Confirmed by phone"), "Custody confirmed; delivery resumes")}>Cargo confirmed with rider</Button>
          <Button variant="danger" disabled={busy} onClick={() => run(() => act.resolveCustody(lease.id, "write_off", "Rider unreachable"), "Cargo written off")}>Write off cargo</Button>
        </div>
      ) : <p className="text-[13px] text-cherry">Custody is uncertain. Wait for the dispatcher to decide.</p>)}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
