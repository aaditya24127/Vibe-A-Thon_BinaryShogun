import { useState } from "react";

import { OPS_METRICS } from "@/data/landing";
import { MapPreview } from "@/components/landing/MapPreview";
import { RiderDetailsDialog, RiderStatusCard } from "@/components/landing/RiderStatusCard";

/**
 * Deep-burgundy live-operations section: dashboard copy and demo metrics on
 * the left, the dispatch map in the centre, and the rider status card on the
 * right. All values are illustrative demo data, ready for backend wiring.
 */
export function LiveOperationsSection() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeRiders, ongoingDeliveries, receivingShelters] = OPS_METRICS;

  return (
    <section id="how-it-works" aria-labelledby="ops-heading" className="scroll-mt-20 bg-burgundy">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:py-20 lg:grid-cols-12 lg:gap-6 lg:px-8">
        {/* Left column */}
        <div className="flex flex-col lg:col-span-4">
          <div>
            <h2
              id="ops-heading"
              className="font-display text-4xl font-black tracking-tight text-cream sm:text-5xl"
            >
              See <span className="text-blush">Aid</span> in Action
            </h2>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-cream/75">
              Track donations, riders, and shelters in real-time — all on a single dashboard.
            </p>
          </div>

          {/* Operational metrics — compact triangular layout */}
          <ul className="mt-8 grid max-w-sm grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-5">
            {/* Top centre: Active Riders */}
            <li className="flex items-center justify-start sm:col-span-2 sm:justify-center">
              <div className="flex items-center gap-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cherry text-cream-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                  <activeRiders.icon size={22} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-black tracking-tight text-cream">
                    {activeRiders.value}
                  </p>
                  <p className="text-xs sm:text-[0.8rem] font-medium leading-tight text-cream/80">
                    {activeRiders.label}
                  </p>
                </div>
              </div>
            </li>

            {/* Bottom left: Ongoing Deliveries */}
            <li className="flex items-center justify-start">
              <div className="flex items-center gap-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cherry text-cream-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                  <ongoingDeliveries.icon size={22} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-black tracking-tight text-cream">
                    {ongoingDeliveries.value}
                  </p>
                  <p className="text-xs sm:text-[0.8rem] font-medium leading-tight text-cream/80">
                    {ongoingDeliveries.label}
                  </p>
                </div>
              </div>
            </li>

            {/* Bottom right: Receiving Shelters */}
            <li className="flex items-center justify-start sm:justify-end">
              <div className="flex items-center gap-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cherry text-cream-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                  <receivingShelters.icon size={22} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-black tracking-tight text-cream">
                    {receivingShelters.value}
                  </p>
                  <p className="text-xs sm:text-[0.8rem] font-medium leading-tight text-cream/80">
                    {receivingShelters.label}
                  </p>
                </div>
              </div>
            </li>
          </ul>
        </div>

        {/* Centre: map preview */}
        <div id="map-preview" className="scroll-mt-24 lg:col-span-5">
          <MapPreview />
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
