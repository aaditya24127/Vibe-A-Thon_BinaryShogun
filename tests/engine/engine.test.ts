import { describe, expect, it } from "vitest";
import { allocate, verifyPlan, optionsForRider, type AllocInput } from "@/lib/engine/allocate";
import { checkCompatibility } from "@/lib/engine/compatibility";
import { haversineKm } from "@/lib/engine/geo";
import { planReroute } from "@/lib/engine/reroute";
import { decideSweep } from "@/lib/engine/sweep";
import { assess, safeByMs } from "@/lib/engine/time";
import { STATE_LABEL, riderStatus } from "@/lib/engine/labels";
import { buildSeedSnapshot } from "@/lib/seedSnapshot";
import type { Allocation, Batch, Lease, Rider, Shelter } from "@/lib/types";

const NOW = Date.parse("2026-10-23T10:00:00Z");
const snap = () => buildSeedSnapshot(NOW);

function input(over: Partial<AllocInput> = {}): AllocInput {
  const s = snap();
  return { batches: s.batches, donors: s.donors, shelters: s.shelters, riders: s.riders, leases: [], allocations: [], rules: s.rules, settings: s.settings, now: NOW, ...over };
}

const meals = (over: Partial<Batch> = {}): Batch => ({ ...snap().batches[0], ...over });
const only = (b: Batch): Pick<AllocInput, "batches"> => ({ batches: [b] });
const shelter = (id: string, unmet: number, over: Partial<Shelter> = {}): Shelter => ({
  ...snap().shelters[1], id, name: `Shelter ${id}`, unmet_demand: unmet, total_capacity: 200, ...over,
});
const rider = (id: string, cap: number, over: Partial<Rider> = {}): Rider => ({ ...snap().riders[0], id, name: id, capacity_units: cap, ...over });
const sum = (xs: { quantity: number }[]) => xs.reduce((n, x) => n + x.quantity, 0);

describe("geo and time", () => {
  it("haversine is about 111 km per degree of latitude", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });
  it("safe-by is expiry minus transit minus buffer", () => {
    const s = snap();
    const b = s.batches[0];
    const donor = s.donors.find((d) => d.id === b.donor_id)!;
    const safe = safeByMs(b, donor, s.shelters, s.settings);
    expect(safe).toBeLessThan(Date.parse(b.expires_at) - (s.settings.safety_buffer_min + s.settings.pickup_allowance_min) * 60000 + 1);
  });
  it("a traffic delay lowers slack and can flip feasibility", () => {
    const s = snap();
    const batch = s.batches[1]; // 80 minute window
    const donor = s.donors.find((d) => d.id === batch.donor_id)!;
    const sh = s.shelters[0];
    const base = assess({ batch, donor, shelter: sh, from: s.riders[2], viaDonor: true, offsetMin: 0, now: NOW, settings: s.settings });
    const late = assess({ batch, donor, shelter: sh, from: s.riders[2], viaDonor: true, offsetMin: 70, now: NOW, settings: s.settings });
    expect(late.slackMin).toBeLessThan(base.slackMin - 69);
    expect(late.feasibility).toBe("infeasible");
  });
});

describe("compatibility", () => {
  const s = snap();
  it("blocks on a verified rule", () => {
    const r = checkCompatibility("ration_kit", s.shelters[2], s.rules); // SH-3 no fuel
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Blocked/);
  });
  it("flags on an unverified rule", () => {
    const r = checkCompatibility("medical", s.shelters[3], s.rules); // SH-4 no cold storage
    expect(r.ok).toBe(true);
    expect(r.flag).toMatch(/pending verification/);
  });
  it("closed shelters and unaccepted categories are ineligible", () => {
    expect(checkCompatibility("cooked_food", { ...s.shelters[1], status: "closed" }, s.rules).ok).toBe(false);
    expect(checkCompatibility("ration_kit", s.shelters[0], s.rules).ok).toBe(false);
  });
});

