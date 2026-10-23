import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, rpc, rows, aid } from "./harness";
import { readFileSync } from "node:fs";
import path from "node:path";

let db: PGlite;
beforeEach(async () => { db = await freshDb(); });

const claim = (b: string, s: string, r: string, q: number) => rpc(db, "claim_lease", [b, s, r, q]);

/** Every batch must account for its full quantity: pool + live/delivered allocations + unresolved. */
async function invariantViolations() {
  const all = await rows(db, `
    select b.id, b.quantity,
      b.remaining_qty
      + coalesce((select sum(quantity) from allocations a where a.batch_id=b.id and a.status in ('RESERVED','PICKUP_CONFIRMED','IN_TRANSIT','CUSTODY_UNCERTAIN','REROUTING','DELIVERED','CANCELLED')),0)
      + coalesce((select sum(quantity) from unresolved u where u.batch_id=b.id),0) as accounted
    from batches b where b.status <> 'EXPIRED'`);
  return all.filter((r) => Number(r.accounted) !== Number(r.quantity));
}

describe("judge 1: expiring donation", () => {
  it("short-window batch is urgent and has a feasible allocation", async () => {
    const [b] = await rows(db, "select * from batches where id='FD-1036'");
    expect(new Date(b.safe_by_at).getTime()).toBeLessThan(new Date(b.expires_at).getTime());
    const r = await claim("FD-1036", "SH-1", "RD-3", 30);
    expect(r.success).toBe(true);
    expect(["feasible", "at_risk"]).toContain(r.feasibility);
    expect(new Date(r.eta).getTime()).toBeLessThan(new Date(b.expires_at).getTime());
  });
  it("rejects an arrival after the safe-by limit", async () => {
    await rpc(db, "advance_time", [70]);
    const r = await claim("FD-1036", "SH-1", "RD-3", 30);
    expect(r.success).toBe(false);
  });
});

describe("judge 2: batch splitting", () => {
  it("never exceeds rider capacity, shelter demand, or the original quantity", async () => {
    const plan: [string, string, number][] = [["RD-1", "SH-1", 40], ["RD-2", "SH-1", 20], ["RD-3", "SH-2", 40], ["RD-4", "SH-2", 40], ["RD-5", "SH-2", 20], ["RD-6", "SH-3", 20]];
    for (const [r, s, q] of plan) expect((await claim("FD-1035", s, r, q)).success, `${r}->${s}`).toBe(true);
    expect((await claim("FD-1035", "SH-1", "RD-1", 10)).success).toBe(false);
    const [b] = await rows(db, "select remaining_qty from batches where id='FD-1035'");
    expect(b.remaining_qty).toBe(0);
    expect(await invariantViolations()).toEqual([]);
    expect(await rows(db, "select s.id from shelters s where _reserved(s.id) > s.unmet_demand")).toEqual([]);
  });
  it("rejects a claim larger than the shelter still needs", async () => {
    expect((await claim("FD-1035", "SH-5", "RD-1", 40)).success).toBe(true);
    const r = await claim("FD-1035", "SH-5", "RD-2", 10);
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/needs only 0 more/);
  });
});

