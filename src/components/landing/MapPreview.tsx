import { Bike, Home, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Local dispatch-dashboard map illustration: cream street surface, a dashed
 * cherry route from the donor to shelters, and placed markers. Purely
 * illustrative — no live geographic data.
 */
const ROUTE_PATH =
  "M 150 96 C 190 130, 210 170, 260 196 C 310 222, 320 240, 352 262 C 386 286, 396 300, 430 316";

export function MapPreview({ highlight = false }: { highlight?: boolean }) {
  const pct = (v: number, max: number) => `${(v / max) * 100}%`;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-cream shadow-[0_20px_45px_-20px_rgba(0,0,0,0.5)] transition-shadow duration-500",
        highlight && "ring-4 ring-blush ring-offset-4 ring-offset-burgundy",
      )}
      role="img"
      aria-label="Map preview showing a donor, an in-transit rider, and receiving shelters connected by a delivery route"
    >
      <div className="relative aspect-[600/420] w-full">
        {/* Streets, blocks and parks */}
        <svg
          viewBox="0 0 600 420"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <rect width="600" height="420" fill="#FFF5EA" />
          {/* park patches */}
          <rect x="20" y="290" width="110" height="90" rx="14" fill="#DDEBD3" />
          <rect x="470" y="40" width="100" height="80" rx="14" fill="#DDEBD3" />
          <rect x="330" y="330" width="80" height="60" rx="12" fill="#DDEBD3" />
          {/* blocks */}
          {[
            [70, 40, 90, 60], [200, 30, 110, 55], [380, 90, 90, 60], [180, 130, 80, 55],
            [420, 160, 110, 60], [70, 170, 70, 60], [280, 300, 80, 55], [120, 250, 70, 50],
            [500, 250, 80, 60], [250, 210, 60, 45], [400, 350, 90, 50],
          ].map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="6" fill="#F3E6D4" />
          ))}
          {/* roads */}
          <path d="M0 120 H600" stroke="#F0E0CB" strokeWidth="14" />
          <path d="M0 300 H600" stroke="#F0E0CB" strokeWidth="14" />
          <path d="M150 0 V420" stroke="#F0E0CB" strokeWidth="12" />
          <path d="M420 0 V420" stroke="#F0E0CB" strokeWidth="12" />
          <path d="M0 40 C 150 60, 300 20, 600 60" stroke="#F0E0CB" strokeWidth="8" fill="none" />
          {/* dashed delivery route */}
          <path
            d={ROUTE_PATH}
            fill="none"
            stroke="#B5122B"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="14 12"
          />
        </svg>

        {/* Donor marker */}
        <Marker
          style={{ left: pct(150, 600), top: pct(96, 420) }}
          label="Donor"
          tone="cherry"
          icon={<MapPin size={18} strokeWidth={2.4} aria-hidden="true" />}
        />
        {/* Rider marker (pulsing) */}
        <Marker
          style={{ left: pct(352, 600), top: pct(262, 420) }}
          label="Rider"
          tone="rider"
          icon={<Bike size={18} strokeWidth={2.4} aria-hidden="true" />}
          pulse
        />
        {/* Shelters */}
        <Marker
          style={{ left: pct(430, 600), top: pct(316, 420) }}
          label="Shelter"
          tone="success"
          icon={<Home size={17} strokeWidth={2.4} aria-hidden="true" />}
        />
        <Marker
          style={{ left: pct(240, 600), top: pct(60, 420) }}
          label="Shelter"
          tone="success"
          icon={<Home size={17} strokeWidth={2.4} aria-hidden="true" />}
        />
        <Marker
          style={{ left: pct(530, 600), top: pct(330, 420) }}
          label="Shelter"
          tone="success"
          icon={<Home size={17} strokeWidth={2.4} aria-hidden="true" />}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-cream-warm bg-cream-white/80 px-4 py-2.5 text-xs font-semibold text-ink sm:text-[0.8rem]">
        <span className="flex items-center gap-1.5">
          <MapPin size={14} className="text-cherry" aria-hidden="true" /> Donor
        </span>
        <span className="flex items-center gap-1.5">
          <Bike size={14} className="text-cherry" aria-hidden="true" /> Rider
        </span>
        <span className="flex items-center gap-1.5">
          <Home size={14} className="text-success" aria-hidden="true" /> Shelter
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0 w-7 border-t-[3px] border-dashed border-cherry" />
          Route
        </span>
      </div>
    </div>
  );
}

const TONES = {
  cherry: "bg-cherry text-cream-white",
  rider: "bg-cream-white text-cherry ring-2 ring-cherry",
  success: "bg-success text-cream-white",
} as const;

function Marker({
  style,
  label,
  tone,
  icon,
  pulse = false,
}: {
  style: React.CSSProperties;
  label: string;
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      style={style}
      className={cn(
        "absolute z-[1] grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-[0_6px_14px_-4px_rgba(57,7,16,0.45)]",
        TONES[tone],
      )}
    >
      {icon}
      {pulse && (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ping rounded-full bg-cherry/40"
        />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
