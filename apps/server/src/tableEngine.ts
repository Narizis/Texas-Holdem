import {
  ActionType,
  buildSidePots,
  compareHands,
  getLegalOptions,
  PlayerStatus,
  shuffleDeck,
  Street,
  type Card,
  type LegalActionContext,
  type PotInfo,
  type SeatStatePublic,
  type ServerEvent,
  type TableId,
  type TableStatePublic
} from "@poker/shared";

const MAX_SEATS = 9;
const ACTION_MS = 15000;

interface SeatStateInternal extends SeatStatePublic {
  holeCards: Card[];
  actedThisStreet: boolean;
}

interface EngineHooks {
  onBroadcast: (event: Omit<ServerEvent, "seq">) => void;
  onPrivate: (playerId: string, event: Omit<ServerEvent, "seq">) => void;
}

const EMPTY_SEAT = (seatId: number): SeatStateInternal => ({
  seatId,
  playerId: null,
  name: null,
  stack: 0,
  status: PlayerStatus.OUT,
  currentBet: 0,
  streetContribution: 0,
  totalContribution: 0,
  holeCards: [],
  actedThisStreet: false
});

export class TableEngine {
  readonly tableId: TableId;
  readonly sb: number;
  readonly bb: number;

  private seats: SeatStateInternal[];
  private buttonSeat: number | null = null;
  private handId: number | null = null;
  private handSeedCounter = 0;
  private street: Street | null = null;
  private actingSeat: number | null = null;
  private currentBet = 0;
  private minRaise = 0;
  private board: Card[] = [];
  private deck: Card[] = [];
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private legalAction: LegalActionContext | undefined;
  private handRunning = false;
  private hooks: EngineHooks;

  constructor(tableId: TableId, sb: number, bb: number, hooks: EngineHooks) {
    this.tableId = tableId;
    this.sb = sb;
    this.bb = bb;
    this.minRaise = bb;
    this.seats = Array.from({ length: MAX_SEATS }, (_, i) => EMPTY_SEAT(i));
    this.hooks = hooks;
  }

  getStatePublic(seq: number): TableStatePublic {
    const sidePots = this.computePots().slice(1);
    return {
      tableId: this.tableId,
      seq,
      handId: this.handId,
      buttonSeat: this.buttonSeat,
      sb: this.sb,
      bb: this.bb,
      street: this.street,
      actingSeat: this.actingSeat,
      board: [...this.board],
      seats: this.seats.map((s) => ({
        seatId: s.seatId,
        playerId: s.playerId,
        name: s.name,
        stack: s.stack,
        status: s.status,
        currentBet: s.currentBet,
        streetContribution: s.streetContribution,
        totalContribution: s.totalContribution
      })),
      mainPot: this.computePots()[0]?.amount ?? 0,
      sidePots,
      legalAction: this.legalAction
    };
  }

  getPlayerSeat(playerId: string): number | null {
    const seat = this.seats.find((s) => s.playerId === playerId);
    return seat ? seat.seatId : null;
  }

  getPlayerHole(playerId: string): Card[] | undefined {
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (!seat || seat.holeCards.length !== 2) return undefined;
    return [...seat.holeCards];
  }

  sitDown(playerId: string, name: string, seatId: number, buyin: number): { ok: boolean; reason?: string } {
    if (seatId < 0 || seatId >= MAX_SEATS) return { ok: false, reason: "invalid seat" };
    const existing = this.getPlayerSeat(playerId);
    if (existing !== null) return { ok: false, reason: "already seated" };
    const seat = this.seats[seatId];
    if (seat.playerId) return { ok: false, reason: "seat occupied" };
    if (buyin <= 0) return { ok: false, reason: "invalid buyin" };

    seat.playerId = playerId;
    seat.name = name;
    seat.stack = buyin;
    seat.status = PlayerStatus.ACTIVE;

    this.hooks.onBroadcast({
      type: "PLAYER_SIT",
      tableId: this.tableId,
      seatId,
      playerId,
      name,
      buyin
    });

    this.tryStartHand();
    return { ok: true };
  }

