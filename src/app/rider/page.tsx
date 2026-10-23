"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "@/lib/data/store";
import { act, sendHeartbeat } from "@/lib/actions";
import { incidentForm } from "@/lib/data/schemas";
import { optionsForRider } from "@/lib/engine/allocate";
import { INCIDENT_LABEL, STATE_LABEL, SYNC_LABEL } from "@/lib/engine/labels";
import { ACTIVE_STATES } from "@/lib/engine/state";
import { formatMinutes } from "@/lib/engine/time";
import { Button, Card, Field, Input, Notice, Section, Select, Status } from "@/components/ui";
import { Empty, FeasBadge, OfflineNotice, PageHead, PendingActions, Pick, Screen, StateBadge, hhmm, hhmmss } from "@/components/shared";
import { LeaseActions } from "@/components/LeaseActions";
import { MapView } from "@/components/MapView";

function Heartbeat({ riderId }: { riderId: string }) {
  const { hbLastSentAt, hbNotSentAt, online } = useApp();
  useEffect(() => {
    void sendHeartbeat(riderId);
    const id = setInterval(() => void sendHeartbeat(riderId), 30_000);
    return () => clearInterval(id);
  }, [riderId]);
  return (
    <Card className="flex flex-col gap-1">
      <h3>Heartbeat</h3>
      {online ? (
        <p className="text-[15px]">{hbLastSentAt ? `Last heartbeat sent ${hhmmss(hbLastSentAt)}` : "Sending the first heartbeat"}. Sent every 30 seconds.</p>
      ) : (
        <p className="text-[15px] text-cherry">Last heartbeat not sent{hbNotSentAt ? ` (${hhmmss(hbNotSentAt)})` : ""}.</p>
      )}
      {!online && <p className="text-[13px] text-mocha-700">Heartbeats are not queued while offline. If one is overdue, the server releases an uncollected lease at its next sweep, and marks a collected one as uncertain custody.</p>}
    </Card>
  );
}

