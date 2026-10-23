"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "../supabase";
import { REALTIME_TABLES } from "./fetch";
import { selectView, useApp } from "./store";
import { nowMs } from "../engine/time";
import { freezeHeartbeats } from "../engine/state";

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** The snapshot screens read. Offline, rider connectivity is held as of the last sync (see freezeHeartbeats). */
export function useView() {
  const view = useApp(selectView);
  const frozen = useApp((s) => !s.online || s.connection === "not_configured" || s.connection === "unreachable");
  const [bucketN, setBucket] = useState(0);
  useEffect(() => {
    if (!frozen) return;
    const id = setInterval(() => setBucket((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [frozen]);
  return useMemo(() => (view && frozen ? freezeHeartbeats(view) : view), [view, frozen, bucketN]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Simulated server time, advanced by the device clock only between server reads. Re-renders every second. */
export function useNow(intervalMs = 1000) {
  const view = useView();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return view ? nowMs(view) : Date.now();
}

const bucket = (ms: number) => Math.floor(Date.now() / ms);

/** Starts the mirror, realtime subscriptions, the 30 s sweep, the movement tick and the online/offline listeners. */
export function DataProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useApp.persist.rehydrate();
    void useApp.getState().init();

    const on = () => useApp.getState().setOnline(true);
    const off = () => useApp.getState().setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    const sb = getSupabase();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; void useApp.getState().refresh(); }, 400);
    };
    const channel = sb ? sb.channel("weconnect-live") : null;
    if (channel) {
      for (const t of REALTIME_TABLES) channel.on("postgres_changes", { event: "*", schema: "public", table: t }, scheduleRefresh);
      channel.subscribe();
    }

    // Backup poll in case a realtime message is missed.
    const poll = setInterval(() => void useApp.getState().refresh(), 15_000);
    // Every connected client sweeps. The action id is bucketed so concurrent clients collapse into one run.
    const sweep = setInterval(async () => {
      const s = useApp.getState();
      if (!s.online || s.connection !== "connected") return;
      await s.callRpc("sweep_leases", {}, `sweep-${bucket(30_000)}`);
      useApp.setState({ lastSweepClientAt: Date.now() });
      void s.refresh();
    }, 30_000);
    // Simulated rider movement is written through the database so every client sees the same positions.
    const tick = setInterval(async () => {
      const s = useApp.getState();
      if (!s.online || s.connection !== "connected") return;
      await s.callRpc("simulate_tick", { p_seconds: 5 }, `tick-${bucket(5_000)}`);
    }, 5_000);

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(poll); clearInterval(sweep); clearInterval(tick);
      if (channel && sb) void sb.removeChannel(channel);
    };
  }, []);
  return <>{children}</>;
}
