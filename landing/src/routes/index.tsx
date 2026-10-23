import { createFileRoute } from "@tanstack/react-router";

import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { LiveOperationsSection } from "@/components/landing/LiveOperationsSection";
import { ImpactSection } from "@/components/landing/ImpactSection";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WeConnect — Connecting Surplus to Need. Before It's Too Late." },
      {
        name: "description",
        content:
          "WeConnect coordinates surplus food, essential supplies, volunteer riders, and receiving shelters — less waste, faster deliveries, stronger communities.",
      },
      { property: "og:title", content: "WeConnect — Connecting Surplus to Need" },
      {
        property: "og:description",
        content:
          "Track donations, riders, and shelters in real-time. WeConnect turns surplus into stronger communities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "WeConnect — Connecting Surplus to Need" },
      {
        name: "twitter:description",
        content:
          "WeConnect coordinates surplus food, volunteer riders, and receiving shelters before it's too late.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      <Header />
      <main>
        <HeroSection />
        <SolutionSection />
        <LiveOperationsSection />
        <ImpactSection />
      </main>
      <Footer />
    </div>
  );
}
