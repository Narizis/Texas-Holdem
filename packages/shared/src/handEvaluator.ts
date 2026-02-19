import type { Card } from "./types";

export interface HandValue {
  category: number;
  ranks: number[];
}

function sortDesc(nums: number[]): number[] {
  return [...nums].sort((a, b) => b - a);
}

function findStraightHigh(ranks: number[]): number | null {
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniq.includes(14)) uniq.push(1);
  let run = 1;
  for (let i = 0; i < uniq.length - 1; i += 1) {
    if (uniq[i] - 1 === uniq[i + 1]) {
      run += 1;
      if (run >= 5) {
        return uniq[i - 3];
      }
    } else if (uniq[i] !== uniq[i + 1]) {
      run = 1;
    }
  }
  return null;
}

export function evaluate7(cards: Card[]): HandValue {
  const rankCounts = new Map<number, number>();
  const suitGroups = new Map<string, number[]>();

  for (const c of cards) {
    rankCounts.set(c.rank, (rankCounts.get(c.rank) ?? 0) + 1);
    const arr = suitGroups.get(c.suit) ?? [];
    arr.push(c.rank);
    suitGroups.set(c.suit, arr);
  }

  let flushSuit: string | null = null;
  let flushRanks: number[] = [];
  for (const [suit, ranks] of suitGroups.entries()) {
    if (ranks.length >= 5) {
      flushSuit = suit;
      flushRanks = sortDesc(ranks);
      break;
    }
  }

  if (flushSuit) {
    const sfHigh = findStraightHigh(flushRanks);
    if (sfHigh) return { category: 8, ranks: [sfHigh] };
  }

  const countGroups = [...rankCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const quads = countGroups.filter((x) => x[1] === 4).map((x) => x[0]);
  const trips = countGroups.filter((x) => x[1] === 3).map((x) => x[0]);
  const pairs = countGroups.filter((x) => x[1] === 2).map((x) => x[0]);
  const singles = countGroups.filter((x) => x[1] === 1).map((x) => x[0]);

  if (quads.length) {
    const kicker = sortDesc([...trips, ...pairs, ...singles])[0];
    return { category: 7, ranks: [quads[0], kicker] };
  }

  if (trips.length && (pairs.length || trips.length > 1)) {
    const t = trips[0];
    const p = pairs.length ? pairs[0] : trips[1];
    return { category: 6, ranks: [t, p] };
  }

  if (flushSuit) {
    return { category: 5, ranks: flushRanks.slice(0, 5) };
  }

  const straightHigh = findStraightHigh(cards.map((c) => c.rank));
  if (straightHigh) return { category: 4, ranks: [straightHigh] };

  if (trips.length) {
    const kickers = sortDesc([...pairs, ...singles]).slice(0, 2);
    return { category: 3, ranks: [trips[0], ...kickers] };
  }

  if (pairs.length >= 2) {
    const top2 = sortDesc(pairs).slice(0, 2);
    const kicker = sortDesc([...singles, ...trips.slice(2)])[0];
    return { category: 2, ranks: [...top2, kicker] };
  }

  if (pairs.length === 1) {
    const kickers = sortDesc([...singles]).slice(0, 3);
    return { category: 1, ranks: [pairs[0], ...kickers] };
  }

  return { category: 0, ranks: sortDesc(cards.map((c) => c.rank)).slice(0, 5) };
}

export function compareHands(a: Card[], b: Card[]): number {
  const av = evaluate7(a);
  const bv = evaluate7(b);
  if (av.category !== bv.category) return av.category > bv.category ? 1 : -1;
  const n = Math.max(av.ranks.length, bv.ranks.length);
  for (let i = 0; i < n; i += 1) {
    const ar = av.ranks[i] ?? 0;
    const br = bv.ranks[i] ?? 0;
    if (ar !== br) return ar > br ? 1 : -1;
  }
  return 0;
}
