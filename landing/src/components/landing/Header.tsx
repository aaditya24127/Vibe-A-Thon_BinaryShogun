import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { NAV_LINKS } from "@/data/landing";
import { scrollToSection } from "@/lib/scroll";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/Logo";

export function Header() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("home");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (target: string) => {
    setActive(target);
    setOpen(false);
    scrollToSection(target);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-cream/90 backdrop-blur-md transition-shadow",
        scrolled && "shadow-[0_2px_16px_rgba(101,11,27,0.08)]",
      )}
    >
      <div className="mx-auto flex max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center justify-between gap-4 px-5 py-4 sm:flex sm:flex-wrap lg:px-8">
        <button
          type="button"
          onClick={() => go("home")}
          aria-label="WeConnect — back to top"
          className="flex min-w-0 items-center gap-2.5"
        >
          <Logo />
        </button>

        {/* Desktop navigation */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.target}
              type="button"
              onClick={() => go(link.target)}
              aria-current={active === link.target ? "true" : undefined}
              className={cn(
                "relative rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                active === link.target ? "text-cherry" : "text-ink-soft hover:text-cherry",
              )}
            >
              {link.label}
              <span
                className={cn(
                  "absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-cherry transition-opacity",
                  active === link.target ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          ))}
        </nav>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blush text-cherry lg:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile navigation panel */}
      {open && (
        <nav aria-label="Mobile" className="border-t border-blush/60 bg-cream px-5 py-3 lg:hidden">
          {NAV_LINKS.map((link) => (
            <button
              key={link.target}
              type="button"
              onClick={() => go(link.target)}
              className={cn(
                "block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors",
                active === link.target
                  ? "bg-blush/60 text-cherry"
                  : "text-ink-soft hover:bg-blush/40 hover:text-cherry",
              )}
            >
              {link.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