describe("allocation", () => {
  const cooked = (qty: number, expiresMin = 240): Batch => meals({ remaining_qty: qty, quantity: qty, expires_at: new Date(NOW + expiresMin * 60000).toISOString(), safe_by_at: new Date(NOW + (expiresMin - 40) * 60000).toISOString() });
  const fleet = (n: number, cap = 40) => Array.from({ length: n }, (_, i) => rider(`R${i + 1}`, cap, { lat: 18.5287 + i * 0.001, lng: 73.8446 }));
  const abc = [shelter("A", 50), shelter("B", 70), shelter("C", 60)].map((s, i) => ({ ...s, lat: 18.52 + i * 0.01, lng: 73.85 }));

  it("success: a single batch is placed and verified", () => {
    const inp = input(only(cooked(30)));
    const plan = allocate(inp);
    expect(sum(plan.assignments)).toBe(30);
    expect(plan.unresolved).toEqual([]);
    expect(verifyPlan(inp, plan)).toEqual([]);
  });

  it("180 meals, rider capacity 40, shelters 50/70/60: splits without exceeding anything", () => {
    const inp = input({ ...only(cooked(180)), shelters: abc, riders: fleet(6) });
    const plan = allocate(inp);
    expect(sum(plan.assignments) + sum(plan.unresolved)).toBe(180);
    expect(sum(plan.assignments)).toBe(180);
    expect(plan.assignments.every((a) => a.quantity <= 40)).toBe(true);
    for (const s of abc) expect(sum(plan.assignments.filter((a) => a.shelter_id === s.id))).toBeLessThanOrEqual(s.unmet_demand);
    expect(verifyPlan(inp, plan)).toEqual([]);
  });

  it("partial: too few riders leaves an unresolved quantity with a reason", () => {
    const inp = input({ ...only(cooked(180)), shelters: abc, riders: fleet(2) });
    const plan = allocate(inp);
    expect(sum(plan.assignments)).toBe(80);
    expect(sum(plan.unresolved)).toBe(100);
    expect(plan.unresolved[0].reason).toMatch(/No rider capacity/);
    expect(sum(plan.assignments) + sum(plan.unresolved)).toBe(180);
  });

  it("infeasible: a batch that cannot arrive in time is unresolved, not allocated", () => {
    const b = cooked(40, 12);
    const plan = allocate(input({ ...only(b), shelters: abc, riders: fleet(2) }));
    expect(plan.assignments).toEqual([]);
    expect(plan.unresolved[0]).toMatchObject({ quantity: 40 });
    expect(plan.unresolved[0].reason).toMatch(/Too far for the safe window/);
  });

  it("demand limit: total shelter demand caps the allocation", () => {
    const inp = input({ ...only(cooked(180)), shelters: [shelter("A", 50), shelter("B", 30)], riders: fleet(6) });
    const plan = allocate(inp);
    expect(sum(plan.assignments)).toBe(80);
    expect(plan.unresolved[0].reason).toMatch(/unmet demand/);
    expect(verifyPlan(inp, plan)).toEqual([]);
  });

  it("capacity limit: a rider never carries more than its free capacity", () => {
    const inp = input({ ...only(cooked(100)), shelters: abc, riders: fleet(1, 40) });
    const plan = allocate(inp);
    expect(sum(plan.assignments)).toBe(40);
    expect(plan.assignments.length).toBe(1);
  });

  it("incompatibility: verified failure is never allocated and is explained", () => {
    const s = snap();
    const kit = s.batches.find((b) => b.category === "ration_kit")!;
    const plan = allocate(input({ ...only(kit), shelters: [s.shelters[2]] }));
    expect(plan.assignments).toEqual([]);
    expect(plan.unresolved[0].reason).toMatch(/Missing resource/);
  });

  it("unverified failure is allocated but flagged at risk", () => {
    const s = snap();
    const med = s.batches.find((b) => b.item_name.startsWith("Oral"))!;
    const plan = allocate(input({ ...only(med), shelters: [s.shelters[3]] }));
    expect(plan.assignments.length).toBeGreaterThan(0);
    expect(plan.assignments[0].flag).toMatch(/pending verification/);
    expect(plan.assignments[0].feasibility).toBe("at_risk");
  });

  it("orders batches by remaining safe minutes", () => {
    const plan = allocate(input());
    const first = plan.assignments[0];
    expect(first.batch_id).toBe("FD-1036");
  });

  it("FairShare prefers the shelter with the larger unmet share when equally near", () => {
    const small = shelter("S", 20, { lat: 18.5, lng: 73.8 });
    const big = shelter("T", 90, { lat: 18.5, lng: 73.8 });
    const b = cooked(30);
    const withFair = allocate(input({ ...only(b), shelters: [small, big], riders: fleet(1), fairShare: true }));
    const without = allocate(input({ ...only(b), shelters: [small, big], riders: fleet(1), fairShare: false }));
    expect(withFair.assignments[0].shelter_id).toBe("T");
    expect(without.assignments[0].shelter_id).toBe("S");
  });

  it("never invents allocations for offline riders", () => {
    const stale = fleet(3).map((r) => ({ ...r, last_heartbeat_at: new Date(NOW - 10 * 60000).toISOString() }));
    const plan = allocate(input({ ...only(cooked(30)), riders: stale }));
    expect(plan.assignments).toEqual([]);
    expect(plan.unresolved[0].reason).toMatch(/No rider capacity/);
  });

  it("rider options are ranked by remaining safe time", () => {
    const opts = optionsForRider(input(), "RD-1");
    expect(opts.length).toBeGreaterThan(1);
    for (let i = 1; i < opts.length; i++) expect(opts[i].remainingSafeMin).toBeGreaterThanOrEqual(opts[i - 1].remainingSafeMin);
  });
});

