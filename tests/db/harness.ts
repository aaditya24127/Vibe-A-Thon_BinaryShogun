import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(__dirname, "../../supabase/migrations");

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}

let n = 0;
export const aid = (p = "t") => `${p}-${++n}-${Math.random().toString(36).slice(2, 8)}`;

export async function rpc(db: PGlite, fn: string, args: unknown[] = [], withId = true) {
  const all = withId ? [aid(fn), ...args] : args;
  const ph = all.map((_, i) => `$${i + 1}`).join(",");
  const r = await db.query<{ r: Record<string, any> }>(`select ${fn}(${ph}) as r`, all as any[]);
  return r.rows[0].r;
}

export async function rows<T = any>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params as any[])).rows;
}
