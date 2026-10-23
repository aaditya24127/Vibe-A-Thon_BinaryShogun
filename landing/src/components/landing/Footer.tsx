import { Instagram, Linkedin, Youtube } from "lucide-react";

import { NAV_LINKS, SOCIAL_LINKS } from "@/data/landing";
import { scrollToSection } from "@/lib/scroll";
import { Logo } from "@/components/landing/Logo";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin size={16} aria-hidden="true" />,
  instagram: <Instagram size={16} aria-hidden="true" />,
  x: <XIcon />,
  youtube: <Youtube size={16} aria-hidden="true" />,
};

export function Footer() {
  return (
    <footer id="about" className="relative overflow-hidden bg-burgundy text-cream">
      {/* Subtle flowing waves */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <svg
          viewBox="0 0 1440 200"
          preserveAspectRatio="none"
          className="absolute -top-6 left-0 h-40 w-full"
        >
          <path
            d="M0 120 C 240 40, 480 180, 760 110 C 1000 55, 1240 160, 1440 90 L 1440 0 L 0 0 Z"
            fill="#650B1B"
            opacity="0.55"
          />
          <path
            d="M0 90 C 260 20, 520 140, 800 80 C 1040 30, 1260 120, 1440 60"
            fill="none"
            stroke="#B5122B"
            strokeOpacity="0.25"
            strokeWidth="2"
          />
        </svg>
        <svg
          viewBox="0 0 1440 160"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 h-28 w-full"
        >
          <path
            d="M0 60 C 300 140, 600 20, 900 90 C 1140 145, 1320 60, 1440 110 L 1440 160 L 0 160 Z"
            fill="#650B1B"
            opacity="0.45"
          />
        </svg>
      </div>

      <div className="relative mx-auto max-w-7xl px-5 pt-16 pb-8 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-start">
          {/* Left: brand */}
          <div>
            <Logo wordClassName="text-cream" markClassName="h-8 w-10" />
            <p className="mt-3 max-w-[16rem] text-sm text-cream/70">
              Connecting Surplus to Need. Before It&rsquo;s Too Late.
            </p>
          </div>

          {/* Centre: navigation */}
          <nav aria-label="Footer" className="sm:justify-self-center">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.target}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(link.target)}
                    className="text-sm font-semibold text-cream/80 transition-colors hover:text-blush focus-visible:ring-2 focus-visible:ring-blush focus-visible:outline-none"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Right: socials (placeholder links until real profiles exist) */}
          <ul className="flex gap-2.5 sm:justify-self-end">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  aria-label={social.label}
                  className="grid h-9 w-9 place-items-center rounded-full bg-cherry/60 text-cream transition-colors hover:bg-cherry focus-visible:ring-2 focus-visible:ring-blush focus-visible:outline-none"
                >
                  {SOCIAL_ICONS[social.icon]}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-12 text-right text-xs text-cream/60">
          © 2026 WeConnect. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
