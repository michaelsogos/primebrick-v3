# Feature: Easter Egg — Perudo (Liar's Dice) — Plan

## Objective

Add a **Perudo** dice game as an easter egg in `primebrick-fe-v3`, piggybacking
on the easter-egg engine planned in `feature-easter-egg-themes-mangify.md`
(same registry + key-sequence + console-command plumbing — an egg entry whose
activation opens a **game sheet** instead of a theme).

Scope (this plan):

1. **Solo mode vs CPU** — fully client-side, zero backend, zero new runtime
   deps. Bot with probability-based bidding + tunable bluff.
2. **Same-browser "pass & play" / dual-tab mode** — reuses the existing
   `useSyncChannel` BroadcastChannel pattern so two open tabs can play each
   other **with no backend** (each tab sees only its own dice; the channel
   carries bids/challenges/reveals).
3. **UI** — rich, colorful right-sheet game panel (tavolo da gioco feel):
   player cups, animated dice, bid history, turn indicator, action bar.
4. **Multiplayer-over-network** — explicitly OUT of scope (would need a BE
   endpoint: REST action + SSE broadcast). The `GameTransport` interface is
   designed so a future `SseTransport` plugs in without touching game logic.

Non-goals: no WASM (pure TS logic, ~300 LOC — WASM buys nothing here), no
game engine lib (Phaser/Pixi are for render loops; Svelte transitions +
CSS transforms cover dice animations), no BE changes, nothing loaded until
the egg fires (lazy `import()` only, per Smart-component precedent).

---

## Current state (verified 2026-09-29)

- Sheet infra: `src/lib/shell/sheets/sheet-manager.svelte.ts` — `openSheet(id,
  props, { side, contentClass, modal })`; `SheetPanelId` union + `SheetPanelPropsMap`
  typed per panel; `SheetHost.svelte` renders the active panel component.
  Panel chrome: `SheetPanelLayout.svelte` (icon + title + toolbar + close
  snippets) — canonical example `FiltersPanel.svelte`, `AiChatPanel.svelte`.
- Cross-tab sync: `useSyncChannel` (`src/lib/composables/useSyncChannel.svelte.ts`)
  — `BroadcastChannel` wrapper, sender/receiver modes. **Same-browser only.**
- Real-time to other users: `createSseConnection` (`src/lib/sse/`) — server→client
  read-only stream; no client→server game channel exists today.
- Easter-egg engine: see `feature-easter-egg-themes-mangify.md` — registry of
  `{ id, sequence, console_command, load() }`, global guarded keydown listener
  in root `+layout.svelte`, lazy `import()` per egg. Perudo registers as a new
  entry kind: `kind: 'action'` (opens UI) vs existing `kind: 'theme'`.
- Composable convention (MANDATORY): single `_state` object, `DeepReadonly`
  getter, mutator functions only — AGENTS.md "Composable state exposure
  pattern".
- i18n: easter-egg copy stays inside the egg module (same exemption as manga
  theme, flagged in that plan — §i18n). Keys anyway namespaced `app.perudo.*`
  where cheap.
- `data-testid` convention: kebab-case `<scope>-<purpose>` on interactive els.

---

## Game rules implemented

- N players (2–6), 5 dice each. Round: all roll secretly → bid turns → any
  player may call **Dudo** ("doubt") → reveal → loser of the exchange loses
  one die → next round. Last player with dice wins.
- Bid `(quantity, face)`: must increase quantity, or keep quantity and raise
  face, or switch to/from **aces (1 = wild/jolly)** with the standard
  halving/doubling rule (`aces` quantity = `ceil(q/2)`; back to normal face =
  `q*2+1`). Palifico round variant: optional toggle, default ON for first
  round after losing a die.
- Spot-on call ("Calza", optional): if enabled, a non-turn player may call
  the bid *exact* — wins back a die if exact, loses one if not.

## Architecture

```
src/lib/easter-eggs/perudo/
├── index.ts                     # egg module: activate() → openSheet('game.perudo')
├── game/
│   ├── types.ts                 # Player, Bid, GamePhase, GameState (snake_case)
│   ├── rules.ts                 # pure fns: is_bid_legal, resolve_dudo, resolve_calza,
│   │                            #   bid_rank compare, aces math — unit-testable
│   ├── engine.ts                # pure reducer: GameState + Action → GameState
│   ├── bot.ts                   # CPU strategy (probabilities + bluff factor)
│   └── transport.ts             # GameTransport interface + LocalTransport + TabsTransport
├── use-perudo.svelte.ts         # composable: _state, mutators (place_bid, call_dudo…),
│                                #   drives transport, schedules bot turn
└── ui/
    ├── PerudoPanel.svelte       # SheetPanelLayout chrome + table layout
    ├── DiceFace.svelte          # SVG die (pips), rolling animation via CSS transform
    ├── PlayerCup.svelte         # cup + hidden/own dice + dice-count badge
    ├── BidHistory.svelte        # scrollable feed of bids/dudo/calza
    └── BidControls.svelte       # quantity stepper + face picker + Bid/Dudo buttons
```

