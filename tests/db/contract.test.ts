import { describe, expect, it, vi } from "vitest";

const calls: { type: string; payload: Record<string, unknown> }[] = [];
vi.mock("@/lib/data/store", () => ({
  useApp: {
    getState: () => ({
      dispatch: async (type: string, payload: Record<string, unknown>) => {
        calls.push({ type, payload });
        return { status: "confirmed", action_id: "x", type, payload, created_at: "", attempts: 0, label: "" };
      },
    }),
  },
}));

import { act } from "@/lib/actions";
import { freshDb } from "./harness";

/**
 * The client calls RPCs by name with named parameters (the way PostgREST does).
 * This test runs every client action against the real functions to prove the names and types line up.
 */
describe("client action contract matches the database function signatures", () => {
  it("every action resolves to an existing function with the parameter names the client sends", async () => {
    await act.createBatch({ donor_id: "DN-1", item_name: "Soup", category: "cooked_food", quantity: 10, unit: "meals", pickup_start_min: 0, pickup_end_min: 20, expires_in_min: 90, handling: "", storage: "", compat: "" });
    await act.claim("FD-1036", "SH-1", "RD-3", 10);
    await act.applyPlan([{ batch_id: "FD-1035", shelter_id: "SH-2", rider_id: "RD-1", quantity: 20 }], [{ batch_id: "FD-1037", quantity: 5, reason: "test" }]);
    await act.pickup("LS-1");
    await act.inTransit("LS-1");
    await act.deliver("LS-1", 5);
    await act.resolveCustody("LS-1", "resume", "note");
    await act.reroute("LS-1", "reason");
    await act.reopen("UR-1");
    await act.shelterStatus("SH-1", "closed", "reason");
    await act.shelterStatus("SH-1", "open", "reason");
    await act.shelterDemand("SH-1", 20, "reason");
    await act.shelterResources("SH-1", true, false, false, ["cooked_food", "medical"], "reason");
    await act.riderCapacity("RD-2", 30, "reason");
    await act.silent("RD-2", true);
    await act.advance(5);
    await act.delay("RD-2", 10);
    await act.incident("RD-2", "delay", null, "note", 5);
    await act.processIncident("IN-1");
    await act.reset();

    const db = await freshDb();
    expect(calls.length).toBeGreaterThanOrEqual(19);
    let i = 0;
    for (const c of calls) {
      const keys = Object.keys(c.payload);
      const named = ["p_action_id", ...keys].map((k, n) => `${k} => $${n + 1}`).join(", ");
      const values = [`contract-${++i}`, ...keys.map((k) => {
        const v = c.payload[k];
        return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
      })];
      const types = Object.fromEntries(keys.map((k) => [k, k === "p_plan" ? "::jsonb" : k === "p_categories" ? "::text[]" : ""]));
      const named2 = ["p_action_id", ...keys].map((k, n) => `${k} => $${n + 1}${types[k] ?? ""}`).join(", ");
      void named;
      const res = await db.query<{ r: Record<string, unknown> }>(`select ${c.type}(${named2}) as r`, values as never[]);
      const r = res.rows[0].r;
      expect(typeof r.success, `${c.type} must return a structured result`).toBe("boolean");
      expect(typeof r.reason, `${c.type} must explain itself`).toBe("string");
    }
  });
});
