"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useApp } from "@/lib/data/store";
import type { Snapshot } from "@/lib/types";
import { Button } from "./ui";
import { OfflineNotice } from "./shared";
import { RiderPanel } from "./RiderPanel";
import { SchematicMap } from "./SchematicMap";

const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false, loading: () => <p className="text-mocha-700">Loading map</p> });

/** Street map when online, schematic SVG when offline or when chosen. Clicking a rider opens the same panel on both. */
export function MapView({ view, now, dispatcher = false, height = 460, initialRider = null }: { view: Snapshot; now: number; dispatcher?: boolean; height?: number; initialRider?: string | null }) {
  const online = useApp((s) => s.online);
  const [forceSchematic, setForce] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialRider);
  const schematic = !online || forceSchematic;
  return (
    <div className="flex flex-col gap-3">
      <OfflineNotice />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-mocha-700">
        <span>Rider positions are written by the server so every device sees the same map.</span>
        {online && <Button size="sm" onClick={() => setForce((v) => !v)}>{forceSchematic ? "Show street map" : "Show schematic map"}</Button>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {schematic ? <SchematicMap view={view} now={now} selected={selected} onSelect={setSelected} /> : <LiveMap view={view} now={now} selected={selected} onSelect={setSelected} height={height} />}
        {selected && <RiderPanel view={view} now={now} riderId={selected} onClose={() => setSelected(null)} dispatcher={dispatcher} />}
      </div>
    </div>
  );
}
