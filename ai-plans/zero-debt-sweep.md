# Zero-Debt Sweep — chiusura definitiva debito tecnico shield/dev-hot/logging

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.
1. Read this whole plan. 2. Fill DOC RECEIPTS. 3. State = LEDGER, never memory.
4. Execute only declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond = anomaly. 6. Before closing: verdict+ledger+next.
7. Prova del 9: every claim carries file:line.

## DOC RECEIPTS
| doc:line | what it says | how it applies |
|---|---|---|
| arch-internal-trust-and-transports.md:37 | debt items 1-4 ledger | WP-1 sweep scope |
| fix-dev-hot-external-watch-warnings.md | dev-hot TIC findings | absorbed into WP-3 |
| primebrick-v3-core/AGENTS.md | core env-neutral, no Node APIs, browser-safe | WP-2 logger: console-only, no OTel in core |

## VERIFICATION LEDGER
| ts | command | verdict | evidence | next |
|---|---|---|---|---|

## Status: 🟠 WIP — approved by user (classe 1+2), job_run ignored per user, D8 already future-planned
## Design decision locked: minimal logger in core (env-neutral); OTel stays in sdk, injected as transport hook — OTel in core would poison the FE browser bundle.

| # | Task | Status | Notes |
|---|------|--------|-------|
| WP-1 | Shield cruft sweep: delete service-shield.ts shim, strip imports in ai+job-handler, patch drop system.client_shield_registry + orphan config entries, regen api-reference | ⏳ | mechanical, one sweep |
| WP-2 | core/logger minimal (levels+fmt+transport hook) → dal console.warn×2 migrated → sdk wires transport at boot → verify JH output formatted | ⏳ | console sweep in libs |
| WP-3 | dev-hot TOC (absorbed): decimal development condition + LIBS + noise filter + empirical restart proof + docs | ⏳ | from fix-dev-hot plan |
| WP-4 | Final live verification: full stack restart, JH log clean, probes green, ledger closure | ⏳ | the never-again proof |

## Execution order: WP-1 → WP-2 → WP-3 → WP-4. Commit cadence per repo rules.
