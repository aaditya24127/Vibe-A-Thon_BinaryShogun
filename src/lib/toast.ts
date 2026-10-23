"use client";
import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";
export interface Toast { id: number; kind: ToastKind; title: string; detail?: string; at: number }

interface ToastState {
  toasts: Toast[];
  history: Toast[];
  unread: number;
  push: (kind: ToastKind, title: string, detail?: string) => void;
  dismiss: (id: number) => void;
  markRead: () => void;
  clear: () => void;
}

let n = 0;

/** Toasts for immediate feedback; history feeds the notification bell. Only server outcomes are announced as success. */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [], history: [], unread: 0,
  push(kind, title, detail) {
    const t: Toast = { id: ++n, kind, title, detail, at: Date.now() };
    set((s) => ({ toasts: [...s.toasts, t].slice(-4), history: [t, ...s.history].slice(0, 40), unread: s.unread + 1 }));
    setTimeout(() => get().dismiss(t.id), kind === "error" ? 7000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  markRead: () => set({ unread: 0 }),
  clear: () => set({ history: [], unread: 0 }),
}));

export const notify = (kind: ToastKind, title: string, detail?: string) => useToasts.getState().push(kind, title, detail);
