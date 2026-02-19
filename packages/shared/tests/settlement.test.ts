import { describe, expect, it } from "vitest";
import { buildSidePots } from "../src/pots";
import { compareHands } from "../src/handEvaluator";
import type { Card } from "../src/types";

const c = (rank: number, suit: "c" | "d" | "h" | "s"): Card => ({ rank, suit });

describe("settlement with side pots", () => {
  it("splits a pot when same hand strength", () => {
    const board = [c(14, "h"), c(13, "d"), c(12, "c"), c(11, "s"), c(10, "h")];
    const h0 = [c(2, "c"), c(3, "c")];
    const h1 = [c(4, "d"), c(5, "d")];
    expect(compareHands([...h0, ...board], [...h1, ...board])).toBe(0);

    const pots = buildSidePots({ 0: 1000, 1: 1000, 2: 1000 }, new Set([0, 1]));
    expect(pots).toEqual([{ amount: 3000, eligibleSeats: [0, 1] }]);

    const share = Math.floor(pots[0].amount / 2);
    expect(share).toBe(1500);
  });
});
