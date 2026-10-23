import { useState } from "react";
import { Bike, CheckCircle2 } from "lucide-react";

import { RIDER } from "@/data/landing";

const ROWS = [
  ["Carrying", RIDER.carrying],
  ["To", RIDER.destination],
  ["ETA", RIDER.eta],
  ["Time remaining", RIDER.timeRemaining],
  ["Status", RIDER.condition],
] as const;

/** Cream rider-detail card beside the map. Illustrative demo data. */
export function RiderStatusCard({ onViewDetails }: { onViewDetails: () => void }) {
  return (
    <div className="rounded-3xl bg-cream p-5 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.5)] sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cherry to-cherry-deep text-cream-white">
          <Bike size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-ink">{RIDER.name}</p>
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            {RIDER.status}
          </span>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-cream-warm">
        {ROWS.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-sm text-ink-soft">{label}</dt>
            <dd className="text-sm font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onViewDetails}
        className="mt-4 w-full rounded-2xl bg-cherry-deep py-3 text-sm font-bold text-cream-white transition-colors hover:bg-burgundy focus-visible:ring-2 focus-visible:ring-cherry focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none"
      >
        View Details
      </button>
    </div>
  );
}

/**
 * Local demonstration panel opened by View Details / View Live Demo.
 * Shows the demo rider's route and status — illustrative data only.
 */
export function RiderDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [demoNote] = useState(
    "This is an illustrative preview. Live tracking arrives with the WeConnect platform backend.",
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rider-details-title"
      className="fixed inset-0 z-[60] grid place-items-center bg-burgundy/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-cream p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="rider-details-title" className="font-display text-2xl font-black text-burgundy">
          Rider {RIDER.id} — Delivery Details
        </h3>
        <dl className="mt-4 divide-y divide-cream-warm rounded-2xl bg-cream-white px-4">
          {ROWS.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm text-ink-soft">{label}</dt>
              <dd className="text-sm font-bold text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-sm font-bold text-ink">Route</p>
        <ul className="mt-2 space-y-2">
          {RIDER.route.map((step) => (
            <li key={step} className="flex items-start gap-2 text-sm text-ink-soft">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              {step}
            </li>
          ))}
        </ul>

        <p className="mt-4 rounded-xl bg-blush/50 p-3 text-xs text-ink-soft">{demoNote}</p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-cherry py-3 text-sm font-bold text-cream-white transition-colors hover:bg-cherry-deep focus-visible:ring-2 focus-visible:ring-cherry focus-visible:outline-none"
        >
          Close
        </button>
      </div>
    </div>
  );
}
