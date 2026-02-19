import { describe, expect, it } from "vitest";
import { buildSidePots } from "../src/pots";

describe("buildSidePots", () => {
  it("single all-in with callers", () => {
    const pots = buildSidePots({ 0: 1000, 1: 1000, 2: 300 }, new Set([0, 1, 2]));
    expect(pots).toEqual([
      { amount: 900, eligibleSeats: [0, 1, 2] },
      { amount: 1400, eligibleSeats: [0, 1] }
    ]);
  });

  it("two all-ins at different levels plus covering stack", () => {
    const pots = buildSidePots({ 0: 500, 1: 1200, 2: 2000 }, new Set([0, 1, 2]));
    expect(pots).toEqual([
      { amount: 1500, eligibleSeats: [0, 1, 2] },
      { amount: 1400, eligibleSeats: [1, 2] },
      { amount: 800, eligibleSeats: [2] }
    ]);
  });

  it("multi-layer all-in with folded player", () => {
    const pots = buildSidePots({ 0: 300, 1: 900, 2: 900, 3: 2000 }, new Set([0, 1, 3]));
    expect(pots).toEqual([
      { amount: 1200, eligibleSeats: [0, 1, 3] },
      { amount: 1800, eligibleSeats: [1, 3] },
      { amount: 1100, eligibleSeats: [3] }
    ]);
  });

  it("split-pot layer can be calculated independently", () => {
    const pots = buildSidePots({ 0: 1000, 1: 1000, 2: 1000 }, new Set([0, 1, 2]));
    expect(pots[0].amount).toBe(3000);
    expect(pots[0].eligibleSeats).toEqual([0, 1, 2]);
  });
});
