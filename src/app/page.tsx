import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ENTRIES = [
  { href: "/donor", title: "Donor", text: "Post a batch of surplus food, medical supplies or kits." },
  { href: "/rider", title: "Rider", text: "See reachable batches, claim one, and report each step." },
  { href: "/shelter", title: "Shelter", text: "Set demand, resources and open status. See incoming deliveries." },
  { href: "/operations", title: "Operations", text: "Dispatch, map, risk, recovery and the Chaos Lab." },
];

export default function Landing() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <h1>WeConnect</h1>
      <p className="text-mocha-700">Choose your role.</p>
      <ul className="flex flex-col divide-y divide-mocha-600 border-y border-mocha-600">
        {ENTRIES.map((e) => (
          <li key={e.href}>
            <Link href={e.href} className="group flex items-center justify-between gap-4 py-4 hover:bg-latte focus-visible:outline-2 focus-visible:outline-cherry">
              <span className="flex flex-col">
                <span className="text-[20px] font-semibold">{e.title}</span>
                <span className="text-[13px] text-mocha-700">{e.text}</span>
              </span>
              <ArrowRight aria-hidden size={20} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
