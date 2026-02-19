# 2D Web Texas Hold'em 9-max (Mobile-first, Non-Real-Money)

This is a TypeScript full-stack MVP for a **single-table (table-1) No-Limit Hold'em 9-max** game.

- Server authoritative game flow (`ws` + in-memory engine)
- Mobile-first web client (`React + PixiJS + Zustand`)
- Multi-tab local simulation (2-3+ tabs on one browser)
- Full hand flow: blinds -> preflop/flop/turn/river -> side pots -> showdown -> settlement
- Reconnect via `TABLE_SNAPSHOT` + `seq`

## Monorepo Layout

```text
.
├─ apps/
│  ├─ server/      # Node.js + TypeScript + ws
│  └─ web/         # Vite + React + PixiJS + Zustand
├─ packages/
│  └─ shared/      # Shared protocol types / deck / hand eval / side pots / rules
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## Install

```bash
npm install
# or
pnpm i
```

## Run (server + web)

```bash
npm run dev
# or
pnpm dev
```

- Web: [http://localhost:5173](http://localhost:5173)
- WS server: `ws://localhost:3001`

## Test

```bash
npm test
# or
pnpm test
```

Shared tests cover:
- side-pot construction
- hand comparison
- legal action options
- split-pot settlement scenario

## Multi-tab Simulation Steps

1. Open `http://localhost:5173` in 2-3 browser tabs.
2. In each tab, click an empty seat (`Sit x`).
3. Once at least 2 players are seated, server auto-starts a hand.
4. Use action bar buttons (`Fold/Check/Call/Bet/Raise/All-in`).
5. Play through to showdown and observe stack update in HUD/seat labels.
6. Refresh one tab: same `clientId` is reused and state is restored via snapshot.

## Implemented

- 9 fixed seats (`seatId: 0..8`)
- Hero-bottom seat rotation: `displayIndex = (serverSeat - mySeat + 9) % 9`
- Server-authoritative action validation
- Street progression and auto-advance
- Blinds and button rotation
- Main pot + side pots (multi all-in)
- Showdown 7-card compare (best 5-card ranking)
- Pot-by-pot winner resolution including split handling
- Action timeout (15s): auto-check if possible else auto-fold
- Event sequencing (`seq`) + reconnect snapshot fallback
- Shared type-safe protocol definitions
- Redis-replaceable persistence interface placeholder (`TableStateRepository`)

## Not Implemented / Simplified

- No DB/Redis persistence (in-memory only)
- No rake
- No muck logic (all showdown contenders reveal)
- Minimal Pixi animations (static 2D rendering in MVP)
- Basic reconnect strategy (snapshot-first fallback)
- No auth/security/anti-cheat hardening

## Useful Commands

```bash
pnpm --filter @poker/server dev
pnpm --filter @poker/web dev
pnpm --filter @poker/shared test
```
