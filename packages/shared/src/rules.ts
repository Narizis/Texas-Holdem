import { ActionType } from "./types";

export interface LegalOptionsInput {
  stack: number;
  seatBet: number;
  currentBet: number;
  minRaise: number;
}

export interface LegalOptionsOutput {
  options: ActionType[];
  callAmount: number;
  minRaiseTo: number;
}

/**
 * Calculate legal actions for the acting player under NLH betting rules.
 */
export function getLegalOptions(input: LegalOptionsInput): LegalOptionsOutput {
  const { stack, seatBet, currentBet, minRaise } = input;
  const toCall = Math.max(0, currentBet - seatBet);
  const options: ActionType[] = [ActionType.FOLD];

  if (toCall === 0) {
    options.push(ActionType.CHECK);
    if (stack > 0) {
      options.push(ActionType.BET, ActionType.ALL_IN);
    }
    return { options, callAmount: 0, minRaiseTo: minRaise };
  }

  if (stack > 0) {
    options.push(ActionType.CALL, ActionType.ALL_IN);
    const minRaiseTo = currentBet + minRaise;
    if (seatBet + stack >= minRaiseTo) {
      options.push(ActionType.RAISE);
    }
    return { options, callAmount: Math.min(toCall, stack), minRaiseTo };
  }

  return { options, callAmount: 0, minRaiseTo: currentBet + minRaise };
}
