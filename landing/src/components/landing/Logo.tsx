import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Stylized cherry-red W mark with a cherry -> deep-cherry gradient,
 * followed by the WeConnect wordmark.
 */
export function WMark({ className }: { className?: string | undefined }) {
  const id = useId();
  return (
    <svg viewBox="0 0 44 34" fill="none" aria-hidden="true" className={cn("h-7 w-9", className)}>
      <defs>
        <linearGradient
          id={`w-grad-${id}`}
          x1="0"
          y1="0"
          x2="44"
          y2="34"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#B5122B" />
          <stop offset="1" stopColor="#650B1B" />
        </linearGradient>
      </defs>
      <path
        d="M5 4 L14.5 30 L22 8.5 L29.5 30 L39 4"
        stroke={`url(#w-grad-${id})`}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
  wordClassName,
}: {
  className?: string | undefined;
  markClassName?: string | undefined;
  wordClassName?: string | undefined;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <WMark className={markClassName} />
      <span
        className={cn(
          "font-display text-2xl font-black tracking-tight text-burgundy",
          wordClassName,
        )}
      >
        WeConnect
      </span>
    </span>
  );
}
