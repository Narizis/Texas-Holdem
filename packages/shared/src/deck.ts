import type { Card, Suit } from "./types";

const SUITS: Suit[] = ["c", "d", "h", "s"];

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let rank = 2; rank <= 14; rank += 1) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffleDeck(seed: number): Card[] {
  const rng = new SeededRng(seed);
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
