import { ArrowLeft, ArrowRight } from "lucide-react";

import { FEATURES } from "@/data/landing";
import { FeatureCarousel } from "@/components/landing/FeatureCarousel";

/** Section 2 — "What We Do At WeConnect" with the moving feature-card strip. */
export function SolutionSection() {
  return (
    <section id="our-solution" aria-labelledby="solution-heading" className="bg-cream-warm">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:py-20 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2
            id="solution-heading"
            className="font-display text-4xl font-black tracking-tight text-burgundy sm:text-5xl"
          >
            What We Do At <span className="text-cherry">WeConnect</span>
          </h2>
        </div>

        <div className="mt-10">
          <FeatureCarousel />
        </div>

        <p className="sr-only">
          {FEATURES.map((f) => f.title).join(", ")}
        </p>
      </div>
    </section>
  );
}
