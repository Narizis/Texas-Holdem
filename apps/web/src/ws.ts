import { ActionType, type ClientMessage, type ServerEvent } from "@poker/shared";
import { useGameStore } from "./store";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
const TABLE_ID = "table-1" as const;
const clientIdKey = "nlh-client-id";

function getClientId(): string {
  const current = localStorage.getItem(clientIdKey);
  if (current) return current;
  const v = `c_${crypto.randomUUID().slice(0, 8)}`;
  localStorage.setItem(clientIdKey, v);
  return v;
}

let ws: WebSocket | null = null;

export function connect(name?: string): void {
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    send({ type: "JOIN_TABLE", tableId: TABLE_ID, name, clientId: getClientId() });
    send({ type: "RECONNECT", tableId: TABLE_ID, lastSeq: useGameStore.getState().seq });
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as ServerEvent | { type: "ERROR"; message: string };
    if (msg.type === "ERROR") {
      console.error(msg.message);
      return;
    }
    const out = useGameStore.getState().applyEvent(msg);
    if (out === "gap") {
      send({ type: "RECONNECT", tableId: TABLE_ID, lastSeq: useGameStore.getState().seq });
    }
  };

  ws.onclose = () => {
    setTimeout(() => connect(name), 1200);
  };
}

export function send(msg: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export function action(actionType: ActionType, amount?: number): void {
  const state = useGameStore.getState();
  if (!state.handId) return;
  send({ type: "ACTION", tableId: TABLE_ID, handId: state.handId, actionType, amount });
}

export function sitDown(seatId: number, buyin = 10000): void {
  send({ type: "SIT_DOWN", tableId: TABLE_ID, seatId, buyin });
}

export function standUp(): void {
  send({ type: "STAND_UP", tableId: TABLE_ID });
}
