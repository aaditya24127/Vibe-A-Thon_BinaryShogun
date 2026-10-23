import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ImpactStat = {
  icon: LucideIcon;
  value: string;
  label: string;
};

/**
 * Elevated, slightly tilted impact card with a restrained 3D hover tilt.
 * Pointer position drives a subtle perspective tilt; reduced-motion users
 * get a simple lift without rotation.
 */
export function ImpactCard({
  stat,
  tilt,
  surface,
}: {
  stat: ImpactStat;
  tilt: number;
  surface: "cream" | "blush";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const Icon = stat.icon;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--ry", `${px * 8}deg`);
    el.style.setProperty("--rx", `${-py * 8}deg`);
    el.style.setProperty("--lift", "-8px");
    el.style.setProperty("--shade", "0.28");
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--lift", "0px");
    el.style.setProperty("--shade", "0.22");
  };

  return (
    <div className="[perspective:800px]">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className={cn(
          "group flex flex-col items-center gap-3 rounded-3xl border-4 border-cream-white p-7 text-center shadow-[0_18px_40px_-18px_rgba(101,11,27,0.35)] transition-[transform,box-shadow] duration-300 ease-out will-change-transform sm:p-8",
          surface === "cream" ? "bg-cream-white" : "bg-blush/60",
        )}
        style={
          {
            "--rx": "0deg",
            "--ry": "0deg",
            "--lift": "0px",
            "--shade": "0.22",
            transform: `rotate(${tilt}deg) translateY(var(--lift)) rotateX(var(--rx)) rotateY(var(--ry))`,
            boxShadow: `0 18px 40px -14px rgba(101, 11, 27, var(--shade))`,
          } as React.CSSProperties
        }
      >
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-blush text-cherry transition-transform duration-300 group-hover:scale-105">
          <Icon size={30} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="font-display text-4xl font-black tracking-tight text-cherry sm:text-[2.6rem]">
          {stat.value}
        </p>
        <p className="text-sm font-semibold text-ink-soft sm:text-[0.95rem]">{stat.label}</p>
      </div>
    </div>
  );
}