  standUp(playerId: string): { ok: boolean; reason?: string } {
    const seatId = this.getPlayerSeat(playerId);
    if (seatId === null) return { ok: false, reason: "not seated" };
    const seat = this.seats[seatId];

    if (this.handRunning && [PlayerStatus.ACTIVE, PlayerStatus.ALLIN].includes(seat.status)) {
      seat.status = PlayerStatus.FOLDED;
    }

    seat.playerId = null;
    seat.name = null;
    seat.stack = 0;
    seat.status = PlayerStatus.OUT;
    seat.currentBet = 0;
    seat.streetContribution = 0;
    seat.totalContribution = 0;
    seat.holeCards = [];
    seat.actedThisStreet = false;

    this.hooks.onBroadcast({ type: "PLAYER_STAND", tableId: this.tableId, seatId, playerId });
    return { ok: true };
  }

  requestAction(
    playerId: string,
    handId: number,
    actionType: ActionType,
    amount?: number
  ): { ok: boolean; reason?: string } {
    if (!this.handRunning || this.handId !== handId) return { ok: false, reason: "hand mismatch" };
    const seatId = this.getPlayerSeat(playerId);
    if (seatId === null || seatId !== this.actingSeat) return { ok: false, reason: "not your turn" };

    const seat = this.seats[seatId];
    if (seat.status !== PlayerStatus.ACTIVE) return { ok: false, reason: "seat not active" };

    const legal = getLegalOptions({
      stack: seat.stack,
      seatBet: seat.currentBet,
      currentBet: this.currentBet,
      minRaise: this.minRaise
    });
    if (!legal.options.includes(actionType)) return { ok: false, reason: "illegal action" };

    this.clearActionTimer();

    const toCall = Math.max(0, this.currentBet - seat.currentBet);
    let putAmount = 0;

    if (actionType === ActionType.FOLD) {
      seat.status = PlayerStatus.FOLDED;
      seat.actedThisStreet = true;
    }

    if (actionType === ActionType.CHECK) {
      seat.actedThisStreet = true;
    }

    if (actionType === ActionType.CALL) {
      putAmount = Math.min(toCall, seat.stack);
      this.commitChips(seat, putAmount);
      seat.actedThisStreet = true;
      if (seat.stack === 0) seat.status = PlayerStatus.ALLIN;
    }

    if (actionType === ActionType.ALL_IN) {
      const target = seat.currentBet + seat.stack;
      putAmount = seat.stack;
      this.commitChips(seat, putAmount);
      this.handleRaiseMath(seatId, target);
      if (seat.stack === 0) seat.status = PlayerStatus.ALLIN;
      seat.actedThisStreet = true;
    }

    if (actionType === ActionType.BET || actionType === ActionType.RAISE) {
      if (amount == null) return { ok: false, reason: "amount required" };
      const allInTarget = seat.currentBet + seat.stack;
      const minTarget = actionType === ActionType.BET ? this.minRaise : this.currentBet + this.minRaise;
      if (amount < minTarget && amount !== allInTarget) {
        return { ok: false, reason: "raise below minimum" };
      }
      const target = Math.max(amount, this.currentBet);
      const need = target - seat.currentBet;
      if (need > seat.stack) return { ok: false, reason: "insufficient stack" };
      putAmount = need;
      this.commitChips(seat, putAmount);
      this.handleRaiseMath(seatId, target);
      seat.actedThisStreet = true;
      if (seat.stack === 0) seat.status = PlayerStatus.ALLIN;
    }

    this.hooks.onBroadcast({
      type: "PLAYER_ACTION",
      tableId: this.tableId,
      handId,
      seat: seatId,
      actionType,
      amount: putAmount,
      toCall,
      potAfter: this.totalPot()
    });

    this.broadcastPots();
    this.afterActionAdvance();
    return { ok: true };
  }

  private commitChips(seat: SeatStateInternal, amount: number): void {
    seat.stack -= amount;
    seat.currentBet += amount;
    seat.streetContribution += amount;
    seat.totalContribution += amount;
  }

  private handleRaiseMath(seatId: number, target: number): void {
    const raiseSize = target - this.currentBet;
    if (target > this.currentBet) {
      this.currentBet = target;
      if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
      for (const s of this.seats) {
        if (s.playerId && s.status === PlayerStatus.ACTIVE && s.seatId !== seatId) {
          s.actedThisStreet = false;
        }
      }
    }
  }

