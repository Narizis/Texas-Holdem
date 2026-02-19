import { describe, expect, it } from "vitest";
import { compareHands, evaluate7 } from "../src/handEvaluator";
import type { Card } from "../src/types";

const c = (rank: number, suit: "c" | "d" | "h" | "s"): Card => ({ rank, suit });

describe("hand evaluator", () => {
  it("detects straight flush over quads", () => {
    const sf = [c(14, "h"), c(13, "h"), c(12, "h"), c(11, "h"), c(10, "h"), c(2, "c"), c(3, "d")];
    const quads = [c(9, "h"), c(9, "d"), c(9, "c"), c(9, "s"), c(14, "d"), c(2, "c"), c(3, "d")];
    expect(compareHands(sf, quads)).toBe(1);
    expect(evaluate7(sf).category).toBe(8);
  });

  it("handles tie by exact same board-made hand", () => {
    const h1 = [c(14, "h"), c(2, "d"), c(13, "s"), c(12, "c"), c(11, "d"), c(10, "h"), c(9, "s")];
    const h2 = [c(8, "h"), c(7, "d"), c(13, "s"), c(12, "c"), c(11, "d"), c(10, "h"), c(9, "s")];
    expect(compareHands(h1, h2)).toBe(0);
  });
});