describe("reroute", () => {
  function setup(opts: { status?: Allocation["status"]; shelters?: Shelter[] } = {}) {
    const s = snap();
    const batch = { ...s.batches[0], remaining_qty: 0 };
    const allocation: Allocation = { id: "AL-1", batch_id: batch.id, shelter_id: "SH-1", quantity: 40, feasibility: "feasible", blocking_reason: null, status: opts.status ?? "IN_TRANSIT", created_at: "", updated_at: "" };
    const lease: Lease = { id: "LS-1", allocation_id: "AL-1", rider_id: "RD-1", quantity: 40, claimed_at: "", ack_deadline: "", last_heartbeat_at: "", custody: "confirmed", status: allocation.status, eta_at: null, delay_min: 0 };
    return { allocation, lease, batch, donor: s.donors.find((d) => d.id === batch.donor_id)!, rider: s.riders[0], shelters: opts.shelters ?? s.shelters, allocations: [allocation], rules: s.rules, settings: s.settings, now: NOW };
  }

  it("places the whole quantity when alternatives exist", () => {
    const plan = planReroute(setup(), 40);
    expect(plan.moved).toBe(40);
    expect(plan.unresolvedQty).toBe(0);
    expect(plan.pieces.every((p) => p.shelter_id !== "SH-1" && p.feasibility !== "infeasible")).toBe(true);
  });

  it("places part and reports the rest when room is limited", () => {
    const s = snap();
    const shelters = s.shelters.map((x) => (x.id === "SH-1" ? { ...x, status: "closed" as const } : { ...x, unmet_demand: x.id === "SH-2" ? 25 : 0 }));
    const plan = planReroute(setup({ shelters }), 40);
    expect(plan.moved).toBe(25);
    expect(plan.unresolvedQty).toBe(15);
    expect(plan.unresolvedReason).toMatch(/unmet demand/);
    expect(plan.moved + plan.unresolvedQty).toBe(40);
  });

  it("reports why when nothing is open", () => {
    const shelters = snap().shelters.map((x) => ({ ...x, status: "closed" as const }));
    const plan = planReroute(setup({ shelters }), 40);
    expect(plan.moved).toBe(0);
    expect(plan.unresolvedReason).toBe("No other shelter is open");
  });
});

describe("sweep decisions", () => {
  const b = (id: string, expMin: number, status: Batch["status"] = "AVAILABLE"): Batch => ({ ...snap().batches[0], id, status, expires_at: new Date(NOW + expMin * 60000).toISOString() });
  const l = (id: string, status: Lease["status"], ackOffsetSec: number): Lease => ({
    id, allocation_id: `A-${id}`, rider_id: "RD-1", quantity: 10, claimed_at: "", last_heartbeat_at: "", custody: "none", status, eta_at: null, delay_min: 0,
    ack_deadline: new Date(NOW + ackOffsetSec * 1000).toISOString(),
  });
  it("releases an overdue lease with no pickup", () => {
    const d = decideSweep({ batches: [b("B", 60)], leases: [l("1", "RESERVED", -10)], now: NOW });
    expect(d.release).toEqual(["1"]);
    expect(d.custodyUncertain).toEqual([]);
  });
  it("marks custody uncertain after pickup and never releases", () => {
    const d = decideSweep({ batches: [b("B", 60)], leases: [l("1", "PICKUP_CONFIRMED", -10), l("2", "IN_TRANSIT", -10)], now: NOW });
    expect(d.release).toEqual([]);
    expect(d.custodyUncertain).toEqual(["1", "2"]);
  });
  it("leaves leases within their deadline alone", () => {
    const d = decideSweep({ batches: [b("B", 60)], leases: [l("1", "RESERVED", 20)], now: NOW });
    expect(d.release.length + d.custodyUncertain.length).toBe(0);
  });
  it("expires batches past their time", () => {
    expect(decideSweep({ batches: [b("B", -1), b("C", 5), b("D", -1, "DELIVERED")], leases: [], now: NOW }).expireBatches).toEqual(["B"]);
  });
});

describe("labels", () => {
  it("status text never says delivered for anything but DELIVERED", () => {
    for (const [k, v] of Object.entries(STATE_LABEL)) if (k !== "DELIVERED") expect(v.toLowerCase()).not.toContain("delivered");
  });
  it("a rider with no heartbeat is shown offline", () => {
    const s = snap();
    const r = { ...s.riders[0], last_heartbeat_at: new Date(NOW - 5 * 60000).toISOString() };
    expect(riderStatus(r, [], [], NOW, s.settings)).toBe("Offline or disconnected");
  });
});