  private afterActionAdvance(): void {
    const live = this.liveNotFoldedSeats();
    if (live.length <= 1) {
      this.finishWithoutShowdown(live[0]);
      return;
    }

    if (this.isStreetComplete()) {
      this.advanceStreetOrShowdown();
      return;
    }

    this.actingSeat = this.findNextActor(this.actingSeat!);
    this.pushActionAvailable();
  }

  private findNextActor(fromSeat: number): number | null {
    for (let step = 1; step <= MAX_SEATS; step += 1) {
      const seatId = (fromSeat + step) % MAX_SEATS;
      const s = this.seats[seatId];
      if (s.playerId && s.status === PlayerStatus.ACTIVE) return seatId;
    }
    return null;
  }

  private isStreetComplete(): boolean {
    for (const s of this.seats) {
      if (!s.playerId) continue;
      if (s.status === PlayerStatus.FOLDED || s.status === PlayerStatus.OUT) continue;
      if (s.status === PlayerStatus.ALLIN) continue;
      if (!s.actedThisStreet) return false;
      if (s.currentBet !== this.currentBet) return false;
    }
    return true;
  }

  private advanceStreetOrShowdown(): void {
    if (this.street === Street.RIVER) {
      this.runShowdown();
      return;
    }

    if (this.street === Street.PREFLOP) {
      this.street = Street.FLOP;
      this.board.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
      this.hooks.onBroadcast({ type: "STREET_START", tableId: this.tableId, handId: this.handId!, street: Street.FLOP });
      this.hooks.onBroadcast({ type: "BOARD_REVEAL", tableId: this.tableId, handId: this.handId!, cards: [...this.board] });
    } else if (this.street === Street.FLOP) {
      this.street = Street.TURN;
      this.board.push(this.deck.pop()!);
      this.hooks.onBroadcast({ type: "STREET_START", tableId: this.tableId, handId: this.handId!, street: Street.TURN });
      this.hooks.onBroadcast({ type: "BOARD_REVEAL", tableId: this.tableId, handId: this.handId!, cards: [...this.board] });
    } else if (this.street === Street.TURN) {
      this.street = Street.RIVER;
      this.board.push(this.deck.pop()!);
      this.hooks.onBroadcast({ type: "STREET_START", tableId: this.tableId, handId: this.handId!, street: Street.RIVER });
      this.hooks.onBroadcast({ type: "BOARD_REVEAL", tableId: this.tableId, handId: this.handId!, cards: [...this.board] });
    }

    this.currentBet = 0;
    this.minRaise = this.bb;
    for (const s of this.seats) {
      s.currentBet = 0;
      s.streetContribution = 0;
      s.actedThisStreet = s.status !== PlayerStatus.ACTIVE;
    }

    this.actingSeat = this.firstPostflopActor();
    if (this.actingSeat === null) {
      this.runShowdown();
      return;
    }

    this.pushActionAvailable();
  }

  private firstPostflopActor(): number | null {
    if (this.buttonSeat === null) return null;
    for (let step = 1; step <= MAX_SEATS; step += 1) {
      const seatId = (this.buttonSeat + step) % MAX_SEATS;
      const s = this.seats[seatId];
      if (s.playerId && s.status === PlayerStatus.ACTIVE) return seatId;
    }
    return null;
  }

  private finishWithoutShowdown(winnerSeat?: number): void {
    if (winnerSeat == null) {
      this.cleanupHand();
      return;
    }

    const pot = this.totalPot();
    const winner = this.seats[winnerSeat];
    winner.stack += pot;
    const deltas: Record<number, number> = { [winnerSeat]: pot };
    const stacks: Record<number, number> = {};
    for (const s of this.seats) {
      if (s.playerId) stacks[s.seatId] = s.stack;
    }

    this.hooks.onBroadcast({
      type: "SHOWDOWN",
      tableId: this.tableId,
      handId: this.handId!,
      reveals: [],
      winnersByPot: [{ potIndex: 0, amount: pot, winners: [winnerSeat] }]
    });

    this.hooks.onBroadcast({
      type: "HAND_END",
      tableId: this.tableId,
      handId: this.handId!,
      deltas,
      stacks
    });

    this.cleanupHand();
  }

