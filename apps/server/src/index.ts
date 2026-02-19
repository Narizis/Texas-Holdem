import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ActionType, type ClientMessage, type ServerEvent, type TableId } from "@poker/shared";
import { TableEngine } from "./tableEngine";
import { InMemoryTableStateRepository } from "./tableRepo";

const PORT = Number(process.env.PORT ?? 3001);
const TABLE_ID: TableId = "table-1";

interface Session {
  ws: WebSocket;
  playerId: string;
  clientId: string;
  name: string;
}

const sessionsByWs = new Map<WebSocket, Session>();
const sessionsByPlayer = new Map<string, Session>();
const clientToPlayer = new Map<string, string>();

let seq = 0;
const eventLog: ServerEvent[] = [];
const repo = new InMemoryTableStateRepository();

const wss = new WebSocketServer({ port: PORT });

const engine = new TableEngine(TABLE_ID, 50, 100, {
  onBroadcast(event) {
    const ev = withSeq(event);
    for (const s of sessionsByWs.values()) {
      sendJson(s.ws, ev);
    }
  },
  onPrivate(playerId, event) {
    const ev = withSeq(event);
    const session = sessionsByPlayer.get(playerId);
    if (session) sendJson(session.ws, ev);
  }
});

function withSeq<T extends Omit<ServerEvent, "seq">>(event: T): ServerEvent {
  const full = { ...event, seq: ++seq } as ServerEvent;
  eventLog.push(full);
  if (eventLog.length > 5000) eventLog.shift();
  void repo.appendEvent(full);
  void repo.saveSnapshot(engine.getStatePublic(seq));
  return full;
}

function sendSnapshot(session: Session): void {
  const heroSeat = engine.getPlayerSeat(session.playerId);
  const heroHoleCards = engine.getPlayerHole(session.playerId);
  const snapshot = withSeq({
    type: "TABLE_SNAPSHOT",
    tableId: TABLE_ID,
    state: engine.getStatePublic(seq),
    heroSeat,
    heroHoleCards,
    playerId: session.playerId
  });
  sendJson(session.ws, snapshot);
}

const joinSchema = z.object({
  type: z.literal("JOIN_TABLE"),
  tableId: z.literal(TABLE_ID),
  name: z.string().optional(),
  clientId: z.string().optional()
});

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      if (msg.type === "JOIN_TABLE") {
        const parsed = joinSchema.parse(msg);
        const clientId = parsed.clientId ?? randomUUID();
        const existingPlayer = clientToPlayer.get(clientId);
        const playerId = existingPlayer ?? `p_${randomUUID().slice(0, 8)}`;
        if (!existingPlayer) clientToPlayer.set(clientId, playerId);

        const name = parsed.name ?? `Player-${playerId.slice(-4)}`;
        const prev = sessionsByPlayer.get(playerId);
        if (prev) {
          sessionsByWs.delete(prev.ws);
          try {
            prev.ws.close();
          } catch {
            // noop
          }
        }

        const session: Session = { ws, playerId, clientId, name };
        sessionsByWs.set(ws, session);
        sessionsByPlayer.set(playerId, session);

        const joined = withSeq({ type: "PLAYER_JOIN", tableId: TABLE_ID, playerId, name });
        for (const s of sessionsByWs.values()) sendJson(s.ws, joined);

        sendSnapshot(session);
        return;
      }

      const session = sessionsByWs.get(ws);
      if (!session) return;

      if (msg.type === "SIT_DOWN") {
        const ok = engine.sitDown(session.playerId, session.name, msg.seatId, msg.buyin);
        if (!ok.ok) sendError(ws, ok.reason ?? "sit down failed");
        return;
      }

      if (msg.type === "STAND_UP") {
        const ok = engine.standUp(session.playerId);
        if (!ok.ok) sendError(ws, ok.reason ?? "stand up failed");
        return;
      }

      if (msg.type === "ACTION") {
        if (!Object.values(ActionType).includes(msg.actionType)) {
          sendError(ws, "invalid action type");
          return;
        }
        const ok = engine.requestAction(session.playerId, msg.handId, msg.actionType, msg.amount);
        if (!ok.ok) sendError(ws, ok.reason ?? "action rejected");
        return;
      }

      if (msg.type === "RECONNECT") {
        const missing = eventLog.filter((ev) => ev.seq > msg.lastSeq);
        if (missing.length > 0 && missing.length <= 200) {
          for (const ev of missing) sendJson(ws, ev);
        } else {
          sendSnapshot(session);
        }
      }
    } catch (err) {
      sendError(ws, err instanceof Error ? err.message : "bad request");
    }
  });

  ws.on("close", () => {
    const session = sessionsByWs.get(ws);
    if (!session) return;
    sessionsByWs.delete(ws);
    sessionsByPlayer.delete(session.playerId);
    const leave = withSeq({ type: "PLAYER_LEAVE", tableId: TABLE_ID, playerId: session.playerId });
    for (const s of sessionsByWs.values()) sendJson(s.ws, leave);
  });
});

console.log(`Poker server running on ws://localhost:${PORT}`);

function sendJson(ws: WebSocket, data: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function sendError(ws: WebSocket, message: string): void {
  sendJson(ws, { type: "ERROR", message });
}
