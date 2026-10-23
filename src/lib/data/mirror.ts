import { get, set, del } from "idb-keyval";
import type { Snapshot } from "../types";

const MIRROR = "wc:mirror";
const SEED = "wc:seed";
const OUTBOX = "wc:outbox";
const LOCAL = "wc:local";

export interface MirrorRecord { snapshot: Snapshot; syncedAt: Record<string, string> | null }

async function safeGet<T>(key: string): Promise<T | undefined> {
  try { return await get<T>(key); } catch { return undefined; }
}
async function safeSet(key: string, value: unknown) {
  try { await set(key, value); } catch { /* storage unavailable: the app still works from memory */ }
}

export const loadMirror = () => safeGet<MirrorRecord>(MIRROR);
export const saveMirror = (r: MirrorRecord) => safeSet(MIRROR, r);
export const loadSeed = () => safeGet<Snapshot>(SEED);
export const saveSeed = (s: Snapshot) => safeSet(SEED, s);
export const loadOutbox = async () => (await safeGet<OutboxRecord[]>(OUTBOX)) ?? [];
export const saveOutbox = (o: OutboxRecord[]) => safeSet(OUTBOX, o);
export const loadLocal = () => safeGet<Snapshot>(LOCAL);
export const saveLocal = (s: Snapshot | null) => (s ? safeSet(LOCAL, s) : del(LOCAL).catch(() => undefined));

export type SyncStatus = "local" | "sent" | "confirmed" | "rejected";
export interface OutboxRecord {
  action_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  status: SyncStatus;
  label: string;
  reason?: string;
  result?: Record<string, unknown>;
}