  private runShowdown(): void {
    this.street = Street.SHOWDOWN;
    const contenders = this.seats
      .filter((s) => s.playerId && s.status !== PlayerStatus.FOLDED && s.status !== PlayerStatus.OUT)
      .map((s) => s.seatId);

    const contributions: Record<number, number> = {};
    for (const s of this.seats) {
      if (s.playerId) contributions[s.seatId] = s.totalContribution;
    }

    const pots = buildSidePots(contributions, new Set(contenders));
    const deltas: Record<number, number> = {};
    const winnersByPot: Array<{ potIndex: number; amount: number; winners: number[] }> = [];

    for (let i = 0; i < pots.length; i += 1) {
      const pot = pots[i];
      if (!pot.eligibleSeats.length || pot.amount <= 0) continue;

      let best: number[] = [];
      for (const seat of pot.eligibleSeats) {
        if (best.length === 0) {
          best = [seat];
          continue;
        }
        const cmp = compareHands(
          [...this.seats[seat].holeCards, ...this.board],
          [...this.seats[best[0]].holeCards, ...this.board]
        );
        if (cmp > 0) best = [seat];
        else if (cmp === 0) best.push(seat);
      }

      const share = Math.floor(pot.amount / best.length);
      let remainder = pot.amount - share * best.length;
      for (const seat of best) {
        const extra = remainder > 0 ? 1 : 0;
        remainder = Math.max(0, remainder - 1);
        const win = share + extra;
        this.seats[seat].stack += win;
        deltas[seat] = (deltas[seat] ?? 0) + win;
      }

      winnersByPot.push({ potIndex: i, amount: pot.amount, winners: best });
    }

    const stacks: Record<number, number> = {};
    for (const s of this.seats) {
      if (s.playerId) stacks[s.seatId] = s.stack;
    }

    this.hooks.onBroadcast({
      type: "SHOWDOWN",
      tableId: this.tableId,
      handId: this.handId!,
      reveals: contenders.map((seat) => ({ seat, cards: [...this.seats[seat].holeCards] })),
      winnersByPot
    });

    this.hooks.onBroadcast({
      type: "HAND_END",
      tableId: this.tableId,
      handId: this.handId!,
      deltas,
      stacks
    });

    this.cleanupHand();
  }

  private cleanupHand(): void {
    this.clearActionTimer();
    this.handRunning = false;
    this.actingSeat = null;
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.street = null;
    this.board = [];
    this.deck = [];

    for (const s of this.seats) {
      s.currentBet = 0;
      s.streetContribution = 0;
      s.totalContribution = 0;
      s.holeCards = [];
      s.actedThisStreet = false;
      if (s.playerId && s.stack === 0) s.status = PlayerStatus.OUT;
      if (s.playerId && s.stack > 0) s.status = PlayerStatus.ACTIVE;
    }

    setTimeout(() => this.tryStartHand(), 1000);
  }

