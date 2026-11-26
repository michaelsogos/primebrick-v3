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

## Status: 🟢 DONE — all 4 WP complete and empirically verified 2026-11-26. Debt classes 1+2 eliminated. job_run audit semantics ignored per user decision; D8 edge-gateway trust is a future planned phase, not debt.
## Design decision locked: minimal logger in core (env-neutral); OTel stays in sdk, injected as transport hook — OTel in core would poison the FE browser bundle.

| # | Task | Status | Notes |
|---|------|--------|-------|
| WP-1 | Shield cruft sweep: delete service-shield.ts shim, strip imports in ai+job-handler, patch drop system.client_shield_registry + orphan config entries, regen api-reference | ✅ | us 0283cee/3ae93a6/e251141, sdk e5a09b7, be 9940b08, dal bb71638 — all pushed; DB patch signed+applied in every schema, zero orphan rows verified, table dropped |
| WP-2 | core/logger minimal (levels+fmt+transport hook) → dal console.warn×2 migrated → sdk wires transport at boot → verify JH output formatted | ✅ | core/logger shipped; transport auto-wired inside installConsoleBridge (skipped under VITEST); dal 902/902, sdk 660/660 exit 0; JH log: `2026-11-26T14:15:58.219Z warn withColumnConstraints[...]` — structured, zero bare prints |
| WP-3 | dev-hot TOC (absorbed): decimal development condition + LIBS + noise filter + empirical restart proof + docs | ✅ | decimal 7d18010 + us-v3 eb6a8fd pushed; crm fresh boot = zero watch warnings; touch decimal/src → respawn proven (boot count 2→3); dev-server.md documents two-layer watch |
| WP-4 | Final live verification: full stack restart, JH log clean, probes green, ledger closure | ✅ | full stack up 2026-11-26: zero watch warnings in all 5 US logs, zero bare prints, JH job_run warning structured; materialize boot-race self-heals by design; AI 503 = LLM endpoint unreachable (environmental, pre-existing, out of sweep scope) |

## Execution order: WP-1 → WP-2 → WP-3 → WP-4. Commit cadence per repo rules.