### 1. Core types (`game/types.ts`)

snake_case per data-model-conventions:

```ts
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export interface Bid { quantity: number; face: DieFace; }
export interface Player {
  id: string;              // 'you' | 'bot-1' | 'tab-peer'
  name: string;
  dice: DieFace[];         // full state local-mode; count-only for remote peer
  is_bot: boolean;
  alive: boolean;
}
export type GamePhase = 'lobby' | 'rolling' | 'bidding' | 'reveal' | 'game_over';
export interface GameState {
  phase: GamePhase;
  players: Player[];
  turn_index: number;
  current_bid: Bid | null;
  current_bidder: string | null;
  palifico_round: boolean;
  log: LogEntry[];         // bid / dudo / calza / reveal / elimination feed
  winner_id: string | null;
}
export type Action =
  | { type: 'bid'; player_id: string; bid: Bid }
  | { type: 'dudo'; player_id: string }
  | { type: 'calza'; player_id: string }
  | { type: 'round_start' };  // internal: roll dice, pick first bidder
```

### 2. Engine (`game/engine.ts`)

Pure reducer — no Svelte imports, no timers. Deterministic given a seeded RNG
(`makeRng(seed)` mulberry32) so tabs mode can share a seed and both sides
recompute identically, and tests are trivial.

- `reduce(state, action, rng)`: validates legality (`is_bid_legal`), applies
  bid → advances `turn_index`; `dudo`/`calza` → counts matching dice
  (faces + aces, non-palifico), moves dice between players, sets `reveal`,
  then `round_start` re-rolls alive players.
- Elimination + `game_over` + `winner_id` handled inside the reducer.

### 3. Transport (`game/transport.ts`)

```ts
export interface GameTransport {
  /** send a player action to the game authority */
  dispatch(action: Action): void;
  /** subscribe to authoritative state updates */
  on_state(cb: (state: GameState) => void): () => void;
  destroy(): void;
}
```

- `LocalTransport` — solo vs bots: owns the authoritative engine in-memory;
  `dispatch` validates + reduces; bot turns scheduled by the composable
  (setTimeout chain, cancellable on destroy).
- `TabsTransport` — dual-tab: `BroadcastChannel('primebrick_perudo_sync')`
  via `useSyncChannel`-style channel. **Authority = first tab ("host")**:
  host tab runs the engine, receives `Action` messages, broadcasts
  `{state}` snapshots; guest tab dispatches actions as messages and renders
  received state. Dice privacy: snapshot for guest contains only its own
  dice + counts for others (host filters per recipient via targeted
  `player_id` field — BroadcastChannel has no addressing, so each message
  carries `for_player_id` and tabs drop non-matching snapshots).
- Future `SseTransport` — same interface; not in this plan.

### 4. Bot (`game/bot.ts`)

- Knows own dice; estimates others' dice as multinomial(1/3 per face, aces wild).
- `P(actual_count >= bid.quantity)` via binomial tail on expected unseen dice.
- Policy: if `P < threshold` (e.g. 0.35 + aggression jitter) → `dudo`;
  else raise minimally or bluff-raise with probability `bluff_rate` (~0.15).
- Difficulty presets: `easy` (threshold 0.5, no bluff), `normal`, `hard`
  (remembers your bidding honesty — simple exponential trust score).

### 5. Composable (`use-perudo.svelte.ts`)

Mandatory pattern: `_state = $state({ game: GameState | null, mode: 'solo'|'tabs', … })`,
`get state(): DeepReadonly<…>`, mutators `start_solo(bot_count, difficulty)`,
`start_tabs()`, `place_bid(bid)`, `call_dudo()`, `call_calza()`, `destroy()`.
Subscribes to transport, writes `state` snapshots into `_state.game`,
schedules bot dispatch when `turn_index` is a bot (solo mode only).

### 6. UI (`ui/`)

- `PerudoPanel` opens via `openSheet('game.perudo', {}, { side: 'right',
  contentClass: 'p-0 sm:max-w-xl w-full' })`. Chrome = `SheetPanelLayout`
  (icon `Dices` from `@lucide/svelte`, title "Perudo", toolbar = mode/difficulty
  during lobby).
