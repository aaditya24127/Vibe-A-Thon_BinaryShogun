import { describe, expect, it } from "vitest";
import { decideSweep } from "@/lib/engine/sweep";
import { freshDb, rpc, rows } from "./harness";

const j = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("sweep: engine decision logic and database agree on the same fixtures", () => {
  it("release, custody-uncertain and expiry decisions match", async () => {
    const db = await freshDb();
    // Three leases: A uncollected (will go silent), B collected (will go silent), C healthy.
    const a = await rpc(db, "claim_lease", ["FD-1036", "SH-1", "RD-3", 20]);
    const b = await rpc(db, "claim_lease", ["FD-1035", "SH-2", "RD-1", 40]);
    const c = await rpc(db, "claim_lease", ["FD-1041", "SH-3", "RD-4", 30]);
    await rpc(db, "confirm_pickup", [b.lease_id]);
    await rpc(db, "set_rider_silent", ["RD-3", true]);
    await rpc(db, "set_rider_silent", ["RD-1", true]);
    // Move the clock without sweeping, keeping responsive riders alive, as advance_time does.
    await db.exec(`
      update settings set value = value + 5 where key = 'clock_offset_min';
      update riders set last_heartbeat_at = sim_now() where not sim_silent;
      update leases set ack_deadline = sim_now() + _ack_window() where rider_id in (select id from riders where not sim_silent);`);
    const now = Date.parse((await rows(db, "select sim_now() as t"))[0].t);
    const snap = {
      batches: j(await rows(db, "select * from batches")),
      leases: j(await rows(db, "select * from leases")),
      allocations: j(await rows(db, "select * from allocations")),
    };
    const decision = decideSweep({ ...snap, now });
    expect(decision.release).toEqual([a.lease_id]);
    expect(decision.custodyUncertain).toEqual([b.lease_id]);
    expect(decision.expireBatches).toEqual([]);

    const res = await rpc(db, "sweep_leases");
    expect(res.released).toBe(decision.release.length);
    expect(res.custody_uncertain).toBe(decision.custodyUncertain.length);
    const st = Object.fromEntries((await rows(db, "select id, status from leases")).map((r) => [r.id, r.status]));
    expect(st[a.lease_id]).toBe("RELEASED");
    expect(st[b.lease_id]).toBe("CUSTODY_UNCERTAIN");
    expect(st[c.lease_id]).toBe("RESERVED");
  });

  it("expiry decisions match", async () => {
    const db = await freshDb();
    await db.exec("update settings set value = 85 where key = 'clock_offset_min'");
    const now = Date.parse((await rows(db, "select sim_now() as t"))[0].t);
    const decision = decideSweep({ batches: j(await rows(db, "select * from batches")), leases: [], now });
    const res = await rpc(db, "sweep_leases");
    expect(res.expired_batches).toBe(decision.expireBatches.length);
    const expired = (await rows(db, "select id from batches where status='EXPIRED' order by id")).map((r) => r.id);
    expect(expired).toEqual([...decision.expireBatches].sort());
  });
});
