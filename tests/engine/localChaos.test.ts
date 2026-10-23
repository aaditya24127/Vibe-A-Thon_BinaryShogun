import { describe, expect, it } from "vitest";
import { applyLocal, assignLocal } from "@/lib/localChaos";
import { buildSeedSnapshot } from "@/lib/seedSnapshot";
import { reservedByShelter, committedByRider } from "@/lib/engine/state";

const NOW = Date.parse("2026-10-23T10:00:00Z");
const base = () => buildSeedSnapshot(NOW);

function accounted(s: ReturnType<typeof base>, batchId: string) {
  const b = s.batches.find((x) => x.id === batchId)!;
  const alloc = s.allocations.filter((a) => a.batch_id === batchId && ["RESERVED", "PICKUP_CONFIRMED", "IN_TRANSIT", "CUSTODY_UNCERTAIN", "REROUTING", "DELIVERED"].includes(a.status)).reduce((n, a) => n + a.quantity, 0);
  const un = s.unresolved.filter((u) => u.batch_id === batchId).reduce((n, u) => n + u.quantity, 0);
  return b.remaining_qty + alloc + un;
}

describe("local chaos mode keeps the same invariants as the database", () => {
  it("shelter closure reroutes and accounts for every unit", () => {
    const s = base();
    assignLocal(s, "FD-1035", "SH-2", "RD-3", 40);
    const out = applyLocal(s, { kind: "close_shelter", shelterId: "SH-2" });
    expect(out.snap.shelters.find((x) => x.id === "SH-2")!.status).toBe("closed");
    expect(out.snap.allocations.find((a) => a.shelter_id === "SH-2" && a.status === "RESERVED")).toBeUndefined();
    expect(accounted(out.snap, "FD-1035")).toBe(180);
    expect(out.response).toMatch(/rerouted/);
  });

  it("closing every shelter leaves an unresolved record with a reason", () => {
    let s = base();
    assignLocal(s, "FD-1035", "SH-2", "RD-3", 40);
    for (const id of ["SH-1", "SH-3", "SH-4", "SH-5", "SH-2"]) s = applyLocal(s, { kind: "close_shelter", shelterId: id }).snap;
    const u = s.unresolved.filter((x) => x.batch_id === "FD-1035");
    expect(u.reduce((n, x) => n + x.quantity, 0)).toBe(40);
    expect(u[0].reason).toMatch(/No other shelter is open/);
    expect(accounted(s, "FD-1035")).toBe(180);
  });

  it("fulfilling demand reroutes only the oversubscribed part", () => {
    const s = base();
    assignLocal(s, "FD-1041", "SH-1", "RD-4", 40);
    const out = applyLocal(s, { kind: "fulfil_shelter", shelterId: "SH-1" });
    expect(reservedByShelter(out.snap.allocations).get("SH-1") ?? 0).toBe(0);
    expect(accounted(out.snap, "FD-1041")).toBe(90);
  });

  it("a silent rider's uncollected lease is released and reassigned after the clock advances", () => {
    let s = base();
    assignLocal(s, "FD-1036", "SH-1", "RD-3", 30);
    s = applyLocal(s, { kind: "silent", riderId: "RD-3" }).snap;
    const out = applyLocal(s, { kind: "advance", minutes: 5 });
    expect(out.snap.allocations.find((a) => a.status === "RELEASED")).toBeDefined();
    const fresh = out.snap.allocations.filter((a) => a.batch_id === "FD-1036" && a.status === "RESERVED");
    expect(fresh.length).toBeGreaterThan(0);
    for (const a of fresh) expect(out.snap.leases.find((l) => l.allocation_id === a.id)!.rider_id).not.toBe("RD-3");
    expect(out.snap.riders.find((r) => r.id === "RD-3")!.release_count).toBe(1);
  });

  it("capacity reduction never leaves a rider over capacity", () => {
    const s = base();
    assignLocal(s, "FD-1035", "SH-2", "RD-1", 40);
    const out = applyLocal(s, { kind: "reduce_capacity", riderId: "RD-1", capacity: 10 });
    expect(committedByRider(out.snap.leases).get("RD-1") ?? 0).toBeLessThanOrEqual(10);
    expect(accounted(out.snap, "FD-1035")).toBe(180);
  });

  it("a long delay updates ETA or reroutes", () => {
    const s = base();
    assignLocal(s, "FD-1036", "SH-1", "RD-3", 30);
    const out = applyLocal(s, { kind: "delay", riderId: "RD-3", minutes: 70 });
    expect(out.snap.allocations.find((a) => a.batch_id === "FD-1036" && ["RELEASED", "UNRESOLVED"].includes(a.status))).toBeDefined();
  });

  it("removing water reroutes a verified-incompatible ration kit", () => {
    const s = base();
    assignLocal(s, "FD-1038", "SH-2", "RD-1", 20);
    const out = applyLocal(s, { kind: "remove_water", shelterId: "SH-2" });
    expect(out.snap.allocations.find((a) => a.shelter_id === "SH-2" && a.status === "RESERVED")).toBeUndefined();
    expect(accounted(out.snap, "FD-1038")).toBe(40);
  });

  it("never mutates the mirror it was given, and never produces a delivered allocation", () => {
    const s = base();
    assignLocal(s, "FD-1036", "SH-1", "RD-3", 30);
    const copy = JSON.stringify(s);
    const out = applyLocal(s, { kind: "advance", minutes: 30 });
    expect(JSON.stringify(s)).toBe(copy);
    expect(out.snap.allocations.some((a) => a.status === "DELIVERED")).toBe(false);
  });
});
