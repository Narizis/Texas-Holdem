import { create } from "zustand";
import {
  ActionType,
  PlayerStatus,
  type Card,
  type LegalActionContext,
  type PotInfo,
  type SeatStatePublic,
  type ServerEvent,
  type Street
} from "@poker/shared";

interface ClientState {
  tableId: "table-1";
  seq: number;
  playerId: string | null;
  heroSeat: number | null;
  handId: number | null;
  street: Street | null;
  buttonSeat: number | null;
  actingSeat: number | null;
  board: Card[];
  seats: SeatStatePublic[];
  mainPot: number;
  sidePots: PotInfo[];
  legalAction?: LegalActionContext;
  heroHole: Card[];
  countdownSec: number;
  setCountdown: (v: number) => void;
  applyEvent: (ev: ServerEvent) => "ok" | "gap";
}

const emptySeats: SeatStatePublic[] = Array.from({ length: 9 }, (_, seatId) => ({
  seatId,
  playerId: null,
  name: null,
  stack: 0,
  status: PlayerStatus.OUT,
  currentBet: 0,
  streetContribution: 0,
  totalContribution: 0
}));

export const useGameStore = create<ClientState>((set, get) => ({
  tableId: "table-1",
  seq: 0,
  playerId: null,
  heroSeat: null,
  handId: null,
  street: null,
  buttonSeat: null,
  actingSeat: null,
  board: [],
  seats: emptySeats,
  mainPot: 0,
  sidePots: [],
  legalAction: undefined,
  heroHole: [],
  countdownSec: 0,
  setCountdown(v) {
    set({ countdownSec: v });
  },
  applyEvent(ev) {
    if (ev.seq !== get().seq + 1) return "gap";

    set({ seq: ev.seq });

    if (ev.type === "TABLE_SNAPSHOT") {
      set({
        seq: ev.seq,
        playerId: ev.playerId ?? get().playerId,
        heroSeat: ev.heroSeat,
        handId: ev.state.handId,
        street: ev.state.street,
        buttonSeat: ev.state.buttonSeat,
        actingSeat: ev.state.actingSeat,
        board: ev.state.board,
        seats: ev.state.seats,
        mainPot: ev.state.mainPot,
        sidePots: ev.state.sidePots,
        legalAction: ev.state.legalAction,
        heroHole: ev.heroHoleCards ?? []
      });
      return "ok";
    }

    if (ev.type === "HAND_START") {
      set({
        handId: ev.handId,
        buttonSeat: ev.buttonSeat,
        board: [],
        mainPot: 0,
        sidePots: [],
        heroHole: [],
        legalAction: undefined
      });
    }

    if (ev.type === "DEAL_HOLE") {
      if (get().heroSeat === ev.toSeat) set({ heroHole: ev.cards });
    }

    if (ev.type === "STREET_START") set({ street: ev.street });
    if (ev.type === "BOARD_REVEAL") set({ board: ev.cards });

    if (ev.type === "ACTION_AVAILABLE") {
      set({
        actingSeat: ev.toSeat,
        legalAction: {
          toSeat: ev.toSeat,
          options: ev.options,
          minRaise: ev.minRaise,
          callAmount: ev.callAmount,
          pot: ev.pot,
          timeLeftSec: ev.timeLeftSec
        },
        countdownSec: ev.timeLeftSec
      });
    }

    if (ev.type === "PLAYER_ACTION") {
      const seats = get().seats.map((s) => {
        if (s.seatId !== ev.seat) return s;
        if (ev.actionType === ActionType.FOLD) return { ...s, status: PlayerStatus.FOLDED };
        return { ...s, currentBet: s.currentBet + ev.amount, totalContribution: s.totalContribution + ev.amount, stack: s.stack - ev.amount };
      });
      set({ seats, mainPot: ev.potAfter });
    }

    if (ev.type === "POTS_UPDATE") {
      set({ mainPot: ev.pot, sidePots: ev.sidePots });
    }

    if (ev.type === "HAND_END") {
      const seats = get().seats.map((s) => {
        const stack = ev.stacks[s.seatId];
        if (stack == null) return s;
        return {
          ...s,
          stack,
          currentBet: 0,
          streetContribution: 0,
          totalContribution: 0,
          status: stack > 0 ? PlayerStatus.ACTIVE : PlayerStatus.OUT
        };
      });
      set({ seats, legalAction: undefined, actingSeat: null, heroHole: [] });
    }

    if (ev.type === "PLAYER_SIT") {
      const seats = [...get().seats];
      seats[ev.seatId] = {
        ...seats[ev.seatId],
        playerId: ev.playerId,
        name: ev.name,
        stack: ev.buyin,
        status: PlayerStatus.ACTIVE,
        currentBet: 0,
        totalContribution: 0,
        streetContribution: 0
      };
      set({ seats });
    }

    if (ev.type === "PLAYER_STAND") {
      const seats = [...get().seats];
      seats[ev.seatId] = {
        seatId: ev.seatId,
        playerId: null,
        name: null,
        stack: 0,
        status: PlayerStatus.OUT,
        currentBet: 0,
        totalContribution: 0,
        streetContribution: 0
      };
      set({ seats });
    }

    return "ok";
  }
}));

export function seatToDisplay(seatId: number, mySeat: number | null): number {
  if (mySeat === null) return seatId;
  return (seatId - mySeat + 9) % 9;
}
