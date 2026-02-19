import { useEffect, useMemo, useState } from "react";
import { ActionType } from "@poker/shared";
import { useGameStore } from "./store";
import { action, connect, sitDown, standUp } from "./ws";
import { PixiTable } from "./components/PixiTable";
import "./styles.css";

export default function App(): JSX.Element {
  const seats = useGameStore((s) => s.seats);
  const heroSeat = useGameStore((s) => s.heroSeat);
  const legal = useGameStore((s) => s.legalAction);
  const actingSeat = useGameStore((s) => s.actingSeat);
  const handId = useGameStore((s) => s.handId);
  const board = useGameStore((s) => s.board);
  const heroHole = useGameStore((s) => s.heroHole);
  const countdownSec = useGameStore((s) => s.countdownSec);
  const setCountdown = useGameStore((s) => s.setCountdown);

  const [raiseTo, setRaiseTo] = useState(0);

  useEffect(() => {
    connect(`Hero-${Math.floor(Math.random() * 999)}`);
  }, []);

  useEffect(() => {
    if (!legal) return;
    setRaiseTo(Math.max(legal.minRaise, legal.callAmount));
  }, [legal?.minRaise, legal?.callAmount]);

  useEffect(() => {
    if (countdownSec <= 0) return;
    const id = setInterval(() => {
      setCountdown(Math.max(0, useGameStore.getState().countdownSec - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [countdownSec, setCountdown]);

  const isMyTurn = heroSeat !== null && actingSeat === heroSeat;
  const mySeatObj = heroSeat !== null ? seats[heroSeat] : null;
  const can = (type: ActionType) => Boolean(isMyTurn && legal?.options.includes(type));
  const pot = useGameStore((s) => s.mainPot);

  const presets = useMemo(() => {
    return {
      half: Math.max(legal?.minRaise ?? 0, Math.floor(pot * 0.5)),
      twoThird: Math.max(legal?.minRaise ?? 0, Math.floor((pot * 2) / 3)),
      full: Math.max(legal?.minRaise ?? 0, pot),
      allin: (mySeatObj?.currentBet ?? 0) + (mySeatObj?.stack ?? 0)
    };
  }, [legal?.minRaise, pot, mySeatObj?.currentBet, mySeatObj?.stack]);

  return (
    <div className="app">
      <div className="table-wrap">
        <PixiTable />
      </div>

      <div className="hud">
        <div className="row">
          <span className="pill">Hand: {handId ?? "-"}</span>
          <span className="pill">Board: {board.map((c) => `${rank(c.rank)}${c.suit}`).join(" ") || "-"}</span>
          <span className="pill">Hero: {heroSeat ?? "-"}</span>
          <span className="pill">Turn: {actingSeat ?? "-"}</span>
          <span className="pill">Timer: {countdownSec}s</span>
          <span className="pill">Hole: {heroHole.map((c) => `${rank(c.rank)}${c.suit}`).join(" ") || "-- --"}</span>
        </div>

        <div className="row">
          {seats.map((s) =>
            s.playerId ? null : (
              <button key={s.seatId} onClick={() => sitDown(s.seatId, 10000)}>
                Sit {s.seatId}
              </button>
            )
          )}
          {heroSeat !== null && <button onClick={() => standUp()}>Stand Up</button>}
        </div>

        <div className="row">
          <button disabled={!can(ActionType.FOLD)} onClick={() => action(ActionType.FOLD)}>
            Fold
          </button>
          <button
            disabled={!can(ActionType.CHECK) && !can(ActionType.CALL)}
            onClick={() => action(can(ActionType.CHECK) ? ActionType.CHECK : ActionType.CALL)}
          >
            {can(ActionType.CHECK) ? "Check" : `Call ${legal?.callAmount ?? 0}`}
          </button>

          <input
            type="range"
            min={legal?.minRaise ?? 0}
            max={(mySeatObj?.currentBet ?? 0) + (mySeatObj?.stack ?? 0)}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            disabled={!isMyTurn}
          />
          <button
            disabled={!can(ActionType.BET) && !can(ActionType.RAISE)}
            onClick={() => action(can(ActionType.BET) ? ActionType.BET : ActionType.RAISE, raiseTo)}
          >
            {can(ActionType.BET) ? `Bet ${raiseTo}` : `Raise to ${raiseTo}`}
          </button>
          <button disabled={!can(ActionType.ALL_IN)} onClick={() => action(ActionType.ALL_IN)}>
            All-in
          </button>
        </div>

        <div className="row">
          <button disabled={!isMyTurn} onClick={() => setRaiseTo(presets.half)}>
            1/2 Pot
          </button>
          <button disabled={!isMyTurn} onClick={() => setRaiseTo(presets.twoThird)}>
            2/3 Pot
          </button>
          <button disabled={!isMyTurn} onClick={() => setRaiseTo(presets.full)}>
            Pot
          </button>
          <button disabled={!isMyTurn} onClick={() => setRaiseTo(presets.allin)}>
            All-in Size
          </button>
        </div>
      </div>
    </div>
  );
}

function rank(v: number): string {
  if (v <= 10) return String(v);
  if (v === 11) return "J";
  if (v === 12) return "Q";
  if (v === 13) return "K";
  return "A";
}
