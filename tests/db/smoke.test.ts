import { describe, it, expect } from "vitest";
import { freshDb, rpc, rows } from "./harness";
describe("migrations", () => {
  it("apply and seed", async () => {
    const db = await freshDb();
    expect((await rows(db, "select count(*)::int c from batches"))[0].c).toBe(8);
    expect((await rows(db, "select count(*)::int c from shelters"))[0].c).toBe(5);
  });
});