describe("judge 3: ghost reservation", () => {
  it("releases and reassigns an uncollected lease", async () => {
    const c = await claim("FD-1036", "SH-1", "RD-3", 30);
    await rpc(db, "set_rider_silent", ["RD-3", true]);
    const adv = await rpc(db, "advance_time", [5]);
    expect(adv.released).toBe(1);
    expect(adv.recovered).toBe(1);
    const [old] = await rows(db, "select status from allocations where id=$1", [c.allocation_id]);
    expect(old.status).toBe("RELEASED");
    const fresh = await rows(db, "select l.rider_id from allocations a join leases l on l.allocation_id=a.id where a.batch_id='FD-1036' and a.status='RESERVED'");
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((f) => f.rider_id !== "RD-3")).toBe(true);
    const [rd] = await rows(db, "select release_count from riders where id='RD-3'");
    expect(rd.release_count).toBe(1);
    expect(await invariantViolations()).toEqual([]);
  });
  it("marks a collected lease custody uncertain and does not reassign it", async () => {
    const c = await claim("FD-1035", "SH-2", "RD-1", 40);
    expect((await rpc(db, "confirm_pickup", [c.lease_id])).success).toBe(true);
    await rpc(db, "set_rider_silent", ["RD-1", true]);
    const adv = await rpc(db, "advance_time", [5]);
    expect(adv.custody_uncertain).toBe(1);
    const [a] = await rows(db, "select status from allocations where id=$1", [c.allocation_id]);
    expect(a.status).toBe("CUSTODY_UNCERTAIN");
    const [l] = await rows(db, "select custody, status from leases where id=$1", [c.lease_id]);
    expect(l).toMatchObject({ custody: "uncertain", status: "CUSTODY_UNCERTAIN" });
    const [b] = await rows(db, "select remaining_qty, status from batches where id='FD-1035'");
    expect(b.remaining_qty).toBe(140);
    expect(b.status).toBe("CUSTODY_UNCERTAIN");
  });
  it("sweep is idempotent", async () => {
    await claim("FD-1036", "SH-1", "RD-3", 30);
    await rpc(db, "set_rider_silent", ["RD-3", true]);
    await rpc(db, "advance_time", [5]);
    const before = (await rows(db, "select count(*)::int c from allocations"))[0].c;
    const again = await rpc(db, "sweep_leases");
    expect(again.released).toBe(0);
    expect((await rows(db, "select count(*)::int c from allocations"))[0].c).toBe(before);
  });
});

describe("judge 4: demand fulfilled in transit", () => {
  it("recalculates and partially reallocates or records unresolved", async () => {
    const c = await claim("FD-1041", "SH-1", "RD-4", 40);
    await rpc(db, "confirm_pickup", [c.lease_id]);
    await rpc(db, "mark_in_transit", [c.lease_id]);
    const r = await rpc(db, "set_shelter_demand", ["SH-1", 0, "Fulfilled from another source"]);
    expect(r.success).toBe(true);
    const rr = r.reroutes[0];
    expect(rr.moved + rr.unresolved_qty).toBe(40);
    for (const p of rr.pieces) {
      expect(p.feasibility).not.toBe("infeasible");
      expect(p.shelter_id).not.toBe("SH-1");
    }
    expect(await invariantViolations()).toEqual([]);
  });
  it("only moves the oversubscribed part", async () => {
    const c = await claim("FD-1041", "SH-1", "RD-4", 40);
    await rpc(db, "set_shelter_demand", ["SH-1", 25, "Partly met elsewhere"]);
    const [a] = await rows(db, "select quantity from allocations where id=$1", [c.allocation_id]);
    expect(a.quantity).toBe(25);
    expect(await invariantViolations()).toEqual([]);
  });
});

describe("judge 5: shelter closure", () => {
  it("finds alternatives for affected leases", async () => {
    await claim("FD-1035", "SH-2", "RD-3", 40);
    const r = await rpc(db, "set_shelter_status", ["SH-2", "closed", "Flooding"]);
    expect(r.reroutes[0].moved).toBe(40);
    expect(r.reroutes[0].pieces[0].shelter_id).not.toBe("SH-2");
  });
  it("reports why recovery is impossible when nothing else is open", async () => {
    await claim("FD-1035", "SH-2", "RD-3", 40);
    for (const s of ["SH-1", "SH-3", "SH-4", "SH-5"]) await rpc(db, "set_shelter_status", [s, "closed", "Closed"]);
    const r = await rpc(db, "set_shelter_status", ["SH-2", "closed", "Closed"]);
    expect(r.reroutes[0].moved).toBe(0);
    expect(r.reroutes[0].unresolved_reason).toMatch(/No other shelter is open/);
    const u = await rows(db, "select * from unresolved where batch_id='FD-1035'");
    expect(u[0].quantity).toBe(40);
    expect(await invariantViolations()).toEqual([]);
  });
});

