import type { PotInfo } from "./types";

/**
 * Build main pot + side pots from each seat's total contribution.
 * Each pot keeps eligible seats that can win it (non-folded contenders).
 */
export function buildSidePots(
  contributions: Record<number, number>,
  contenders: Set<number>
): PotInfo[] {
  const seats = Object.keys(contributions).map(Number);
  const positive = seats.filter((s) => contributions[s] > 0);
  if (!positive.length) return [];

  const levels = [...new Set(positive.map((s) => contributions[s]))].sort((a, b) => a - b);
  const pots: PotInfo[] = [];
  let prev = 0;

  for (const level of levels) {
    const involved = positive.filter((s) => contributions[s] >= level);
    const slice = level - prev;
    if (slice <= 0 || involved.length === 0) continue;
    const amount = slice * involved.length;
    const eligibleSeats = involved.filter((s) => contenders.has(s));
    pots.push({ amount, eligibleSeats });
    prev = level;
  }

  return pots;
}
