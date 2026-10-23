import { describe, expect, it } from "vitest";
import { pointAt, polyLength, splitPoly, STAGES, useSim, type LatLng } from "@/lib/sim";

const poly: LatLng[] = [[18.5, 73.8], [18.52, 73.82], [18.54, 73.84]];

function seeded(scenario: "normal" | "delayed" | "reroute" | "failed_pickup") {
  useSim.getState().reset();
  useSim.setState({
    active: true, running: true, speed: 4, scenario, stage: "ready", progress: 0, stageMs: 0, rider: "Sim Rider A", events: [], flags: {},
    donor: { id: "D", name: "Donor", lat: 18.5, lng: 73.8 }, shelter: { id: "S", name: "Shelter", lat: 18.54, lng: 73.84 }, altShelter: { id: "A", name: "Alt", lat: 18.51, lng: 73.9 },
    legPickup: [[18.48, 73.78], [18.5, 73.8]], legDeliver: poly, pos: [18.48, 73.78],
  });
}
const run = (n: number) => { for (let i = 0; i < n; i++) useSim.getState().tick(100); };

describe("simulation", () => {
  it("interpolates along the polyline, ends at its end points and splits completed from remaining", () => {
    expect(pointAt(poly, 0)).toEqual(poly[0]);
    expect(pointAt(poly, 1)).toEqual(poly[2]);
    const mid = pointAt(poly, 0.5);
    expect(mid[0]).toBeGreaterThan(18.5); expect(mid[0]).toBeLessThan(18.54);
    const { done, rest } = splitPoly(poly, 0.5);
    expect(polyLength(done) + polyLength(rest)).toBeCloseTo(polyLength(poly), 3);
  });

  it("normal scenario walks every stage in order and ends at receipt, never skipping", () => {
    seeded("normal");
    useSim.setState({ events: [] });
    const seen: string[] = [useSim.getState().stage];
    for (let i = 0; i < 2000 && useSim.getState().stage !== "receipt"; i++) { run(1); const s = useSim.getState().stage; if (seen[seen.length - 1] !== s) seen.push(s); }
    expect(seen).toEqual(STAGES.map((s) => s.id));
    expect(useSim.getState().events.length).toBeGreaterThanOrEqual(7);
  });

  it("reroute and failed pickup scenarios log their disruption and still deliver", () => {
    for (const sc of ["reroute", "failed_pickup", "delayed"] as const) {
      seeded(sc);
      for (let i = 0; i < 3000 && useSim.getState().stage !== "receipt"; i++) run(1);
      const titles = useSim.getState().events.map((e) => e.title).join("|");
      expect(useSim.getState().stage).toBe("receipt");
      expect(titles).toMatch(sc === "reroute" ? /rerouted/ : sc === "failed_pickup" ? /Pickup failed/ : /Delay reported/);
    }
  });

  it("pause stops movement and reset clears state without any backend call", () => {
    seeded("normal");
    useSim.getState().pause();
    run(50);
    expect(useSim.getState().stage).toBe("ready");
    useSim.getState().reset();
    expect(useSim.getState().active).toBe(false);
    expect(useSim.getState().events).toEqual([]);
  });
});