  private tryStartHand(): void {
    if (this.handRunning) return;
    const activeSeats = this.seats.filter((s) => s.playerId && s.stack > 0).map((s) => s.seatId);
    if (activeSeats.length < 2) return;

    this.handRunning = true;
    this.handId = (this.handId ?? 0) + 1;
    this.handSeedCounter += 1;
    const seed = Date.now() + this.handSeedCounter;
    this.deck = shuffleDeck(seed);
    this.board = [];
    this.street = Street.PREFLOP;

    for (const s of this.seats) {
      s.currentBet = 0;
      s.streetContribution = 0;
      s.totalContribution = 0;
      s.holeCards = [];
      s.actedThisStreet = false;
      if (s.playerId && s.stack > 0) s.status = PlayerStatus.ACTIVE;
      if (s.playerId && s.stack === 0) s.status = PlayerStatus.OUT;
    }

    this.buttonSeat = this.nextOccupiedSeat(this.buttonSeat ?? -1);
    const sbSeat = this.nextOccupiedSeat(this.buttonSeat);
    const bbSeat = this.nextOccupiedSeat(sbSeat);

    this.postBlind(sbSeat, this.sb);
    this.postBlind(bbSeat, this.bb);
    this.currentBet = this.seats[bbSeat].currentBet;
    this.minRaise = this.bb;

    this.hooks.onBroadcast({
      type: "HAND_START",
      tableId: this.tableId,
      handId: this.handId,
      buttonSeat: this.buttonSeat,
      sb: this.sb,
      bb: this.bb
    });

    for (const seat of activeSeats) {
      this.seats[seat].holeCards = [this.deck.pop()!, this.deck.pop()!];
      this.hooks.onPrivate(this.seats[seat].playerId!, {
        type: "DEAL_HOLE",
        tableId: this.tableId,
        handId: this.handId,
        toSeat: seat,
        cards: [...this.seats[seat].holeCards]
      });
    }

    this.hooks.onBroadcast({ type: "STREET_START", tableId: this.tableId, handId: this.handId, street: Street.PREFLOP });

    this.actingSeat = this.findNextActor(bbSeat);
    if (this.actingSeat === null) {
      this.advanceStreetOrShowdown();
      return;
    }
    this.pushActionAvailable();
  }

  private postBlind(seatId: number, amount: number): void {
    const seat = this.seats[seatId];
    const blind = Math.min(seat.stack, amount);
    this.commitChips(seat, blind);
    if (seat.stack === 0) seat.status = PlayerStatus.ALLIN;
  }

  private nextOccupiedSeat(from: number): number {
    for (let step = 1; step <= MAX_SEATS; step += 1) {
      const seatId = (from + step + MAX_SEATS) % MAX_SEATS;
      const s = this.seats[seatId];
      if (s.playerId && s.stack > 0) return seatId;
    }
    return from;
  }

  private liveNotFoldedSeats(): number[] {
    return this.seats
      .filter((s) => s.playerId && s.status !== PlayerStatus.FOLDED && s.status !== PlayerStatus.OUT)
      .map((s) => s.seatId);
  }

  private totalPot(): number {
    return this.seats.reduce((sum, s) => sum + s.totalContribution, 0);
  }

  private computePots(): PotInfo[] {
    const contributions: Record<number, number> = {};
    const contenders = new Set<number>();
    for (const s of this.seats) {
      if (!s.playerId) continue;
      contributions[s.seatId] = s.totalContribution;
      if (s.status !== PlayerStatus.FOLDED && s.status !== PlayerStatus.OUT) {
        contenders.add(s.seatId);
      }
    }
    return buildSidePots(contributions, contenders);
  }

  private broadcastPots(): void {
    const pots = this.computePots();
    this.hooks.onBroadcast({
      type: "POTS_UPDATE",
      tableId: this.tableId,
      handId: this.handId!,
      pot: pots[0]?.amount ?? 0,
      sidePots: pots.slice(1)
    });
  }

  private pushActionAvailable(): void {
    if (this.actingSeat === null) return;
    const seat = this.seats[this.actingSeat];
    const legal = getLegalOptions({
      stack: seat.stack,
      seatBet: seat.currentBet,
      currentBet: this.currentBet,
      minRaise: this.minRaise
    });

    this.legalAction = {
      toSeat: this.actingSeat,
      options: legal.options,
      minRaise: legal.minRaiseTo,
      callAmount: legal.callAmount,
      pot: this.totalPot(),
      timeLeftSec: ACTION_MS / 1000
    };

    this.hooks.onBroadcast({
      type: "ACTION_AVAILABLE",
      tableId: this.tableId,
      handId: this.handId!,
      toSeat: this.actingSeat,
      options: legal.options,
      minRaise: legal.minRaiseTo,
      callAmount: legal.callAmount,
      pot: this.totalPot(),
      timeLeftSec: ACTION_MS / 1000
    });

    this.actionTimer = setTimeout(() => {
      if (this.actingSeat === null) return;
      const current = this.seats[this.actingSeat];
      const auto = this.currentBet === current.currentBet ? ActionType.CHECK : ActionType.FOLD;
      this.requestAction(current.playerId!, this.handId!, auto);
    }, ACTION_MS);
  }

  private clearActionTimer(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }
}
