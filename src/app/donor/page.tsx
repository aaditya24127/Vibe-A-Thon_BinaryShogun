"use client";
import { useState, type FormEvent } from "react";
import { useApp } from "@/lib/data/store";
import { act } from "@/lib/actions";
import { batchForm } from "@/lib/data/schemas";
import { CATEGORY_LABEL } from "@/lib/engine/labels";
import { formatMinutes } from "@/lib/engine/time";
import { Button, Field, Input, Notice, Section, Select, Table, Textarea } from "@/components/ui";
import { Empty, Pick, Screen, StateBadge, hhmm } from "@/components/shared";
import { SimStatusCard } from "@/components/SimPanel";

const CATEGORIES = Object.keys(CATEGORY_LABEL);

export default function DonorPage() {
  const donorId = useApp((s) => s.identity.donorId);
  const setIdentity = useApp((s) => s.setIdentity);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "calm" | "warn" | "critical"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      {(view, now) => {
        const mine = view.batches.filter((b) => b.donor_id === donorId).sort((a, b) => b.created_at.localeCompare(a.created_at));
        async function submit(e: FormEvent<HTMLFormElement>) {
          e.preventDefault();
          const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
          const parsed = batchForm.safeParse({ ...raw, donor_id: donorId ?? "" });
          if (!parsed.success) {
            const errs: Record<string, string> = {};
            for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
            setErrors(errs); setResult(null);
            return;
          }
          setErrors({}); setBusy(true);
          const rec = await act.createBatch(parsed.data);
          setBusy(false);
          if (rec.status === "confirmed") setResult({ tone: "calm", text: `Batch ${String(rec.result?.batch_id ?? "")} posted. It is now visible to allocation.` });
          else if (rec.status === "rejected") setResult({ tone: "critical", text: `Not posted. ${rec.reason ?? "The server refused this batch."}` });
          else setResult({ tone: "warn", text: "Saved on this device, will sync. The batch is not posted until the server confirms it." });
          if (rec.status === "confirmed") (e.target as HTMLFormElement).reset?.();
        }
        return (
          <>
            <SimStatusCard perspective="donor" />
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
              <div className="flex flex-col gap-3">
                <Pick label="Donor" items={view.donors} value={donorId} onChange={(id) => setIdentity({ role: "donor", donorId: id })} />
                <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Post a batch">
                  <Field label="Item name" htmlFor="item_name" error={errors.item_name}><Input id="item_name" name="item_name" placeholder="Vegetable pulao trays" /></Field>
                  <Field label="Category" htmlFor="category" error={errors.category}>
                    <Select id="category" name="category" defaultValue="cooked_food">{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantity" htmlFor="quantity" error={errors.quantity}><Input id="quantity" name="quantity" type="number" min={1} inputMode="numeric" /></Field>
                    <Field label="Unit" htmlFor="unit" error={errors.unit}><Input id="unit" name="unit" defaultValue="meals" /></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Pickup opens in (min)" htmlFor="pickup_start_min" error={errors.pickup_start_min}><Input id="pickup_start_min" name="pickup_start_min" type="number" min={0} defaultValue={0} /></Field>
                    <Field label="Pickup closes in (min)" htmlFor="pickup_end_min" error={errors.pickup_end_min}><Input id="pickup_end_min" name="pickup_end_min" type="number" min={1} defaultValue={45} /></Field>
                    <Field label="Safe to use for (min)" htmlFor="expires_in_min" error={errors.expires_in_min}><Input id="expires_in_min" name="expires_in_min" type="number" min={1} defaultValue={120} /></Field>
                  </div>
                  <Field label="Handling requirements" htmlFor="handling" error={errors.handling}><Textarea id="handling" name="handling" rows={2} /></Field>
                  <Field label="Storage requirements" htmlFor="storage" error={errors.storage}><Input id="storage" name="storage" /></Field>
                  <Field label="Compatibility requirements" htmlFor="compat" hint="For example: needs clean water on site" error={errors.compat}><Input id="compat" name="compat" /></Field>
                  <Button type="submit" variant="primary" disabled={busy || !donorId}>{busy ? "Posting" : "Post batch"}</Button>
                  {!donorId && <p className="text-[13px] text-mocha-700">Choose the donor first.</p>}
                  {result && <Notice tone={result.tone}>{result.text}</Notice>}
                </form>
              </div>
              <Section title="Your batches" aside={mine.length ? `${mine.length} total` : undefined}>
                {!mine.length ? <Empty>No batches posted for this donor yet.</Empty> : (
                  <Table head={["Batch", "Item", "Quantity", "Status", "Delivery", "Time left"]}>
                    {mine.map((b) => (
                      <tr key={b.id}>
                        <td className="font-semibold">{b.id}</td>
                        <td>{b.item_name}<div className="text-mocha-700">{CATEGORY_LABEL[b.category]}</div></td>
                        <td>{b.quantity} {b.unit}<div className="text-mocha-700">{b.remaining_qty} unallocated</div></td>
                        <td><StateBadge state={b.status} /></td>
                        <td>{(() => {
                          const al = view.allocations.filter((a) => a.batch_id === b.id && !["RELEASED", "CANCELLED"].includes(a.status));
                          if (!al.length) return <span className="text-mocha-700">Awaiting allocation. Pickup closes {hhmm(b.pickup_window_end)}</span>;
                          return al.map((a) => { const l = view.leases.find((x) => x.allocation_id === a.id); const r = view.riders.find((x) => x.id === l?.rider_id); const s = view.shelters.find((x) => x.id === a.shelter_id); return <div key={a.id}>{a.quantity} to {s?.name} with {r?.name ?? "no rider"}: {a.status.replace(/_/g, " ").toLowerCase()}</div>; });
                        })()}</td>
                        <td>{["EXPIRED", "DELIVERED", "CANCELLED"].includes(b.status) ? "None" : formatMinutes((Date.parse(b.expires_at) - now) / 60000)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Section>
            </div>
          </>
        );
      }}
    </Screen>
  );
}
