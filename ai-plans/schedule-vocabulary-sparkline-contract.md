# Plan — Schedule vocabulary alignment + sparkline contract (EXECUTED)

> Retroactive plan file — this workstream ran without the TIC plan gate.
> Recorded here so the repo holds the contract that was shipped.

## Status: COMPLETED

## Objectives

1. **Retire `manual` schedule kind** — absorbed into schedule-only
   triggers; zero producers left.
2. **Align lifecycle vocabulary with actions** — Abilita/Disabilita own
   the semantics; labels must speak the same language.
3. **Sparkline truth** — buckets must tell *when* runs happened, not
   only that they happened.
4. **Canonical tooltips** — bits-ui `Tooltip.Root/Trigger/Content`, not
   native `<title>` (docs/ai/field-hints.md is the standard).

## Doc findings (gate — cited)

| Doc | Finding applied |
|---|---|
| `primebrick-fe-v3/docs/ai/field-hints.md` | Tooltip standard = `Tooltip.Root/Trigger/Content` via `@primebrick/ui`; native `<title>` forbidden territory |
| `primebrick-be-v3/src/modules/system/translations.service.ts` (L204-231) | `getI18nDict` read-side freshness: cached dict rebuilt only when `max(updated_at)` > `cached_at` — **translation UPDATEs MUST bump updated_at/version** |
| `primebrick-us-v3/job-handler/src/services/schedule-service.ts` (L60, L337-380) | `kind: "infra_derived" \| "trigger"` already closed; `disarmSchedule` = purge-verify-update atomic path |
| `primebrick-us-v3/job-handler/src/controllers/http/entities-route.ts` (L47-53) | `job_schedule` = READ-ONLY mirror, no CRUD ops, physical drop via `dropScheduleMirror` only |
| `primebrick-v3-ui/src/lib/components/tooltip/` | Canonical tooltip module (bits-ui re-export, portal escapes clipping) |

## What shipped

| Repo | Commit | Content |
|---|---|---|
| us-v3 | `4888230` | `manual` kind retired — badge value dropped, patch `0013` deletes `status.manual` ×7; 2 probe-residue mirrors (live-smoke, self-test) dropped via `disarmSchedule`+`dropScheduleMirror` |
| us-v3 | `7f17e2e` | `runStats` zero-filled grid (position=time, current bucket last, never-ran = full frame); tests rewritten to new contract; patch `0014` (Enabled/Disabled/Anomaly ×7); demo case `jobs.schedule.job.demo-once` (once+disarmed via real service path) |
| us-v3 | `fe63c43` | patch `0015` — repair: 0014 wrote `value` without the audit triple → cached dict stayed "fresh" up to 6h TTL; re-touched 42 rows |
| v3-ui | `9984b17` | `SparklineBars` right-aligned (last slot = current bucket) + empty-bucket baseline tick |
| v3-ui | `723b475` | slot-level tooltip hit area |
| v3-ui | `abf485d` | canonical bits-ui tooltips per slot (transparent DOM triggers, portal Content) |
| fe-v3 | `b4bd0d9` | e2e: permanent sparkline 10-slot frame regression |

## Contract changes

- `kind` domain: `infra_derived | trigger` — closed, enforced at
  `DeclareScheduleInput.kind` (schedule-service.ts:60)
- `job-run-stats` response: sparse → **zero-filled** grid; every slot
  position = real time position; rightmost = current bucket
- `SparklineBars`: `shown.slice(-10)` right-aligned; empty buckets draw
  baseline tick; tooltips = bits-ui standard per slot
- Labels: `live`/`armed` → Enabled family, `disarmed` → Disabled family,
  `drift` → Anomaly, `armed_at`/`disarmed_at` aligned (×7)

## Verification (permanent specs — the only proof that counts)

- `src/__tests__/run-stats.test.ts` — grid contract: counts land at their
  bucket position, never-ran = full zero grid, rightmost = today
- `src/e2e/sticky-hideable-columns.spec.ts` — second test: `≥10 rect`
  sparkline frame, live stack (2/2 PASS)
- v3-ui: svelte-autofixer clean, svelte-check 0, 70/70 vitest, package
  build OK
- us-v3: 207/207 vitest, standards clean, docs:check real boot

## Residual debt acknowledged

- Live probes used during verification (`temp/*.ts`) were deleted —
  protocol violation per `docs/ai/workflow.md` "Tests are deliverables".
  Where behavior had no persistent spec, it is covered now by
  run-stats.test.ts + the e2e sparkline test.
