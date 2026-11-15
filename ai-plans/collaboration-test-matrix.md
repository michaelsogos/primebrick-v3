# Collaboration & concurrency — E2E test matrix

> Session-shape doctrine landed in `docs/ai/e2e-browser-session.md`
> ("Multi-session matrix"): TAB vs TAB = `browser.newContext()` ×N on one
> browser; BROWSER vs BROWSER = real binaries — shared Edge (CDP :9333 /
> channel msedge), Playwright Chromium, Opera GX via `executablePath`.
> Timing axiom: 5s expectation budget; longer ONLY for declared phases
> (e.g. AI model download). FE binds `::1` — probe `localhost`.

## Status: ⚪ TODO — Plan date: 2026-11-02 ~14:05 CET

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Doc: multi-session matrix + 5s axiom + IPv6 note in `e2e-browser-session.md` | ✅ done | 2026-11-02 |
| 2 | `collaboration-form.spec.ts` hardened: per-test fixture, 5s waits, declared callable `emailsender.send` | ✅ done | 3/3 green |
| 3 | `callable-catalog` bug: lazy `size===0` guard → boot census fetch in `startCallableCatalog` | ✅ done | was a prod bug |
| 4 | Optimistic-concurrency spec (BROWSER vs BROWSER) — two independent writers racing one record's `version` | ⏳ not done | never written |
| 5 | Presence many→one→many for `/list` pages (BROWSER vs BROWSER + multi-record channels) | ⏳ not done | model not built yet — blocked on product design |
| 6 | Cross-browser presence smoke: Edge ↔ Opera GX on one record (avatars/merge across engines) | ⏳ not done | same family as 4 |
| 7 | Decide: TAB-vs-TAB vs BROWSER-vs-BROWSER split for existing collaboration suite | ⏳ not done | owner decision |

---

## Notes

**Optimistic concurrency (task 4)**: entity writes carry `?version=` — two
real browsers load the same record, both edit, both save; the second PUT
must 409 and the UI must surface the conflict affordance. TAB-vs-TAB is NOT
valid here: the contract under test is "truly independent clients", which
includes divergent clocks/rendering — requires BROWSER vs BROWSER.

**Many→one→many (task 5)**: target model for `/list` pages — many records on
screen, one channel per record is wrong; the channel likely aggregates
entity-level presence (one SSE per entity type, entries keyed by
`entity_uuid`). Product design pending; the test must drive ≥3 records
visible in two browsers and assert per-record presence chips.
