"use client";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { SimLayer } from "./SimLayer";
import { useSim } from "@/lib/sim";
import type { Snapshot } from "@/lib/types";
import { mapData } from "./mapData";

const C = { burgundy: "#4a0f1f", cherry: "#8e1b2e", latte: "#fff8e7", mocha: "#d9c3a5", mochaDark: "#7a6244", cream: "#f3e3c3" };

const wrap = (inner: string, anchor: [number, number] = [14, 14]) =>
  L.divIcon({ html: inner, className: "", iconSize: [28, 28], iconAnchor: anchor });

const donorIcon = wrap(`<div style="width:20px;height:20px;background:${C.latte};border:3px solid ${C.burgundy};margin:4px"></div>`);
const shelterIcon = (closed: boolean) =>
  wrap(`<svg width="28" height="28" viewBox="0 0 28 28"><path d="M14 3 L26 24 L2 24 Z" fill="${closed ? C.burgundy : C.latte}" stroke="${C.burgundy}" stroke-width="3" stroke-linejoin="round"/></svg>`);

function riderIcon(tone: string, id: string, label: string) {
  const fill = tone === "critical" ? C.cherry : tone === "active" ? C.mocha : tone === "muted" ? C.cream : C.latte;
  const text = tone === "critical" ? C.latte : C.burgundy;
  const border = tone === "warn" ? `2px dashed ${C.cherry}` : tone === "muted" ? `2px dashed ${C.mochaDark}` : `2px solid ${C.burgundy}`;
  return L.divIcon({
    className: "",
    iconSize: [150, 28],
    iconAnchor: [14, 14],
    html: `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
      <div style="width:28px;height:28px;border-radius:50%;background:${fill};border:${border};color:${text};font:600 11px system-ui;display:grid;place-items:center">${id.replace("RD-", "R")}</div>
      <span style="background:${C.latte};border:1px solid ${C.mochaDark};border-radius:4px;padding:1px 5px;font:600 11px system-ui;color:${C.burgundy}">${label}</span></div>`,
  });
}

/** Frames the simulated pickup and destination once when a simulation starts. */
function FitSim() {
  const map = useMap();
  const donor = useSim((s) => s.donor), shelter = useSim((s) => s.shelter), active = useSim((s) => s.active);
  useEffect(() => {
    if (active && donor && shelter) map.fitBounds([[donor.lat, donor.lng], [shelter.lat, shelter.lng]], { padding: [60, 60] });
    setTimeout(() => map.invalidateSize(), 50);
  }, [active, donor?.id, shelter?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickCatcher({ onClick }: { onClick: () => void }) { useMapEvents({ click: onClick }); return null; }

export default function LiveMap({ view, now, selected, onSelect, height = 460, onMapClick, simOnly = false }: { view: Snapshot; now: number; selected: string | null; onSelect: (id: string) => void; height?: number | string; onMapClick?: () => void; simOnly?: boolean }) {
  const { riders, routes } = useMemo(() => mapData(view, now), [view, now]);
  const center: [number, number] = [18.52, 73.855];
  return (
    <MapContainer center={center} zoom={12} style={{ height, width: "100%", borderRadius: 10, border: `1px solid ${C.mochaDark}` }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {onMapClick && <ClickCatcher onClick={onMapClick} />}
      <SimLayer />
      {simOnly && <FitSim />}
      {!simOnly && routes.map((r) => (
        <Polyline key={r.leaseId} positions={r.points} pathOptions={{ color: C.burgundy, weight: selected === r.riderId ? 4 : 2, dashArray: r.pickupDone ? undefined : "6 6" }} />
      ))}
      {!simOnly && view.donors.map((d) => (
        <Marker key={d.id} position={[d.lat, d.lng]} icon={donorIcon}><Tooltip>{`Donor: ${d.name}`}</Tooltip></Marker>
      ))}
      {!simOnly && view.shelters.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={shelterIcon(s.status === "closed")}><Tooltip>{`Shelter: ${s.name} (${s.status})`}</Tooltip></Marker>
      ))}
      {!simOnly && riders.map((r) => (
        <Marker key={r.id} position={[r.lat, r.lng]} icon={riderIcon(r.tone, r.id, r.status)} zIndexOffset={selected === r.id ? 1000 : 500}
          eventHandlers={{ click: () => onSelect(r.id) }} keyboard>
          <Tooltip>{`${r.name}: ${r.status}`}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
