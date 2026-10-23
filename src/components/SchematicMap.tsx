"use client";
import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import { LEGEND, mapData } from "./mapData";
import { hhmm } from "./shared";

const W = 720, H = 420, PAD = 56;

/** Offline fallback: drawn from stored coordinates only. Palette colours only, status always written out. */
export function SchematicMap({ view, now, selected, onSelect }: { view: Snapshot; now: number; selected: string | null; onSelect: (id: string) => void }) {
  const { riders, routes } = useMemo(() => mapData(view, now), [view, now]);
  const pts = [...view.donors, ...view.shelters, ...view.riders];
  const minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat));
  const minLng = Math.min(...pts.map((p) => p.lng)), maxLng = Math.max(...pts.map((p) => p.lng));
  const x = (lng: number) => PAD + ((lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * PAD);
  const y = (lat: number) => H - PAD - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * PAD);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-[13px] font-semibold">Schematic map. Street map unavailable offline.</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schematic map of donors, shelters and riders" className="w-full wc-card">
        {routes.map((r) => (
          <polyline key={r.leaseId} points={r.points.map(([la, ln]) => `${x(ln)},${y(la)}`).join(" ")} fill="none" stroke="#4a0f1f" strokeWidth={selected === r.riderId ? 3 : 1.5} strokeDasharray={r.pickupDone ? undefined : "6 5"} />
        ))}
        {view.donors.map((d) => (
          <g key={d.id}>
            <rect x={x(d.lng) - 7} y={y(d.lat) - 7} width={14} height={14} fill="#fff8e7" stroke="#4a0f1f" strokeWidth={2.5} />
            <text x={x(d.lng) + 11} y={y(d.lat) + 4} fontSize={11} fill="#4a0f1f">{d.name}</text>
          </g>
        ))}
        {view.shelters.map((s) => (
          <g key={s.id}>
            <polygon points={`${x(s.lng)},${y(s.lat) - 9} ${x(s.lng) + 9},${y(s.lat) + 7} ${x(s.lng) - 9},${y(s.lat) + 7}`} fill={s.status === "closed" ? "#4a0f1f" : "#fff8e7"} stroke="#4a0f1f" strokeWidth={2.5} />
            <text x={x(s.lng) + 12} y={y(s.lat) + 4} fontSize={11} fill="#4a0f1f">{s.name}{s.status === "closed" ? " (closed)" : ""}</text>
          </g>
        ))}
        {riders.map((r) => {
          const fill = r.tone === "critical" ? "#8e1b2e" : r.tone === "active" ? "#d9c3a5" : r.tone === "muted" ? "#f3e3c3" : "#fff8e7";
          return (
            <g key={r.id} tabIndex={0} role="button" aria-label={`${r.name}, ${r.status}`} onClick={() => onSelect(r.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(r.id); }} style={{ cursor: "pointer" }}>
              <circle cx={x(r.lng)} cy={y(r.lat)} r={11} fill={fill} stroke={r.tone === "warn" ? "#8e1b2e" : "#4a0f1f"} strokeWidth={selected === r.id ? 4 : 2} strokeDasharray={r.tone === "warn" || r.tone === "muted" ? "3 2" : undefined} />
              <text x={x(r.lng)} y={y(r.lat) + 4} fontSize={10} fontWeight={600} textAnchor="middle" fill={r.tone === "critical" ? "#fff8e7" : "#4a0f1f"}>{r.id.replace("RD-", "R")}</text>
              <text x={x(r.lng) + 15} y={y(r.lat) - 6} fontSize={10} fontWeight={600} fill="#4a0f1f">{r.status}{r.etaMs ? `, ETA ${hhmm(r.etaMs)}` : ""}</text>
            </g>
          );
        })}
      </svg>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-mocha-700">{LEGEND.map((l) => <li key={l}>{l}</li>)}</ul>
    </figure>
  );
}
