import { Sparkles } from "lucide-react";

import { IMPACT_STATS } from "@/data/landing";
import { scrollToSection } from "@/lib/scroll";
import { ImpactCard } from "@/components/landing/ImpactCard";

const TILTS: number[] = [-3, 2, -2, 3];
const SURFACES: ("cream" | "blush")[] = ["cream", "blush", "blush", "cream"];

/** Flowing decorative shapes behind the impact cards. */
function BackdropShapes() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
        className="absolute top-1/2 left-1/2 h-[130%] w-[120%] -translate-x-1/2 -translate-y-1/2"
      >
        <path
          d="M-50 240 C 180 140, 340 300, 560 200 C 760 110, 940 280, 1250 170 L 1250 400 L -50 400 Z"
          fill="#F9D9D2"
          opacity="0.45"
        />
        <path
          d="M-50 280 C 220 200, 420 330, 640 250 C 860 170, 1020 320, 1250 230"
          fill="none"
          stroke="#B5122B"
          strokeOpacity="0.12"
          strokeWidth="3"
        />
      </svg>
      <Sparkles className="absolute top-6 left-[6%] h-6 w-6 text-cherry/40" />
      <Sparkles className="absolute right-[8%] bottom-8 h-5 w-5 text-cherry/30" />
      <Sparkles className="absolute top-1/3 right-[2%] h-4 w-4 text-blush" />
    </div>
  );
}

const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) ?? "https://weconnect-jade.vercel.app/operations";

export function ImpactSection() {
  return (
    <section id="impact" aria-labelledby="impact-heading" className="relative bg-cream">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:py-20 lg:px-8">
        <h2
          id="impact-heading"
          className="font-display text-center text-4xl font-black tracking-tight text-burgundy sm:text-5xl"
        >
          Turning Surplus Into <span className="text-cherry">Stronger Communities</span>
        </h2>

        <div className="relative mt-12">
          <BackdropShapes />
          <ul className="relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {IMPACT_STATS.map((stat, i) => (
              <li key={stat.label}>
                <ImpactCard stat={stat} tilt={TILTS[i]!} surface={SURFACES[i]!} />
              </li>
            ))}
          </ul>
        </div>

        <CommunityBanner />
      </div>
    </section>
  );
}

/** Wide cherry banner with flowing shapes, sitting above the footer. */
export function CommunityBanner() {
  return (
    <div className="relative mt-16 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-cherry-deep via-cherry to-[#C2273D] px-6 py-12 text-center shadow-[0_24px_50px_-20px_rgba(101,11,27,0.6)] sm:py-14">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <svg
          viewBox="0 0 1200 220"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <path
            d="M-20 180 C 200 80, 420 220, 640 130 C 860 40, 1020 190, 1220 110 L 1220 240 L -20 240 Z"
            fill="#650B1B"
            opacity="0.5"
          />
          <circle cx="1100" cy="40" r="70" fill="#F9D9D2" opacity="0.12" />
          <circle cx="90" cy="190" r="50" fill="#F9D9D2" opacity="0.1" />
        </svg>
      </div>

      <h2 className="font-display relative text-3xl font-black tracking-tight text-cream sm:text-4xl">
        Be a Part of the Change
      </h2>
      <button
        type="button"
        onClick={() => window.location.assign(APP_URL)}
        className="group relative mt-6 inline-flex items-center gap-2.5 rounded-full bg-cream px-7 py-3.5 text-base font-bold text-cherry-deep transition-colors hover:bg-cream-warm focus-visible:ring-2 focus-visible:ring-cream focus-visible:outline-none"
      >
        Get Started
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </button>
    </div>
  );
}
