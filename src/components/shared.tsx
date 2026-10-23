"use client";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useApp } from "@/lib/data/store";
import type { OutboxRecord } from "@/lib/data/mirror";
import { useMounted, useNow, useView } from "@/lib/data/hooks";
import { FEASIBILITY_LABEL, FEASIBILITY_TONE, STATE_LABEL, STATE_TONE, SYNC_LABEL } from "@/lib/engine/labels";
import type { Feasibility, LifecycleState, Snapshot } from "@/lib/types";
import { Empty, Status } from "./ui";

export const hhmm = (ms: number | string | null) => (ms == null ? "unknown" : format(new Date(ms), "HH:mm"));
export const hhmmss = (ms: number | string | null) => (ms == null ? "unknown" : format(new Date(ms), "HH:mm:ss"));

export function StateBadge({ state }: { state: LifecycleState }) { return <Status tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Status>; }
export function FeasBadge({ f }: { f: Feasibility }) { return <Status tone={FEASIBILITY_TONE[f]}>{FEASIBILITY_LABEL[f]}</Status>; }

export function SyncBadge({ rec }: { rec: OutboxRecord }) {
  if (rec.status === "rejected") return <Status tone="critical">{`${SYNC_LABEL.rejected}: ${rec.reason ?? "refused by the server"}`}</Status>;
  if (rec.status === "confirmed") return <Status tone="calm">Confirmed by server</Status>;
  if (rec.status === "sent") return <Status tone="active">{SYNC_LABEL.sent}</Status>;
  return <Status tone="warn">{SYNC_LABEL.local}</Status>;
}

/** Waits for the client to mount and the first snapshot to load before rendering children. */
export function Screen({ children }: { children: (s: Snapshot, now: number) => ReactNode }) {
  const mounted = useMounted();
  const view = useView();
  const ready = useApp((s) => s.ready);
  const now = useNow();
  if (!mounted || !ready || !view) return <p className="text-mocha-700">Loading</p>;
  return <>{children(view, now)}</>;
}

export function PendingActions({ filter, title = "Actions on this device" }: { filter?: (o: OutboxRecord) => boolean; title?: string }) {
  const outbox = useApp((s) => s.outbox);
  const list = outbox.filter(filter ?? (() => true)).slice(-6).reverse();
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3>{title}</h3>
      <ul className="flex flex-col gap-2">
        {list.map((o) => (
          <li key={o.action_id} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span>{o.label}</span>
            <SyncBadge rec={o} />
            {o.status === "confirmed" && o.reason && <span className="text-mocha-700">{o.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OfflineNotice({ children }: { children?: ReactNode }) {
  const online = useApp((s) => s.online);
  if (online) return null;
  return (
    <div role="status" className="rounded-[6px] border border-dashed border-cherry px-3 py-2 text-[13px] text-cherry">
      {children ?? "Other devices' updates and server sweeps are paused while offline."}
    </div>
  );
}

export function Pick<T extends { id: string; name: string }>({ label, items, value, onChange }: { label: string; items: T[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1 sm:max-w-xs">
      <label htmlFor="pick" className="text-[13px] font-semibold">{label}</label>
      <select id="pick" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[6px] border border-mocha-600 bg-latte px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-cherry">
        <option value="" disabled>Choose</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
    </div>
  );
}

export function PageHead({ title, primary, children }: { title: string; primary?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1"><h1>{title}</h1>{children}</div>
      {primary}
    </div>
  );
}

export { Empty };
