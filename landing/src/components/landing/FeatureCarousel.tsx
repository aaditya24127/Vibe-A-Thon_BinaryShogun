import { useCallback, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { FEATURES } from "@/data/landing";
import { FeatureCard } from "@/components/landing/FeatureCard";

/**
 * Continuous left-to-right marquee of the seven feature cards.
 * - Seamless loop via duplicated track content and modulo wrapping.
 * - Pauses on pointer enter, resumes on leave; never resets position.
 * - Prev/next controls shift the strip by one card with a smooth tween.
 * - Reduced motion: auto-scroll disabled, manual controls + overflow scroll.
 */
export function FeatureCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const pausedRef = useRef(false);
  const tweenRef = useRef<{ from: number; to: number; start: number; dur: number } | null>(null);
  const reducedRef = useRef(false);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    // Half the track = one full set of cards (content is duplicated once).
    return track.scrollWidth / 2;
  }, []);

  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    let raf = 0;
    let last = performance.now();
    let running = true;
    const SPEED = 42; // px per second, left to right

    const apply = () => {
      const loop = measure();
      if (loop <= 0) return;
      const p = ((posRef.current % loop) + loop) % loop;
      track.style.transform = `translateX(${-(loop - p)}px)`;
    };

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const loop = measure();
      if (loop > 0) {
        const tween = tweenRef.current;
        if (tween) {
          const t = Math.min((now - tween.start) / tween.dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          posRef.current = tween.from + (tween.to - tween.from) * eased;
          if (t >= 1) tweenRef.current = null;
        } else if (!pausedRef.current && !reducedRef.current && !document.hidden) {
          posRef.current += SPEED * dt;
        }
        const p = ((posRef.current % loop) + loop) % loop;
        track.style.transform = `translateX(${-(loop - p)}px)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => apply();
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [measure]);

  const nudge = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const loop = measure();
    if (loop <= 0) return;
    const card = track.querySelector("article");
    const gap = 20;
    const stride = card ? card.clientWidth + gap : 272;
    const from = ((posRef.current % loop) + loop) % loop;
    const to = (((from + direction * stride) % loop) + loop) % loop;
    // Choose the shortest path across the wrap point.
    const delta =
      to - from > loop / 2
        ? to - from - loop
        : to - from < -loop / 2
          ? to - from + loop
          : to - from;
    tweenRef.current = {
      from: posRef.current,
      to: posRef.current + delta,
      start: performance.now(),
      dur: 450,
    };
  };

  return (
    <div>
      <div
        ref={viewportRef}
        onPointerEnter={() => (pausedRef.current = true)}
        onPointerLeave={() => (pausedRef.current = false)}
        onTouchStart={() => (pausedRef.current = true)}
        onTouchEnd={() => (pausedRef.current = false)}
        className="overflow-hidden py-5 -my-3"
        role="region"
        aria-label="WeConnect features carousel"
      >
        <div ref={trackRef} className="flex w-max gap-5 will-change-transform">
          {[...FEATURES, ...FEATURES].map((feature, i) => (
            <FeatureCard key={`${feature.title}-${i}`} feature={feature} />
          ))}
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Previous features"
          className="grid h-11 w-11 place-items-center rounded-full bg-blush text-cherry-deep transition-colors hover:bg-cherry hover:text-cream-white focus-visible:ring-2 focus-visible:ring-cherry focus-visible:outline-none"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Next features"
          className="grid h-11 w-11 place-items-center rounded-full bg-cherry text-cream-white shadow-[0_10px_22px_-8px_rgba(181,18,43,0.6)] transition-colors hover:bg-cherry-deep focus-visible:ring-2 focus-visible:ring-cherry focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
