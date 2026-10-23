import { HERO_BENEFITS } from "@/data/landing";
import { scrollToSection } from "@/lib/scroll";
import { HeroVisual } from "@/components/landing/HeroVisual";

export function HeroSection() {
  return (
    <section id="home" aria-labelledby="hero-heading" className="bg-cream">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pt-10 pb-14 sm:pt-14 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pt-6 lg:pb-20">
        <div className="order-2 lg:order-1">
          <h1
            id="hero-heading"
            className="font-display text-[3.4rem] leading-[0.95] font-black tracking-tight text-burgundy sm:text-7xl lg:text-[5.6rem]"
          >
            <span className="bg-gradient-to-br from-cherry to-[#E0606B] bg-clip-text text-transparent">
              W<span className="text-[0.92em]">e</span>
            </span>
            Connect
          </h1>

          <p className="font-display mt-4 text-2xl font-bold leading-snug text-burgundy sm:text-3xl lg:text-[2.1rem]">
            Connecting Surplus to Need.
            <br />
            Before It&rsquo;s Too Late.
          </p>

          <button
            type="button"
            onClick={() => scrollToSection("how-it-works")}
            className="group mt-8 inline-flex items-center gap-2.5 rounded-full bg-cherry px-7 py-3.5 text-base font-bold text-cream-white shadow-[0_14px_30px_-10px_rgba(181,18,43,0.65)] transition-all hover:bg-cherry-deep hover:shadow-[0_16px_34px_-10px_rgba(101,11,27,0.75)] focus-visible:ring-2 focus-visible:ring-cherry focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none"
          >
            Explore the Platform
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </button>

          {/* Three benefit indicators */}
          <ul className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-3">
            {HERO_BENEFITS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 first:pl-0 sm:border-l sm:border-cherry/25 sm:pl-5 sm:first:border-l-0 sm:first:pl-0"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blush/70 text-cherry">
                  <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="text-sm font-bold whitespace-nowrap text-ink sm:text-[0.95rem]">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="order-1 lg:order-2 lg:pl-6">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}