describe("judge 6: supply incompatibility", () => {
  it("a verified failure blocks the claim", async () => {
    const r = await claim("FD-1038", "SH-3", "RD-1", 20);
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/Blocked/);
    expect(r.reason).toMatch(/cooking fuel/);
  });
  it("an unverified failure is flagged, not silently passed", async () => {
    const r = await claim("FD-1037", "SH-4", "RD-4", 20);
    expect(r.success).toBe(true);
    expect(r.feasibility).toBe("at_risk");
    const [a] = await rows(db, "select blocking_reason from allocations where id=$1", [r.allocation_id]);
    expect(a.blocking_reason).toMatch(/Rule pending verification/);
  });
  it("removing water from a shelter reroutes verified-incompatible leases", async () => {
    const c = await claim("FD-1038", "SH-2", "RD-1", 20);
    expect(c.success).toBe(true);
    const r = await rpc(db, "set_shelter_resources", ["SH-2", false, true, true, ["cooked_food", "medical", "ration_kit", "infant_formula", "essential_kit"], "Water supply cut"]);
    expect(r.reroutes.length).toBe(1);
    const [a] = await rows(db, "select status from allocations where id=$1", [c.allocation_id]);
    expect(["RELEASED", "UNRESOLVED"]).toContain(a.status);
  });
});

describe("judge 7: rider delay", () => {
  it("updates ETA and feasibility", async () => {
    const c = await claim("FD-1036", "SH-1", "RD-3", 30);
    const [before] = await rows(db, "select eta_at from leases where id=$1", [c.lease_id]);
    const r = await rpc(db, "report_traffic_delay", ["RD-3", 20]);
    expect(r.success).toBe(true);
    const [after] = await rows(db, "select eta_at, delay_min from leases where id=$1", [c.lease_id]);
    expect(new Date(after.eta_at).getTime() - new Date(before.eta_at).getTime()).toBeGreaterThan(19 * 60000);
    expect(after.delay_min).toBe(20);
  });
  it("reroutes when the delay breaks feasibility", async () => {
    const c = await claim("FD-1036", "SH-1", "RD-3", 30);
    const r = await rpc(db, "report_traffic_delay", ["RD-3", 70]);
    expect(r.leases.length).toBe(1);
    const [a] = await rows(db, "select status from allocations where id=$1", [c.allocation_id]);
    expect(["RELEASED", "UNRESOLVED"]).toContain(a.status);
  });
});