export default function RiderPage() {
  const riderId = useApp((s) => s.identity.riderId);
  const setIdentity = useApp((s) => s.setIdentity);
  const [tab, setTab] = useState<"list" | "map">("list");
  const [claimMsg, setClaimMsg] = useState<Record<string, { tone: "calm" | "warn" | "critical"; text: string }>>({});
  const [incMsg, setIncMsg] = useState<string | null>(null);
  const [incErr, setIncErr] = useState<string | undefined>();
  const outbox = useApp((s) => s.outbox);

  return (
    <Screen>
      {(view, now) => {
        const rider = view.riders.find((r) => r.id === riderId);
        const options = rider ? optionsForRider({ ...view, now }, rider.id) : [];
        const mine = rider ? view.leases.filter((l) => l.rider_id === rider.id && ACTIVE_STATES.includes(l.status)) : [];
        const incidents = rider ? view.incidents.filter((i) => i.rider_id === rider.id).slice(-5).reverse() : [];
        const localIncidents = outbox.filter((o) => o.type === "add_incident" && o.payload.p_rider_id === riderId && o.status !== "confirmed");

        async function claim(batchId: string, shelterId: string, qty: number) {
          const rec = await act.claim(batchId, shelterId, rider!.id, qty);
          const key = `${batchId}`;
          setClaimMsg((m) => ({
            ...m,
            [key]: rec.status === "confirmed" ? { tone: "calm", text: "Claimed. Go to the pickup." }
              : rec.status === "rejected" ? { tone: "critical", text: `Rejected: ${rec.reason}` }
              : { tone: "warn", text: `${SYNC_LABEL.local}. Not reserved until the server confirms.` },
          }));
        }
        function reportIncident(e: FormEvent<HTMLFormElement>) {
          e.preventDefault();
          const p = incidentForm.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
          if (!p.success) { setIncErr(p.error.issues[0].message); return; }
          setIncErr(undefined);
          void act.incident(rider!.id, p.data.type, mine[0]?.id ?? null, p.data.note, p.data.type === "delay" ? p.data.minutes : 0).then((rec) =>
            setIncMsg(rec.status === "confirmed" ? "Received by the server." : rec.status === "rejected" ? `Rejected: ${rec.reason}` : SYNC_LABEL.local));
        }

        return (
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            <PageHead title="Rider" />
            <Pick label="Rider" items={view.riders} value={riderId} onChange={(id) => setIdentity({ role: "rider", riderId: id })} />
            {!rider ? <Empty>Choose a rider to see batches you can reach.</Empty> : (
              <>
                <OfflineNotice>Offline. Actions are saved on this device and sent when the connection returns.</OfflineNotice>
                <Heartbeat riderId={rider.id} />
                <div role="tablist" aria-label="Rider views" className="flex gap-2">
                  {(["list", "map"] as const).map((t) => (
                    <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>{t === "list" ? "Batches and leases" : "Map"}</Button>
                  ))}
                </div>

                {tab === "map" ? <MapView view={view} now={now} initialRider={rider.id} height={340} /> : (
                  <>
                    <Section title="Your active leases" aside={`${mine.length} of ${view.settings.max_active_leases}`}>
                      {!mine.length ? <Empty>No active lease. Claim a batch below.</Empty> : mine.map((l) => {
                        const a = view.allocations.find((x) => x.id === l.allocation_id)!;
                        const b = view.batches.find((x) => x.id === a.batch_id)!;
                        const d = view.donors.find((x) => x.id === b.donor_id)!;
                        const s = view.shelters.find((x) => x.id === a.shelter_id)!;
                        return (
                          <Card key={l.id} className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2"><StateBadge state={l.status} /><FeasBadge f={a.feasibility} /></div>
                            <div>
                              <h2>{b.item_name}: {l.quantity} {b.unit}</h2>
                              <p className="text-[13px] text-mocha-700">Pick up at {d.name}, {d.area_name}. Deliver to {s.name}, {s.area_name}.</p>
                            </div>
                            <p className="text-[13px]">ETA {l.eta_at ? hhmm(l.eta_at) : "not set"}. Expires in {formatMinutes((Date.parse(b.expires_at) - now) / 60000)}.</p>
                            {a.blocking_reason && <Notice tone="warn">{a.blocking_reason}</Notice>}
                            <LeaseActions lease={l} />
                          </Card>
                        );
                      })}
                    </Section>

                    <Section title="Batches you can reach" aside="Least safe time first">
                      {!options.length ? <Empty>Nothing reachable right now. Capacity is full, or every batch is already taken or out of range.</Empty> : options.map((o) => (
                        <Card key={o.batch.id} className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <h2>{o.batch.item_name}</h2>
                            <FeasBadge f={o.feasibility} />
                          </div>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                            <div><dt className="text-mocha-700">Quantity you can carry</dt><dd>{o.quantity} of {o.batch.remaining_qty} {o.batch.unit}</dd></div>
                            <div><dt className="text-mocha-700">Pickup area</dt><dd>{o.donor.area_name}</dd></div>
                            <div><dt className="text-mocha-700">Destination</dt><dd>{o.shelter.name}</dd></div>
                            <div><dt className="text-mocha-700">Pickup must happen within</dt><dd>{formatMinutes(o.remainingSafeMin)}</dd></div>
                            <div><dt className="text-mocha-700">Your ETA</dt><dd>{hhmm(o.etaMs)} ({Math.round(o.slackMin)} min to spare)</dd></div>
                            <div><dt className="text-mocha-700">Batch status</dt><dd>{STATE_LABEL[o.batch.status]}</dd></div>
                          </dl>
                          {o.flag && <Notice tone="warn">{o.flag}</Notice>}
                          <Button variant="primary" onClick={() => claim(o.batch.id, o.shelter.id, o.quantity)}>Claim {o.quantity} {o.batch.unit}</Button>
                          {claimMsg[o.batch.id] && <Notice tone={claimMsg[o.batch.id].tone}>{claimMsg[o.batch.id].text}</Notice>}
                        </Card>
                      ))}
                    </Section>

                    <Section title="Report an incident">
                      <form onSubmit={reportIncident} className="flex flex-col gap-3" aria-label="Report an incident">
                        <Field label="Type" htmlFor="inc-type"><Select id="inc-type" name="type" defaultValue="delay">{Object.entries(INCIDENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                        <Field label="Minutes lost (delay only)" htmlFor="inc-min" error={incErr}><Input id="inc-min" name="minutes" type="number" min={0} max={240} defaultValue={0} /></Field>
                        <Field label="Note" htmlFor="inc-note"><Input id="inc-note" name="note" /></Field>
                        <Button type="submit">Send report</Button>
                        {incMsg && <Notice tone="warn">{incMsg}</Notice>}
                      </form>
                      {(localIncidents.length > 0 || incidents.length > 0) && (
                        <ul className="flex flex-col gap-1 text-[13px]">
                          {localIncidents.map((o) => (
                            <li key={o.action_id}>{o.label}: <Status tone="warn">{o.status === "sent" ? "pending" : "saved_locally"}</Status></li>
                          ))}
                          {incidents.map((i) => <li key={i.id}>{INCIDENT_LABEL[i.type]}: <Status tone={i.sync_status === "processed" ? "calm" : "active"}>{i.sync_status}</Status> {i.note}</li>)}
                        </ul>
                      )}
                    </Section>
                    <PendingActions filter={(o) => ["claim_lease", "confirm_pickup", "mark_in_transit", "confirm_delivery"].includes(o.type)} />
                  </>
                )}
              </>
            )}
          </div>
        );
      }}
    </Screen>
  );
}
