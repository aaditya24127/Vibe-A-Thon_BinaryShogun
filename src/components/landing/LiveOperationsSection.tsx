import { useCallback, useEffect, useRef, useState } from "react";

import { OPS_METRICS } from "@/data/landing";
import { scrollToSection } from "@/lib/scroll";
import { MapPreview } from "@/components/landing/MapPreview";
import { RiderDetailsDialog, RiderStatusCard } from "@/components/landing/RiderStatusCard";

/**
 * Deep-burgundy live-operations section: dashboard copy and demo metrics on
 * the left, the dispatch map in the centre, and the rider status card on the
 * right. All values are illustrative demo data, ready for backend wiring.
 */
export function LiveOperationsSection() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const highlightTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  /** Scrolls to the map preview and briefly highlights it. */
  const showLiveDemo = useCallback(() => {
    scrollToSection("map-preview");
    setHighlight(true);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlight(false), 2400);
  }, []);

  return (
    <section id="how-it-works" aria-labelledby="ops-heading" className="scroll-mt-20 bg-burgundy">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:py-20 lg:grid-cols-12 lg:gap-6 lg:px-8">
        {/* Left column */}
        <div className="lg:col-span-4">
          <h2
            id="ops-heading"
            className="font-display text-4xl font-black tracking-tight text-cream sm:text-5xl"
          >
            See <span className="text-blush">Aid</span> in Action
          </h2>
          <p className="mt-4 max-w-xs text-base leading-relaxed text-cream/75">
            Track donations, riders, and shelters in real-time — all on a single dashboard.
          </p>

          <button
            type="button"
            onClick={showLiveDemo}
            className="group mt-6 inline-flex items-center gap-2.5 rounded-full bg-cream px-6 py-3 text-sm font-bold text-burgundy transition-colors hover:bg-cream-warm focus-visible:ring-2 focus-visible:ring-blush focus-visible:outline-none"
          >
            View Live Demo
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </button>

          {/* Operational metrics */}
          <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 xl:gap-3">
            {OPS_METRICS.map(({ icon: Icon, value, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cherry/90 text-cream-white">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-black text-cream">{value}</p>
                  <p className="text-xs text-cream/70">{label}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Centre: map preview */}
        <div id="map-preview" className="scroll-mt-24 lg:col-span-5">
          <MapPreview highlight={highlight} />
        </div>

        {/* Right: rider status card */}
        <div className="lg:col-span-3">
          <RiderStatusCard onViewDetails={() => setDetailsOpen(true)} />
        </div>
      </div>

      <RiderDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </section>
  );
}