describe("judge 9: honest delivery", () => {
  it("DELIVERED is written only by confirm_delivery", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/0003_functions.sql"), "utf8");
    expect((sql.match(/_set_alloc\([^;]*'DELIVERED'/g) ?? []).length).toBe(1);
    expect(sql.match(/set status = 'DELIVERED'/g)).toBeNull();
    const start = sql.indexOf("create or replace function confirm_delivery");
    const end = sql.indexOf("create or replace function resolve_custody");
    expect(sql.slice(start, end)).toMatch(/_set_alloc\(a\.id, 'DELIVERED'/);
  });
  it("refuses delivery unless in transit, with a valid quantity, within expiry", async () => {
    const c = await claim("FD-1036", "SH-1", "RD-3", 30);
    expect((await rpc(db, "confirm_delivery", [c.lease_id, 30])).success).toBe(false);
    await rpc(db, "confirm_pickup", [c.lease_id]);
    await rpc(db, "mark_in_transit", [c.lease_id]);
    expect((await rpc(db, "confirm_delivery", [c.lease_id, 0])).success).toBe(false);
    expect((await rpc(db, "confirm_delivery", [c.lease_id, 31])).success).toBe(false);
    const ok = await rpc(db, "confirm_delivery", [c.lease_id, 28]);
    expect(ok.success).toBe(true);
    expect(ok.shortfall).toBe(2);
    const [s] = await rows(db, "select unmet_demand from shelters where id='SH-1'");
    expect(s.unmet_demand).toBe(60 - 28);
    expect((await rows(db, "select quantity from unresolved where batch_id='FD-1036'"))[0].quantity).toBe(2);
    expect(await invariantViolations()).toEqual([]);
  });
  it("an expired batch cannot be delivered", async () => {
    const c = await claim("FD-1036", "SH-1", "RD-3", 30);
    await rpc(db, "confirm_pickup", [c.lease_id]);
    await rpc(db, "mark_in_transit", [c.lease_id]);
    await rpc(db, "advance_time", [85]);
    const r = await rpc(db, "confirm_delivery", [c.lease_id, 30]);
    expect(r.success).toBe(false);
    expect((await rows(db, "select status from batches where id='FD-1036'"))[0].status).toBe("EXPIRED");
  });
});

describe("rpc plumbing", () => {
  it("repeated action ids are ignored", async () => {
    const id = aid("dup");
    const a = (await db.query<{ r: any }>("select claim_lease($1,'FD-1036','SH-1','RD-3',10) as r", [id])).rows[0].r;
    const b = (await db.query<{ r: any }>("select claim_lease($1,'FD-1036','SH-1','RD-3',10) as r", [id])).rows[0].r;
    expect(a.success).toBe(true);
    expect(b.duplicate).toBe(true);
    expect((await rows(db, "select count(*)::int c from allocations"))[0].c).toBe(1);
  });
  it("rejects a second claim when everything is taken", async () => {
    await claim("FD-1036", "SH-1", "RD-3", 40);
    await claim("FD-1036", "SH-3", "RD-1", 20);
    const r = await claim("FD-1036", "SH-1", "RD-2", 10);
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/Already taken/);
  });
  it("capacity reduction trims reservations", async () => {
    await claim("FD-1035", "SH-2", "RD-1", 40);
    const r = await rpc(db, "set_rider_capacity", ["RD-1", 10, "Vehicle fault"]);
    expect(r.trimmed).toBe(30);
    expect(await invariantViolations()).toEqual([]);
  });
  it("create_batch computes safe_by from settings and validates", async () => {
    const r = await rpc(db, "create_batch", ["DN-1", "Soup", "cooked_food", 50, "meals", 0, 20, 60, "", "", ""]);
    expect(r.success).toBe(true);
    const [b] = await rows(db, "select * from batches where id=$1", [r.batch_id]);
    expect(new Date(b.safe_by_at).getTime()).toBeLessThan(new Date(b.expires_at).getTime() - 15 * 60000);
    expect((await rpc(db, "create_batch", ["DN-1", "Soup", "cooked_food", 0, "meals", 0, 20, 60, "", "", ""])).success).toBe(false);
  });
  it("reset restores the seeded state", async () => {
    await claim("FD-1036", "SH-1", "RD-3", 30);
    await rpc(db, "advance_time", [30]);
    await rpc(db, "reset_simulation");
    expect((await rows(db, "select count(*)::int c from allocations"))[0].c).toBe(0);
    expect(Number((await rows(db, "select value from settings where key='clock_offset_min'"))[0].value)).toBe(0);
  });
  it("simulated ticks move riders but never change delivery state", async () => {
    const c = await claim("FD-1036", "SH-1", "RD-3", 30);
    const [before] = await rows(db, "select lat from riders where id='RD-3'");
    await rpc(db, "simulate_tick", [5]);
    const [after] = await rows(db, "select lat from riders where id='RD-3'");
    expect(after.lat).not.toBe(before.lat);
    expect((await rows(db, "select status from allocations where id=$1", [c.allocation_id]))[0].status).toBe("RESERVED");
  });
});
