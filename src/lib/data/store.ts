"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import { getSupabase, isSupabaseConfigured } from "../supabase";
import type { RpcResult, Snapshot } from "../types";
import { buildSeedSnapshot } from "../seedSnapshot";
import { fetchSnapshot } from "./fetch";
import { notify } from "../toast";
import { loadLocal, loadMirror, loadOutbox, loadSeed, saveLocal, saveMirror, saveOutbox, saveSeed, type OutboxRecord } from "./mirror";

export type Role = "donor" | "rider" | "shelter" | "operations" | null;
export type Connection = "connecting" | "connected" | "unreachable" | "not_configured";

// Heartbeat, sweep and movement ticks use callRpc directly: they describe the present moment and are never queued.

interface Identity { role: Role; riderId: string | null; donorId: string | null; shelterId: string | null }

interface AppState {
  identity: Identity;
  setIdentity: (p: Partial<Identity>) => void;

  ready: boolean;
  snapshot: Snapshot | null;
  /** Local-only overlay produced by offline Chaos Lab runs. Cleared once the outbox is confirmed. */
  local: Snapshot | null;
  syncedAt: Record<string, string> | null;
  connection: Connection;
  online: boolean;
  outbox: OutboxRecord[];
  hbLastSentAt: number | null;
  hbNotSentAt: number | null;
  lastSweepClientAt: number | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setOnline: (v: boolean) => void;
  setLocal: (s: Snapshot | null) => void;
  resetLocalToSeed: () => Promise<Snapshot>;
  dispatch: (type: string, payload: Record<string, unknown>, label: string) => Promise<OutboxRecord>;
  flushOutbox: () => Promise<void>;
  callRpc: (type: string, payload: Record<string, unknown>, actionId?: string) => Promise<RpcResult | null>;
  noteHeartbeat: (sent: boolean) => void;
}

let flushing = false;

const isNetworkError = (e: { code?: string; message?: string } | null) =>
  !!e && !e.code && /fetch|network|load failed|timeout|abort/i.test(e.message ?? "");

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      identity: { role: null, riderId: null, donorId: null, shelterId: null },
      setIdentity: (p) => set((s) => ({ identity: { ...s.identity, ...p } })),

      ready: false,
      snapshot: null,
      local: null,
      syncedAt: null,
      connection: isSupabaseConfigured ? "connecting" : "not_configured",
      online: true,
      outbox: [],
      hbLastSentAt: null,
      hbNotSentAt: null,
      lastSweepClientAt: null,

      async init() {
        if (get().ready) return;
        set({ online: typeof navigator === "undefined" ? true : navigator.onLine });
        const [mirror, seed, outbox, local] = await Promise.all([loadMirror(), loadSeed(), loadOutbox(), loadLocal()]);
        let baseline = seed;
        if (!baseline) { baseline = buildSeedSnapshot(); await saveSeed(baseline); }
        set({ snapshot: mirror?.snapshot ?? baseline, syncedAt: mirror?.syncedAt ?? null, outbox, local: local ?? null, ready: true });
        await get().refresh();
        await get().flushOutbox();
      },

      async refresh() {
        const sb = getSupabase();
        if (!sb) { set({ connection: "not_configured" }); return; }
        if (!get().online) return;
        try {
          const snap = await fetchSnapshot(sb);
          const at = new Date().toISOString();
          const syncedAt = Object.fromEntries(
            ["donors", "shelters", "riders", "batches", "allocations", "leases", "compatibility_rules", "events", "incidents", "unresolved", "settings"].map((t) => [t, at]),
          );
          set({ snapshot: snap, connection: "connected", syncedAt });
          void saveMirror({ snapshot: snap, syncedAt });
          const pending = get().outbox.some((o) => o.status === "local" || o.status === "sent");
          if (get().local && !pending) { set({ local: null }); void saveLocal(null); }
        } catch {
          set({ connection: "unreachable" });
        }
      },

      setOnline(v) {
        set({ online: v });
        if (v) void get().refresh().then(() => get().flushOutbox());
      },

      setLocal(s) { set({ local: s }); void saveLocal(s); },

      async resetLocalToSeed() {
        // The seed snapshot saved at first load is the reset target; relative times are re-based on now.
        const rebased = buildSeedSnapshot(Date.now());
        set({ local: rebased });
        void saveLocal(rebased);
        return rebased;
      },

      async callRpc(type, payload, actionId) {
        const sb = getSupabase();
        if (!sb || !get().online) return null;
        const { data, error } = await sb.rpc(type, { p_action_id: actionId ?? nanoid(), ...payload });
        if (error) return isNetworkError(error) ? null : ({ success: false, reason: error.message } as RpcResult);
        return data as RpcResult;
      },

      async dispatch(type, payload, label) {
        const rec: OutboxRecord = { action_id: nanoid(), type, payload, created_at: new Date().toISOString(), attempts: 0, status: "local", label };
        if (!isSupabaseConfigured) {
          notify("error", `${label} not sent`, "Supabase is not configured for this deployment.");
          return { ...rec, status: "rejected", reason: "Supabase is not configured for this deployment, so nothing can be saved to the server." };
        }
        // Safety-critical actions go to the outbox first; the server confirms or rejects them.
        const outbox = [...get().outbox, rec];
        set({ outbox });
        await saveOutbox(outbox);
        if (get().online) await get().flushOutbox();
        else notify("info", `${label} saved on this device`, "It will be sent in order when the connection returns. Not confirmed yet.");
        return get().outbox.find((o) => o.action_id === rec.action_id) ?? rec;
      },

      async flushOutbox() {
        const sb = getSupabase();
        if (!sb || flushing || !get().online) return;
        flushing = true;
        try {
          const update = async (id: string, patch: Partial<OutboxRecord>) => {
            const outbox = get().outbox.map((o) => (o.action_id === id ? { ...o, ...patch } : o));
            set({ outbox });
            await saveOutbox(outbox);
          };
          for (const rec of get().outbox.filter((o) => o.status === "local" || o.status === "sent")) {
            await update(rec.action_id, { status: "sent", attempts: rec.attempts + 1 });
            const { data, error } = await sb.rpc(rec.type, { p_action_id: rec.action_id, ...rec.payload });
            if (error && isNetworkError(error)) { await update(rec.action_id, { status: "local" }); break; }
            if (error) { await update(rec.action_id, { status: "rejected", reason: error.message }); notify("error", `${rec.label} failed`, error.message); continue; }
            const res = data as RpcResult;
            await update(rec.action_id, res.success
              ? { status: "confirmed", result: res as Record<string, unknown>, reason: res.reason }
              : { status: "rejected", reason: res.reason, result: res as Record<string, unknown> });
            if (res.success) notify("success", rec.label, res.reason);
            else notify("error", `${rec.label} was rejected`, res.reason);
          }
          const keep = get().outbox.filter((o) => o.status === "local" || o.status === "sent" || o.status === "rejected").concat(
            get().outbox.filter((o) => o.status === "confirmed").slice(-30),
          ).sort((a, b) => a.created_at.localeCompare(b.created_at));
          set({ outbox: keep });
          await saveOutbox(keep);
        } finally {
          flushing = false;
        }
        await get().refresh();
      },

      noteHeartbeat(sent) {
        if (sent) set({ hbLastSentAt: Date.now() });
        else set({ hbNotSentAt: Date.now() });
      },
    }),
    { name: "weconnect-identity", partialize: (s) => ({ identity: s.identity }), skipHydration: true },
  ),
);

/** The snapshot every screen reads: the local overlay while it exists, otherwise the last server state. */
export const selectView = (s: AppState): Snapshot | null => s.local ?? s.snapshot;
