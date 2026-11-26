# Fix — bun "not in the project directory" warnings + decimal watch gap in US dev services

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.
Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| primebrick-us-v3/docs/ai/dev-server.md:33-37 | `dev-hot` respawns only on lib src/ edits; service-local edits are `bun --hot`'s job | the two-layer watch is the canonical design — warnings are its cost |
| primebrick-us-v3/scripts/dev-hot.mjs:5-10 | `--conditions=development` resolves sdk/dal-pg/core into sibling src trees; dev-hot watches what bun cannot | the mechanism the user remembered — verified present |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| TIC | read dev-hot.mjs | mechanism confirmed | `--conditions=development --hot` + recursive fs.watch over LIBS=`['primebrick-v3-sdk','primebrick-dal-v3','primebrick-v3-core']` — decimal MISSING | WP-1 |
| TIC | package.json exports census | gap confirmed | core/dal/sdk have `development`→src condition; **decimal has NONE** (`dist` always) — inconsistent DX, no restart even after rebuild | WP-1 |
| TIC | warning census crm.log | noise quantified | 911 sdk + 504 dal + 168 core + **29 decimal** lines per accumulated log (~1600/boot-cycle); a few empty-path lines (bun quirk) | WP-2 |
| TIC | process census | compensation live | dev-hot.mjs supervisors running for all 5 US services (pids verified via Win32_Process) | — |
| TIC | dev-stack.mjs:185 | wiring verified | services boot via `pnpm run dev` = dev-hot.mjs — compensation active in the real stack | — |

## Status: 🟠 WIP — TIC complete, awaiting TOC approval — Plan date: single session

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | TIC — verify mechanism, census warnings, find gaps | ✅ done | this session | findings below |
| 2 | WP-1 — decimal alignment: `development` export condition in primebrick-decimal + add to dev-hot LIBS | ⏳ not done | — | small, consistent with core/dal/sdk pattern |
| 3 | WP-2 — noise control: dev-hot pipes child stdio, suppresses warnings ONLY for paths inside watched repos, forwards everything else + one boot summary line | ⏳ not done | — | enforcement-preserving: NEW unwatched externals still scream |
| 4 | WP-3 — empirical restart proof: touch core/src file → service restarts; touch decimal src → restarts (post WP-1) | ⏳ not done | — | prova del 9, bounces dev services — coordinate timing |
| 5 | WP-4 — dev-server.md documents the two-layer watch + why residual warnings mean something | ⏳ not done | — | both US copies of truth |

## Findings (TIC verdict)

**1. The warnings are BY DESIGN, not a regression.** The user's memory is
correct: the solution WAS including TS sources at dev runtime —
`bun --conditions=development` resolves `@primebrick/{sdk,dal-pg,core}` to
sibling-repo `src/` trees (no rebuild needed when editing libs). bun --hot
cannot watch outside the service project dir, so it prints the warning per
external file. `dev-hot.mjs` is the compensation layer: it watches the lib
sources itself and respawns the service. Both layers verified live.

**2. Real gap — `@primebrick/decimal` is second-class**:
- NO `development` export condition → always resolves to compiled `dist/`
  (editing decimal requires rebuild, unlike all other libs)
- NOT in dev-hot's LIBS → no auto-restart even after rebuild
- Actively developed NOW (ext-json codec work) — the gap bites today.
- Its 29 warnings/boot are pure noise since nothing compensates them.

**3. Noise hides signal**: ~1600 warning lines per service per boot-cycle in
accumulated logs — 100% expected for watched libs, but the volume buries real
issues and trains developers to ignore warnings.

## WP detail

**WP-1 — decimal alignment** (primebrick-decimal + primebrick-us-v3):
- add `"development": "./src/index.ts"` to decimal's exports (`.` entry),
  mirroring core/dal/sdk — verify FE consumption unaffected (vite does not
  apply the condition unless configured; the condition is additive)
- add `'primebrick-decimal'` to LIBS in `scripts/dev-hot.mjs`
- verify: boot a service, confirm decimal now resolves from src (warning path
  changes dist→src) and edits restart services

**WP-2 — noise control** (primebrick-us-v3/scripts/dev-hot.mjs):
- spawn with piped stdio instead of `inherit`; line-filter:
  suppress `warn: File <path> is not in the project directory` ONLY when
  `<path>` is inside one of the watched LIBS repos; forward everything else
  byte-verbatim (incl. empty-path lines — unexplained, stay visible)
- one boot line: `[dev-hot] watching external lib sources: sdk, dal-pg, core,
  decimal — their bun watch warnings are compensated and suppressed`
- ENFORCEMENT property: any NEW external dependency outside the watched set
  still prints warnings — the filter cannot silently hide real gaps

**WP-3 — empirical proof**:
- `touch` a file in primebrick-v3-core/src → observe crm restart in log
- post WP-1: same for decimal src
- verify boot clean, services register, smoke probe passes

**WP-4 — docs**: dev-server.md (US) gains the two-layer watch explanation +
"if you see a non-suppressed 'not in the project directory' warning, a new
external dependency entered the graph — extend LIBS".

## Out of scope
- bun feature request for configurable watch roots (upstream limitation)
- FE/BE watch topology (different runtimes: vite / tsc-watch)
