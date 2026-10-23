"use client";
import { create } from "zustand";
import { haversineKm } from "./engine/geo";
import type { Snapshot } from "./types";

/**
 * Isolated simulation layer. It never calls the database and never touches real riders, batches or shelters.
 * Everything it produces is labelled SIMULATION wherever it is shown.
 */
export type Stage = "ready" | "assigned" | "to_pickup" | "pickup" | "in_transit" | "arriving" | "delivered" | "receipt";
export type Scenario = "normal" | "delayed" | "reroute" | "failed_pickup";

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "ready", label: "Ready for allocation", hint: "Donation exists and awaits action" },
  { id: "assigned", label: "Assigned", hint: "A rider is linked to the batch" },
  { id: "to_pickup", label: "Travelling to pickup", hint: "Rider moves towards the donor" },
  { id: "pickup", label: "Pickup confirmed", hint: "Batch marked picked up" },
  { id: "in_transit", label: "In transit", hint: "Rider moves towards the shelter" },
  { id: "arriving", label: "Arriving", hint: "ETA is running down" },
  { id: "delivered", label: "Delivered", hint: "Rider arrived, delivery completed" },
  { id: "receipt", label: "Shelter receipt", hint: "Shelter incoming view reflects receipt" },
];
export const SCENARIOS: Record<Scenario, string> = {
  normal: "Normal delivery",
  delayed: "Delayed rider",
  reroute: "Route disruption and reroute",
  failed_pickup: "Failed pickup, then reassignment",
};

export type LatLng = [number, number];
export interface SimEvent { id: number; at: number; stage: Stage; title: string; detail: string }
interface Place { id: string; name: string; lat: number; lng: number }

/** Base duration in ms at 1x for each stage. Movement stages are measured across the whole leg. */
const DUR: Record<Stage, number> = { ready: 2000, assigned: 2000, to_pickup: 12000, pickup: 2000, in_transit: 24000, arriving: 0, delivered: 1500, receipt: 0 };

export function polyLength(poly: LatLng[]) {
  let d = 0;
  for (let i = 1; i < poly.length; i++) d += haversineKm({ lat: poly[i - 1][0], lng: poly[i - 1][1] }, { lat: poly[i][0], lng: poly[i][1] });
  return d;
}

/** Point at a fraction of the polyline's length, interpolated along its segments. */
export function pointAt(poly: LatLng[], frac: number): LatLng {
  if (poly.length === 1) return poly[0];
  const total = polyLength(poly);
  let target = Math.min(1, Math.max(0, frac)) * total;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i];
    const seg = haversineKm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
    if (target <= seg || i === poly.length - 1) {
      const f = seg === 0 ? 0 : Math.min(1, target / seg);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= seg;
  }
  return poly[poly.length - 1];
}

export function splitPoly(poly: LatLng[], frac: number): { done: LatLng[]; rest: LatLng[] } {
  const total = polyLength(poly);
  let target = frac * total;
  const done: LatLng[] = [poly[0]];
  for (let i = 1; i < poly.length; i++) {
    const seg = polyLength([poly[i - 1], poly[i]]);
    if (target >= seg) { done.push(poly[i]); target -= seg; }
    else {
      const p = pointAt(poly, frac);
      return { done: [...done, p], rest: [p, ...poly.slice(i)] };
    }
  }
  return { done, rest: [poly[poly.length - 1]] };
}