- **Table**: felt-green/gradient backdrop (`bg-gradient-to-b`), opponents' cups
  in a row on top (cup icon + `?` dice backs + count Badge), your dice row at
  bottom revealed with `DiceFace` SVGs; `svelte/transition` fly+scale on roll,
  `animate-bounce`-style keyframe for dice settle.
- **BidHistory**: compact feed `Bot-2 bids three 4s · You call Dudo!`, newest
  highlighted; reveal phase flashes all dice then collapses losers' die.
- **BidControls**: `+/-` steppers for quantity, face selector as 6 mini-dice
  (ace highlighted as wild), primary "Bid" + destructive "Dudo!" +
  ghost "Calza" buttons — disabled when not your turn; legal-bid guard
  enforced by `rules.ts` (UI just greys illegal picks).
- Colors/typography follow app tokens so the panel still respects light/dark —
  the *game* can be louder: accent gradients, pip colors per face.
- testids: `perudo-bid-btn`, `perudo-dudo-btn`, `perudo-calza-btn`,
  `perudo-die-{i}`, `perudo-bid-quantity`, `perudo-bid-face-{n}`,
  `perudo-start-{mode}`.

### 7. Egg wiring

- `EASTER_EGGS` registry gains `{ id: 'perudo', kind: 'action',
  sequence: ['p','e','r','u','d','o'], console_command: 'perudo',
  load: () => import('./perudo') }` whose `activate()` calls
  `openSheet('game.perudo', {}, …)` and `deactivate()` → `closeSheet()` (no-op
  if another panel took the sheet). No persistence (games don't survive
  refresh; `pb.easter_egg` stays theme-only).
- Sheet plumbing: add `'game.perudo'` to `SheetPanelId` +
  `SheetPanelPropsMap` (`Record<string, never>`) + render case in
  `SheetHost.svelte`.
- Console: `perudo()` opens it; hint line appended to the existing styled
  console teaser.

## Impacted files

| File | Change |
|---|---|
| `src/lib/easter-eggs/registry.ts` | add `kind` field + perudo entry |
| `src/lib/easter-eggs/perudo/**` | NEW — engine, transports, composable, UI |
| `src/lib/shell/sheets/sheet-manager.svelte.ts` | add `'game.perudo'` panel id + props map entry |
| `src/lib/shell/sheets/SheetHost.svelte` | render `PerudoPanel` for the new id |
| `src/lib/easter-eggs/console-commands.ts` | `window.perudo()` |
| `src/lib/__tests__/perudo-rules.test.ts` | NEW — unit tests for rules/engine/bot |

Depends on the easter-egg engine plan (mangify) landing first — or land the
engine parts of that plan (registry/listener/store) as the shared base.

No BE changes. No new dependencies (Lucide `Dices`/`CupSoda` icons already
available via `@lucide/svelte`).

## Verification

- `pnpm run check` clean; no `state_referenced_locally`.
- Unit tests (`pnpm test` / vitest): bid legality incl. aces transitions,
  dudo resolution with wild aces, palifico on/off, calza exact-bid, bot never
  emits illegal bid, game terminates.
- Manual solo: type `perudo` anywhere → sheet opens, play a full game vs
  2 bots, dice animate, log correct, winner shown.
- Manual tabs: open app in 2 tabs → `perudo()` in both → `start_tabs()` →
  each tab sees only its own dice; bids sync; close one tab mid-game → host
  migration message (or graceful end).
- Guard: typing "perudo" inside an input does not trigger (shared listener).
- Bundle: `pnpm run build` → perudo chunk only fetched post-activation.

## Acceptance criteria

1. `perudo` key sequence or `perudo()` opens the game sheet; fully playable
   vs 1–5 bots at 3 difficulties.
2. Dual-tab multiplayer works over BroadcastChannel with per-tab dice
   privacy; no backend involved.
3. Rules engine is pure TS, unit-tested, seeded-deterministic.
4. `GameTransport` interface isolates networking — SseTransport can be added
   later with zero engine/UI changes.
5. Zero Perudo code/assets in the initial bundle (dynamic import only).
6. Closing the sheet mid-game tears down transport + bot timers.

## Open questions for the user

1. **Cheat code**: `perudo`, or something more cryptic (`dudo`, `libradados`,
   arrow Konami)? Also reachable from a hidden sidebar icon?
2. **Right sheet vs fullscreen dialog**: plan defaults to right sheet
   (shell-consistent); fullscreen "poker table" variant possible as phase 2.
3. **Calza rule**: include the spot-on call or keep rules minimal (Bid/Dudo)?
4. **Tabs mode**: worth shipping in v1, or solo-only first and tabs later?
5. **Sound**: tiny WebAudio shake/reveal sounds (no assets, ~30 LOC) — yes/no?
