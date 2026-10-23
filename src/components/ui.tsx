"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { Tone } from "@/lib/engine/labels";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

/* ---- Button: shadcn-style variants restyled to the palette. Radius 6px. ---- */
const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-[6px] px-4 h-10 text-[15px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-cherry",
  {
    variants: {
      variant: {
        primary: "bg-burgundy text-latte border-burgundy hover:bg-[#3a0b18]",
        secondary: "bg-latte text-burgundy border-mocha-600 hover:bg-mocha-200",
        danger: "bg-latte text-cherry border-cherry hover:bg-mocha-200",
      },
      size: { md: "", sm: "h-8 px-3 text-[13px]" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
export function Button({ className, variant, size, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button type="button" className={cn(button({ variant, size }), className)} {...p} />;
}

const field = "w-full rounded-[6px] border border-mocha-600 bg-latte px-3 h-10 text-[15px] text-burgundy placeholder:text-mocha-700 focus-visible:outline-2 focus-visible:outline-cherry";
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(field, className)} {...p} />; }
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn(field, className)} {...p} />; }
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "h-auto py-2 min-h-20", className)} {...p} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold">{label}</label>
      {children}
      {hint && !error && <p className="text-[13px] text-mocha-700">{hint}</p>}
      {error && <p role="alert" className="text-[13px] font-semibold text-cherry">{error}</p>}
    </div>
  );
}

/* ---- Card: radius 10px, a single border, no shadow. ---- */
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[10px] border border-mocha-600 bg-latte p-4", className)} {...p} />;
}
export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-mocha-600 pb-2">
        <h2>{title}</h2>
        {aside && <div className="text-[13px] text-mocha-700">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---- Status: always text, tone from the palette. ---- */
const toneClass: Record<Tone, string> = {
  calm: "bg-latte text-burgundy border-mocha-600",
  active: "bg-mocha-200 text-burgundy border-mocha-600",
  warn: "bg-latte text-cherry border-cherry border-dashed",
  critical: "bg-cherry text-latte border-cherry",
  muted: "bg-cream text-mocha-700 border-mocha-600 border-dashed",
};
export function Status({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("fade inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[13px] font-semibold max-w-full break-words", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "calm", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role="status" className={cn("rounded-[6px] border px-3 py-2 text-[13px]", toneClass[tone])}>{children}</div>
  );
}

export function Metric({ label, value, note, tone = "calm" }: { label: string; value: ReactNode; note?: string; tone?: Tone }) {
  return (
    <div className={cn("flex flex-col gap-1 border-l-2 pl-3", tone === "critical" || tone === "warn" ? "border-cherry" : "border-mocha-600")}>
      <span className="text-[13px] text-mocha-700">{label}</span>
      <span className={cn("text-[20px] font-semibold leading-tight", tone === "critical" && "text-cherry")}>{value}</span>
      {note && <span className="text-[13px] text-mocha-700">{note}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[6px] border border-dashed border-mocha-600 px-3 py-4 text-[13px] text-mocha-700">{children}</p>;
}

export function Table({ head, children, className }: { head: string[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-[6px] border border-mocha-600", className)}>
      <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="bg-mocha-200">{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-mocha-600 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}
