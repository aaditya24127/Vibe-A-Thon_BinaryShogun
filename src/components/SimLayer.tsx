"use client";
import L from "leaflet";
import { Marker, Polyline, Tooltip } from "react-leaflet";
import { splitPoly, useSim } from "@/lib/sim";

const C = { burgundy: "#4a0f1f", cherry: "#8e1b2e", latte: "#fff8e7" };
const pin = (label: string) => L.divIcon({
  className: "", iconSize: [140, 24], iconAnchor: [10, 12],
  html: `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><div style="width:20px;height:20px;border-radius:4px;background:${C.latte};border:3px solid ${C.cherry}"></div><span style="background:${C.latte};border:1px dashed ${C.cherry};border-radius:4px;padding:1px 5px;font:600 11px system-ui;color:${C.cherry}">${label}</span></div>`,
});
const rider = (deg: number, label: string) => L.divIcon({
  className: "", iconSize: [160, 28], iconAnchor: [14, 14],
  html: `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><div style="width:28px;height:28px;border-radius:50%;background:${C.cherry};border:2px solid ${C.burgundy};display:grid;place-items:center"><svg width="14" height="14" viewBox="0 0 14 14" style="transform:rotate(${deg}deg)"><path d="M7 1 L12 12 L7 9 L2 12 Z" fill="${C.latte}"/></svg></div><span style="background:${C.cherry};color:${C.latte};border-radius:4px;padding:1px 6px;font:600 11px system-ui">SIMULATION: ${label}</span></div>`,
});

/** Simulated delivery drawn on the map: completed route solid, remaining route dashed. Always labelled SIMULATION. */
export function SimLayer() {
  const s = useSim();
  if (!s.active || !s.pos || !s.donor || !s.shelter) return null;
  const moving = s.stage === "to_pickup" || s.stage === "assigned" || s.stage === "ready";
  const leg = moving ? s.legPickup : s.legDeliver;
  const frac = s.stage === "to_pickup" ? s.progress : s.stage === "in_transit" || s.stage === "arriving" ? s.progress : s.stage === "delivered" || s.stage === "receipt" ? 1 : 0;
  const { done, rest } = leg.length > 1 ? splitPoly(leg, frac) : { done: [], rest: [] };
  const ahead = leg.length > 1 && frac < 1 ? (() => { const n = splitPoly(leg, Math.min(1, frac + 0.02)).done; const a = n[n.length - 2], b = n[n.length - 1]; return a && b ? (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI : 0; })() : 0;
  const bearing = 90 - ahead;
  return (
    <>
      {!moving && s.legPickup.length > 1 && <Polyline positions={s.legPickup} pathOptions={{ color: C.cherry, weight: 3 }} />}
      {done.length > 1 && <Polyline positions={done} pathOptions={{ color: C.cherry, weight: 5 }} />}
      {rest.length > 1 && <Polyline positions={rest} pathOptions={{ color: C.burgundy, weight: 3, dashArray: "8 8" }} />}
      <Marker position={[s.donor.lat, s.donor.lng]} icon={pin(`SIMULATION pickup: ${s.donor.name}`)}><Tooltip>Simulated pickup</Tooltip></Marker>
      <Marker position={[s.shelter.lat, s.shelter.lng]} icon={pin(`SIMULATION destination: ${s.shelter.name}`)}><Tooltip>Simulated destination</Tooltip></Marker>
      <Marker position={s.pos} icon={rider(bearing, s.rider)} zIndexOffset={2000}><Tooltip>{`${s.rider} (simulated position, not GPS)`}</Tooltip></Marker>
    </>
  );
}
