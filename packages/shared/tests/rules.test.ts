import { describe, expect, it } from "vitest";
import { ActionType } from "../src/types";
import { getLegalOptions } from "../src/rules";

describe("getLegalOptions", () => {
  it("allows check and bet when facing no bet", () => {
    const out = getLegalOptions({ stack: 1000, seatBet: 100, currentBet: 100, minRaise: 100 });
    expect(out.options).toContain(ActionType.CHECK);
    expect(out.options).toContain(ActionType.BET);
  });

  it("allows call and raise when sufficient stack", () => {
    const out = getLegalOptions({ stack: 1000, seatBet: 100, currentBet: 300, minRaise: 200 });
    expect(out.callAmount).toBe(200);
    expect(out.options).toContain(ActionType.CALL);
    expect(out.options).toContain(ActionType.RAISE);
  });

  it("disallows raise when short stack", () => {
    const out = getLegalOptions({ stack: 120, seatBet: 100, currentBet: 300, minRaise: 200 });
    expect(out.options).not.toContain(ActionType.RAISE);
    expect(out.options).toContain(ActionType.ALL_IN);
  });
});
