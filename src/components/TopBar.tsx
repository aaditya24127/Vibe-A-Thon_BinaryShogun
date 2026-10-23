"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/data/store";
import { useMounted } from "@/lib/data/hooks";
import { Status } from "./ui";

const ROLE_LABEL: Record<string, string> = { "/donor": "Donor", "/rider": "Rider", "/shelter": "Shelter", "/operations": "Operations", "/timeline": "Operations" };

export function TopBar() {
  const path = usePathname();
  const mounted = useMounted();
  const { online, connection, outbox } = useApp();
  const role = ROLE_LABEL[path] ?? "No role chosen";
  const waiting = outbox.filter((o) => o.status === "local" || o.status === "sent").length;

  const conn =
    !mounted ? { t: "Checking connection", tone: "muted" as const }
    : connection === "connected" ? { t: "Supabase connected", tone: "calm" as const }
    : connection === "connecting" ? { t: "Supabase connecting", tone: "muted" as const }
    : connection === "not_configured" ? { t: "Supabase not configured", tone: "critical" as const }
    : { t: "Supabase unreachable", tone: "warn" as const };
  const net = !mounted ? { t: "Checking network", tone: "muted" as const }
    : online && connection !== "connected" ? { t: "Online. Not synced.", tone: "warn" as const }
    : online ? { t: waiting ? `Online. ${waiting} waiting to sync.` : "Online. Synced.", tone: waiting ? ("warn" as const) : ("calm" as const) }
    : { t: "Offline. Saved on this device.", tone: "critical" as const };

  return (
    <header className="border-b border-mocha-600 bg-latte">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="text-[15px] font-semibold">WeConnect</Link>
        <span className="text-[13px] text-mocha-700">Role: <span className="font-semibold text-burgundy">{role}</span></span>
        <nav aria-label="Switch role" className="flex flex-wrap gap-3 text-[13px]">
          {[["/donor", "Donor"], ["/rider", "Rider"], ["/shelter", "Shelter"], ["/operations", "Operations"], ["/timeline", "Timeline"]].map(([h, l]) => (
            <Link key={h} href={h} className={path === h ? "font-semibold underline underline-offset-4" : "underline-offset-4 hover:underline"}>{l}</Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap gap-2">
          <Status tone={conn.tone}>{conn.t}</Status>
          <Status tone={net.tone}>{net.t}</Status>
        </div>
      </div>
    </header>
  );
}