async function route(a: LatLng, b: LatLng): Promise<{ poly: LatLng[]; source: "osrm" | "straight" }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`, { signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    const coords: [number, number][] | undefined = j?.routes?.[0]?.geometry?.coordinates;
    if (coords && coords.length > 1) return { poly: coords.map(([lng, lat]) => [lat, lng] as LatLng), source: "osrm" };
  } catch { /* fall through to the honest straight-line fallback */ }
  return { poly: [a, b], source: "straight" };
}

interface SimState {
  active: boolean; running: boolean; speed: number; scenario: Scenario; stage: Stage;
  /** 0..1 within the current movement leg. */
  progress: number; stageMs: number;
  rider: string; donor: Place | null; shelter: Place | null; altShelter: Place | null;
  legPickup: LatLng[]; legDeliver: LatLng[]; pos: LatLng | null; routeSource: "osrm" | "straight";
  delayMin: number; events: SimEvent[]; flags: Record<string, boolean>; starting: boolean;
  start: (snap: Snapshot, scenario: Scenario) => Promise<void>;
  pause: () => void; resume: () => void; reset: () => void; setSpeed: (n: number) => void; step: () => void; tick: (dtMs: number) => void;
}

let eid = 0;
const first = <T,>(xs: T[]) => xs[0];
const place = (p: { id: string; name: string; lat: number; lng: number }): Place => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng });

export const useSim = create<SimState>((set, get) => {
  const log = (stage: Stage, title: string, detail: string) =>
    set((s) => ({ events: [{ id: ++eid, at: Date.now(), stage, title, detail }, ...s.events] }));

  const enter = (stage: Stage) => {
    const s = get();
    const labels: Record<Stage, [string, string]> = {
      ready: ["Batch ready for allocation", `Simulated batch SIM-001 (60 meals) posted by ${s.donor?.name}`],
      assigned: ["Rider assigned", `${s.rider} linked to SIM-001, destination ${s.shelter?.name}`],
      to_pickup: ["Travelling to pickup", `${s.rider} heads to ${s.donor?.name}`],
      pickup: ["Pickup confirmed", `${s.rider} collected SIM-001 at ${s.donor?.name}`],
      in_transit: ["In transit", `${s.rider} leaves for ${s.shelter?.name}`],
      arriving: ["Arriving", `${s.rider} is close to ${s.shelter?.name}`],
      delivered: ["Delivered", `${s.rider} reached ${s.shelter?.name}; delivery completed in the simulation`],
      receipt: ["Shelter receipt", `${s.shelter?.name} recorded receipt of 60 meals (simulation)`],
    };
    set({ stage, stageMs: 0, progress: stage === "in_transit" || stage === "to_pickup" ? 0 : get().progress });
    if (stage === "pickup" && s.legPickup.length) set({ pos: s.legPickup[s.legPickup.length - 1] });
    if (stage === "delivered" && s.legDeliver.length) set({ pos: s.legDeliver[s.legDeliver.length - 1], progress: 1 });
    log(stage, ...labels[stage]);
  };

  return {
    active: false, running: false, speed: 1, scenario: "normal", stage: "ready", progress: 0, stageMs: 0, rider: "Sim Rider A",
    donor: null, shelter: null, altShelter: null, legPickup: [], legDeliver: [], pos: null, routeSource: "straight", delayMin: 0,
    events: [], flags: {}, starting: false,

    async start(snap, scenario) {
      const donor = place(first(snap.donors));
      const sorted = [...snap.shelters].sort((a, b) => haversineKm(donor, b) - haversineKm(donor, a));
      const shelter = place(snap.shelters.find((s) => s.id === "SH-2") ?? sorted[0]);
      const alt = place(snap.shelters.find((s) => s.id === "SH-4") ?? sorted[1]);
      const startPt: LatLng = [donor.lat + 0.014, donor.lng - 0.014];
      set({ starting: true });
      const [a, b] = await Promise.all([route(startPt, [donor.lat, donor.lng]), route([donor.lat, donor.lng], [shelter.lat, shelter.lng])]);
      eid = 0;
      set({
        active: true, running: true, starting: false, scenario, donor, shelter, altShelter: alt, legPickup: a.poly, legDeliver: b.poly,
        routeSource: a.source === "osrm" && b.source === "osrm" ? "osrm" : "straight", pos: a.poly[0], rider: "Sim Rider A", delayMin: 0,
        stage: "ready", progress: 0, stageMs: 0, events: [], flags: {},
      });
      enter("ready");
    },
    pause: () => set({ running: false }),
    resume: () => set({ running: true }),
    reset: () => set({ active: false, running: false, stage: "ready", progress: 0, stageMs: 0, pos: null, events: [], flags: {}, legPickup: [], legDeliver: [], delayMin: 0 }),
    setSpeed: (speed) => set({ speed }),

    step() {
      const s = get();
      const i = STAGES.findIndex((x) => x.id === s.stage);
      if (!s.active || i >= STAGES.length - 1) return;
      const next = STAGES[i + 1].id;
      if (s.stage === "to_pickup") set({ progress: 1 });
      if (s.stage === "in_transit" || s.stage === "arriving") set({ progress: 1 });
      enter(next);
    },

    tick(dt) {
      const s = get();
      if (!s.active || !s.running) return;
      const adv = dt * s.speed;
      const slow = s.scenario === "delayed" && (s.stage === "to_pickup" || s.stage === "in_transit" || s.stage === "arriving") ? 1 / 1.8 : 1;
      const stageMs = s.stageMs + adv;
      if (s.stage === "to_pickup") {
        const p = Math.min(1, s.progress + (adv * slow) / DUR.to_pickup);
        set({ progress: p, stageMs, pos: pointAt(s.legPickup, p) });
        if (s.scenario === "failed_pickup" && !s.flags.failed && p > 0.55) {
          set({ flags: { ...s.flags, failed: true }, rider: "Sim Rider B", running: s.running });
          log("to_pickup", "Pickup failed", "Sim Rider A became unreachable. Claim released and reassigned to Sim Rider B (simulation)");
          const start: LatLng = [s.donor!.lat - 0.02, s.donor!.lng + 0.02];
          set({ legPickup: [start, [s.donor!.lat, s.donor!.lng]], progress: 0, pos: start, stageMs: 0 });
          enter("assigned");
          return;
        }
        if (p >= 1) enter("pickup");
      } else if (s.stage === "in_transit" || s.stage === "arriving") {
        const p = Math.min(1, s.progress + (adv * slow) / DUR.in_transit);
        set({ progress: p, stageMs, pos: pointAt(s.legDeliver, p) });
        if (s.scenario === "delayed" && !s.flags.delay && p > 0.3) { set({ flags: { ...s.flags, delay: true }, delayMin: 12 }); log(s.stage, "Delay reported", "Traffic added 12 minutes to the simulated ETA"); }
        if (s.scenario === "reroute" && !s.flags.reroute && p > 0.45 && s.altShelter) {
          const here = pointAt(s.legDeliver, p);
          const alt = s.altShelter;
          set({ flags: { ...s.flags, reroute: true }, shelter: alt, legDeliver: [here, [alt.lat, alt.lng]], progress: 0, pos: here });
          log("in_transit", "Route disrupted, rerouted", `Original destination became unavailable. New destination ${alt.name}; route and ETA recalculated (simulation)`);
          return;
        }
        if (s.stage === "in_transit" && p >= 0.8) enter("arriving");
        else if (p >= 1) enter("delivered");
      } else {
        const d = DUR[s.stage];
        if (d > 0 && stageMs >= d) {
          const i = STAGES.findIndex((x) => x.id === s.stage);
          if (i < STAGES.length - 1) enter(STAGES[i + 1].id);
        } else set({ stageMs });
      }
    },
  };
});

/** Simulated ETA in seconds at the current speed. */
export function simEtaSeconds(s: Pick<SimState, "stage" | "progress" | "speed" | "delayMin">): number {
  const left = s.stage === "to_pickup" ? (1 - s.progress) * DUR.to_pickup + DUR.pickup + DUR.in_transit
    : s.stage === "in_transit" || s.stage === "arriving" ? (1 - s.progress) * DUR.in_transit
    : s.stage === "pickup" ? DUR.in_transit : 0;
  return Math.round((left / s.speed) / 1000 + s.delayMin * 0 );
}

export function simRouteProgress(s: Pick<SimState, "stage" | "progress">): number {
  const i = STAGES.findIndex((x) => x.id === s.stage);
  if (i < 2) return 0;
  if (s.stage === "to_pickup") return Math.round(s.progress * 40);
  if (s.stage === "pickup") return 40;
  if (s.stage === "in_transit" || s.stage === "arriving") return Math.round(40 + s.progress * 60);
  return 100;
}
