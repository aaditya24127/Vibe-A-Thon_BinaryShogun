"use client";
import { useState } from "react";
import { Bell, X } from "lucide-react";
import { format } from "date-fns";
import { useToasts } from "@/lib/toast";
import { Button, cn } from "./ui";

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
          className={cn("fade pointer-events-auto flex items-start gap-2 rounded-[10px] border px-3 py-2 text-[13px] shadow-[0_6px_20px_rgba(74,15,31,0.2)]",
            t.kind === "error" ? "border-cherry bg-cherry text-latte" : "border-mocha-600 bg-latte text-burgundy")}>
          <div className="flex-1"><p className="font-semibold">{t.kind === "error" ? "Failed: " : t.kind === "success" ? "Done: " : "Note: "}{t.title}</p>{t.detail && <p className="opacity-90">{t.detail}</p>}</div>
          <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="rounded-[4px] p-1 focus-visible:outline-2 focus-visible:outline-cherry"><X size={14} aria-hidden /></button>
        </div>
      ))}
    </div>
  );
}

export function Bell_() {
  const { history, unread, markRead, clear } = useToasts();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => { setOpen((v) => !v); markRead(); }}>
        <Bell size={15} aria-hidden />{unread > 0 && <span className="rounded-[4px] bg-cherry px-1 text-[11px] text-latte">{unread}</span>}
      </Button>
      {open && (
        <div role="dialog" aria-label="Notification history" className="absolute right-0 top-11 z-40 flex max-h-96 w-80 max-w-[92vw] flex-col gap-2 overflow-y-auto rounded-[10px] border border-mocha-600 bg-latte p-3 shadow-[0_8px_24px_rgba(74,15,31,0.18)]">
          <div className="flex items-center justify-between"><h2>Notifications</h2><Button size="sm" onClick={clear}>Clear</Button></div>
          {!history.length ? <p className="text-[13px] text-mocha-700">Nothing yet. Confirmations and failures appear here.</p> : history.map((t) => (
            <div key={t.id} className="border-t border-mocha-600 pt-2 text-[13px]"><p className="font-semibold">{t.kind === "error" ? "Failed: " : ""}{t.title}</p>{t.detail && <p>{t.detail}</p>}<p className="text-mocha-700">{format(t.at, "HH:mm:ss")}</p></div>
          ))}
        </div>
      )}
    </div>
  );
}
