import type { HeroCard } from "@/data/landing";
import { cn } from "@/lib/utils";

/** Compact floating card overlaid on the hero visual. */
export function FloatingInfoCard({
  card,
  className,
}: {
  card: HeroCard;
  className?: string;
}) {
  const Icon = card.icon;
  return (
    <div
      className={cn(
        "float-slow absolute z-10 flex items-center gap-3 rounded-2xl bg-cream-white/95 p-3 pr-4 shadow-[0_12px_30px_-10px_rgba(101,11,27,0.35)] backdrop-blur-sm sm:p-3.5 sm:pr-5",
        className,
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blush text-cherry sm:h-10 sm:w-10">
        <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink sm:text-[0.95rem]">{card.title}</p>
        {card.subtitle && (
          <p className="truncate text-xs text-ink-soft sm:text-[0.8rem]">{card.subtitle}</p>
        )}
        {card.meta && <p className="text-xs text-ink-soft sm:text-[0.8rem]">{card.meta}</p>}
        {card.progress && (
          <div className="mt-1 w-36 sm:w-40">
            <p className="text-xs font-bold text-cherry">
              {card.progress.done} / {card.progress.total} meals
            </p>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-blush"
              role="progressbar"
              aria-valuenow={card.progress.done}
              aria-valuemin={0}
              aria-valuemax={card.progress.total}
              aria-label={`${card.title} meals received`}
            >
              <div
                className="h-full rounded-full bg-cherry"
                style={{ width: `${(card.progress.done / card.progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
