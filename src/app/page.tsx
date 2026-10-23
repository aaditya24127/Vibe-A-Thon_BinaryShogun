"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Bike, Gift, Home, LayoutDashboard, Loader2 } from "lucide-react";

const ROLES = [
  { href: "/donor", title: "Donor", text: "Post surplus batches and follow them to delivery.", icon: Gift },
  { href: "/rider", title: "Rider", text: "Claim kits, follow the map, report issues.", icon: Bike },
  { href: "/shelter", title: "Shelter Operations", text: "Track demand, incoming supplies and receipt.", icon: Home },
  { href: "/operations", title: "Operations", text: "Allocate, reroute and respond to alerts.", icon: LayoutDashboard },
];

export default function Landing() {
  const [going, setGoing] = useState(false);
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-4">
        <span className="grid size-10 place-items-center rounded-[10px] bg-burgundy font-semibold text-latte" aria-hidden>W</span>
        <h1 className="text-[32px] leading-tight">WeConnect</h1>
        <p className="max-w-xl text-[20px] font-semibold">Connecting surplus to need, before it spoils.</p>
        <p className="max-w-xl text-mocha-700">One shared system for donors, riders, shelters and operations: capacity, deadlines and compatibility checked by the database, failures reported with a reason.</p>
        <div>
          <Link href="/operations" onClick={() => setGoing(true)} aria-busy={going}
            className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-burgundy bg-burgundy px-5 font-semibold text-latte transition-colors hover:bg-[#3a0b18] focus-visible:outline-2 focus-visible:outline-cherry focus-visible:outline-offset-2">
            {going ? <><Loader2 size={18} className="animate-spin" aria-hidden />Opening WeConnect</> : <>Start<ArrowRight size={18} aria-hidden /></>}
          </Link>
        </div>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map(({ href, title, text, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex h-full flex-col gap-2 wc-card p-4  transition-colors hover:bg-mocha-200 focus-visible:outline-2 focus-visible:outline-cherry">
              <Icon size={20} aria-hidden /><span className="font-semibold">{title}</span><span className="text-[13px] text-mocha-700">{text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
