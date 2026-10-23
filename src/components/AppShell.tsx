"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Bike, Gift, History, Home, LayoutDashboard, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useApp } from "@/lib/data/store";
import { useMounted } from "@/lib/data/hooks";
import { Status, cn } from "./ui";
import { Bell_, Toaster } from "./Notifications";
import { SimDriver, SimToggle } from "./SimPanel";

const NAV = [
  { href: "/operations", label: "Operations", icon: LayoutDashboard },
  { href: "/donor", label: "Donor", icon: Gift },
  { href: "/rider", label: "Rider", icon: Bike },
  { href: "/shelter", label: "Shelter Operations", icon: Home },
  { href: "/timeline", label: "Timeline", icon: History },
];

function Chips() {
  const mounted = useMounted();
  const { online, connection, outbox } = useApp();
  const waiting = outbox.filter((o) => o.status === "local" || o.status === "sent").length;
  const conn = !mounted ? { t: "Checking", tone: "muted" as const }
    : connection === "connected" ? { t: "Supabase connected", tone: "calm" as const }
    : connection === "connecting" ? { t: "Supabase connecting", tone: "muted" as const }
    : connection === "not_configured" ? { t: "Supabase not configured", tone: "critical" as const }
    : { t: "Supabase unreachable", tone: "warn" as const };
  const net = !mounted ? { t: "Checking network", tone: "muted" as const }
    : online && connection !== "connected" ? { t: "Online. Not synced.", tone: "warn" as const }
    : online ? { t: waiting ? `Online. ${waiting} waiting to sync.` : "Online. Synced.", tone: waiting ? ("warn" as const) : ("calm" as const) }
    : { t: "Offline. Saved on this device.", tone: "critical" as const };
  return <><Status tone={conn.tone} className="hidden sm:inline-flex">{conn.t}</Status><Status tone={net.tone}>{net.t}</Status></>;
}

/** Landing page renders bare. Every application route gets the collapsible sidebar and compact header. */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("wc-sidebar") === "1" || window.innerWidth < 768); } catch { /* ignore */ }
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("wc-sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  if (path === "/") return <>{children}<Toaster /></>;
  const current = NAV.find((n) => n.href === path)?.label ?? "WeConnect";

  return (
    <div className="flex min-h-screen">
      <aside aria-label="Main navigation" className={cn("sticky top-0 flex h-screen shrink-0 flex-col gap-1 border-r border-mocha-600 bg-latte py-3 transition-[width] duration-200", collapsed ? "w-14 px-1.5" : "w-52 px-2.5")}>
        <Link href="/" className={cn("mb-2 flex items-center gap-2 rounded-[6px] px-2 py-1.5 font-semibold", collapsed && "justify-center")} aria-label="WeConnect home">
          <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-burgundy text-[13px] text-latte" aria-hidden>W</span>{!collapsed && <span>WeConnect</span>}
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = path === href;
            return (
              <Link key={href} href={href} title={label} aria-current={on ? "page" : undefined}
                className={cn("flex h-10 items-center gap-2.5 rounded-[6px] px-2.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-cherry", on ? "bg-burgundy font-semibold text-latte" : "hover:bg-mocha-200", collapsed && "justify-center px-0")}>
                <Icon size={18} aria-hidden />{!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>
        <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={cn("flex h-10 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] hover:bg-mocha-200 focus-visible:outline-2 focus-visible:outline-cherry", collapsed && "justify-center px-0")}>
          {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <><PanelLeftClose size={18} aria-hidden /><span>Collapse</span></>}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-mocha-600 bg-latte px-3">
          <h1 className="mr-auto truncate">{current}</h1>
          <Chips />
          <SimToggle />
          <Bell_ />
        </header>
        <main className="min-w-0 flex-1 px-3 py-3 sm:px-4">{children}</main>
      </div>
      <SimDriver />
      <Toaster />
    </div>
  );
}
