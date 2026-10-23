import type { Feature } from "@/data/landing";

/** One capability card: icon, short heading, image — nothing else. */
export function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <article className="relative flex h-full w-[230px] shrink-0 cursor-pointer flex-col items-center gap-3 rounded-3xl border border-blush/50 bg-cream-white p-4 pb-4 text-center shadow-[0_10px_28px_-14px_rgba(101,11,27,0.22)] transition-all duration-300 ease-out hover:z-10 hover:scale-[1.05] hover:shadow-[0_20px_36px_-12px_rgba(101,11,27,0.32)] sm:w-[252px] sm:p-5">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-blush text-cherry">
        <Icon size={24} strokeWidth={2} aria-hidden="true" />
      </span>
      <h3 className="text-balance text-[0.95rem] leading-snug font-bold text-ink sm:text-base">
        {feature.title}
      </h3>
      <img
        src={feature.image}
        alt={feature.imageAlt}
        width={752}
        height={896}
        loading="lazy"
        className="mt-auto h-36 w-full rounded-2xl object-cover sm:h-40"
      />
    </article>
  );
}
