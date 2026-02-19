export type TableId = "table-1";

export enum Street {
  PREFLOP = "PREFLOP",
  FLOP = "FLOP",
  TURN = "TURN",
  RIVER = "RIVER",
  SHOWDOWN = "SHOWDOWN",
  HAND_END = "HAND_END"
}

export enum ActionType {
  FOLD = "FOLD",
  CHECK = "CHECK",
  CALL = "CALL",
  BET = "BET",
  RAISE = "RAISE",
  ALL_IN = "ALL_IN"
}

export enum PlayerStatus {
  ACTIVE = "ACTIVE",
  FOLDED = "FOLDED",
  ALLIN = "ALLIN",
  OUT = "OUT"
}

export type Suit = "c" | "d" | "h" | "s";

export interface Card {
  rank: number;
  suit: Suit;
}

export interface SeatStatePublic {
  seatId: number;
  playerId: string | null;
  name: string | null;
  stack: number;
  status: PlayerStatus;
  currentBet: number;
  streetContribution: number;
  totalContribution: number;
}

export interface PotInfo {
  amount: number;
  eligibleSeats: number[];
}

export interface LegalActionContext {
  toSeat: number;
  options: ActionType[];
  minRaise: number;
  callAmount: number;
  pot: number;
  timeLeftSec: number;
}

export interface TableStatePublic {
  tableId: TableId;
  seq: number;
  handId: number | null;
  buttonSeat: number | null;
  sb: number;
  bb: number;
  street: Street | null;
  actingSeat: number | null;
  board: Card[];
  seats: SeatStatePublic[];
  mainPot: number;
  sidePots: PotInfo[];
  legalAction?: LegalActionContext;
}

export interface ClientMsgJoinTable {
  type: "JOIN_TABLE";
  tableId: TableId;
  name?: string;
  clientId?: string;
}

export interface ClientMsgSitDown {
  type: "SIT_DOWN";
  tableId: TableId;
  seatId: number;
  buyin: number;
}

export interface ClientMsgStandUp {
  type: "STAND_UP";
  tableId: TableId;
}

export interface ClientMsgAction {
  type: "ACTION";
  tableId: TableId;
  handId: number;
  actionType: ActionType;
  amount?: number;
}

export interface ClientMsgReconnect {
  type: "RECONNECT";
  tableId: TableId;
  lastSeq: number;
}

export type ClientMessage =
  | ClientMsgJoinTable
  | ClientMsgSitDown
  | ClientMsgStandUp
  | ClientMsgAction
  | ClientMsgReconnect;

export interface EventBase {
  type: string;
  tableId: TableId;
  seq: number;
  handId?: number;
}

export interface EventTableSnapshot extends EventBase {
  type: "TABLE_SNAPSHOT";
  state: TableStatePublic;
  heroSeat: number | null;
  heroHoleCards?: Card[];
  playerId?: string;
}

export interface EventPlayerJoin extends EventBase {
  type: "PLAYER_JOIN";
  playerId: string;
  name: string;
}

export interface EventPlayerLeave extends EventBase {
  type: "PLAYER_LEAVE";
  playerId: string;
}

export interface EventPlayerSit extends EventBase {
  type: "PLAYER_SIT";
  seatId: number;
  playerId: string;
  name: string;
  buyin: number;
}

export interface EventPlayerStand extends EventBase {
  type: "PLAYER_STAND";
  seatId: number;
  playerId: string;
}

export interface EventHandStart extends EventBase {
  type: "HAND_START";
  handId: number;
  buttonSeat: number;
  sb: number;
  bb: number;
}

export interface EventDealHole extends EventBase {
  type: "DEAL_HOLE";
  handId: number;
  toSeat: number;
  cards: Card[];
}

export interface EventStreetStart extends EventBase {
  type: "STREET_START";
  handId: number;
  street: Street;
}

export interface EventBoardReveal extends EventBase {
  type: "BOARD_REVEAL";
  handId: number;
  cards: Card[];
}

export interface EventActionAvailable extends EventBase {
  type: "ACTION_AVAILABLE";
  handId: number;
  toSeat: number;
  options: ActionType[];
  minRaise: number;
  callAmount: number;
  pot: number;
  timeLeftSec: number;
}

export interface EventPlayerAction extends EventBase {
  type: "PLAYER_ACTION";
  handId: number;
  seat: number;
  actionType: ActionType;
  amount: number;
  toCall: number;
  potAfter: number;
}

export interface EventPotsUpdate extends EventBase {
  type: "POTS_UPDATE";
  handId: number;
  pot: number;
  sidePots: PotInfo[];
}

export interface EventShowdown extends EventBase {
  type: "SHOWDOWN";
  handId: number;
  reveals: Array<{ seat: number; cards: Card[] }>;
  winnersByPot: Array<{ potIndex: number; amount: number; winners: number[] }>;
}

export interface EventHandEnd extends EventBase {
  type: "HAND_END";
  handId: number;
  deltas: Record<number, number>;
  stacks: Record<number, number>;
}

export type ServerEvent =
  | EventTableSnapshot
  | EventPlayerJoin
  | EventPlayerLeave
  | EventPlayerSit
  | EventPlayerStand
  | EventHandStart
  | EventDealHole
  | EventStreetStart
  | EventBoardReveal
  | EventActionAvailable
  | EventPlayerAction
  | EventPotsUpdate
  | EventShowdown
  | EventHandEnd;
