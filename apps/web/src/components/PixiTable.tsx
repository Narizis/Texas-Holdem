import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { useGameStore, seatToDisplay } from "../store";

const positions = [
  [0.5, 0.87],
  [0.2, 0.77],
  [0.08, 0.57],
  [0.14, 0.33],
  [0.32, 0.15],
  [0.68, 0.15],
  [0.86, 0.33],
  [0.92, 0.57],
  [0.8, 0.77]
];

export function PixiTable(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  const seats = useGameStore((s) => s.seats);
  const mySeat = useGameStore((s) => s.heroSeat);
  const board = useGameStore((s) => s.board);
  const actingSeat = useGameStore((s) => s.actingSeat);
  const mainPot = useGameStore((s) => s.mainPot);

  useEffect(() => {
    if (!ref.current || appRef.current) return;
    const app = new PIXI.Application();
    app.init({ resizeTo: ref.current, antialias: true, backgroundAlpha: 0 }).then(() => {
      ref.current?.appendChild(app.canvas);
    });
    appRef.current = app;

    return () => {
      app.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const { width, height } = app.screen;
    app.stage.removeChildren();

    const table = new PIXI.Graphics().roundRect(width * 0.08, height * 0.1, width * 0.84, height * 0.8, 150).fill(0x145a42);
    app.stage.addChild(table);

    const potText = new PIXI.Text({
      text: `Pot: ${mainPot}`,
      style: { fill: 0xf9f4d3, fontSize: 18, fontWeight: "bold" }
    });
    potText.position.set(width * 0.46, height * 0.45);
    app.stage.addChild(potText);

    for (let i = 0; i < 5; i += 1) {
      const x = width * 0.33 + i * 54;
      const y = height * 0.36;
      const card = new PIXI.Graphics().roundRect(x, y, 46, 64, 8).fill(0xffffff);
      app.stage.addChild(card);
      const label = board[i] ? `${rank(board[i].rank)}${board[i].suit}` : "";
      const text = new PIXI.Text({ text: label, style: { fill: 0x202020, fontSize: 14 } });
      text.position.set(x + 8, y + 22);
      app.stage.addChild(text);
    }

    for (const seat of seats) {
      const display = seatToDisplay(seat.seatId, mySeat);
      const [px, py] = positions[display];
      const x = width * px;
      const y = height * py;
      const isTurn = actingSeat === seat.seatId;

      const chip = new PIXI.Graphics().circle(x, y, isTurn ? 26 : 22).fill(isTurn ? 0xf2b94b : 0x203532);
      app.stage.addChild(chip);

      const name = seat.playerId ? `${seat.name} (${seat.stack})` : "Empty";
      const bet = seat.currentBet > 0 ? `bet ${seat.currentBet}` : "";
      const t1 = new PIXI.Text({ text: name, style: { fill: 0xffffff, fontSize: 12 } });
      const t2 = new PIXI.Text({ text: bet, style: { fill: 0xffe8a8, fontSize: 11 } });
      t1.anchor.set(0.5, 1.8);
      t2.anchor.set(0.5, -0.3);
      t1.position.set(x, y);
      t2.position.set(x, y);
      app.stage.addChild(t1, t2);
    }
  }, [seats, mySeat, board, actingSeat, mainPot]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function rank(v: number): string {
  if (v <= 10) return String(v);
  if (v === 11) return "J";
  if (v === 12) return "Q";
  if (v === 13) return "K";
  return "A";
}
