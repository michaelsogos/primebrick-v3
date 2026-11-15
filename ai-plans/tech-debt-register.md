# Tech-debt register — parent plan for discovered debt

> Living register. Each entry is debt discovered *while doing other work* —
> documented with evidence and a candidate direction, deliberately NOT fixed
> in the session that found it. When an item gets fixed, mark it ✅ and move
> the detail to the implementing plan's task table. When a batch of related
> items is tackled, it graduates to its own plan and links back here.

## Status: 🟠 WIP — Plan date: 2026-11-15

| # | Debt item | Found during | Status |
|---|-----------|--------------|--------|
| 1 | `armed_ref_entity`/`armed_by` dead branches on `job_schedule` | record-sheet collapse fix | ⏳ not done |
| 2 | Entity-scoped `version_history.actions.*` seed duplicates (generator convention) | version-history title TIC | ⏳ partial — crm rows covered by `version-history-title-prose.md` task 5; generator convention open |
| 3 | Pre-existing svelte-check shim errors (alert/loading-bar/password/toggle exports) | system-trigger work | ⏳ not done |
| 4 | Audit: verify every per-instance NATS sub flows through the lifecycle registry | materialize-route flapping debug | ⏳ not done |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## 1 — `armed_ref_entity`/`armed_by` dead branches (job-handler)

**Evidence.** `primebrick-us-v3/job-handler/src/domain/entities/job_schedule_entity.ts:132-158`:

- `armed_ref_entity` = `CASE WHEN trigger_uuid IS NOT NULL THEN 'job_trigger' ELSE 'service_registry' END` — `trigger_uuid` is `NOT NULL` since the kind-drop, so the CASE is a constant `'job_trigger'`.
- `armed_by` COALESCE falls back to `service_registry` name then `service_code` — only reachable on a dangling `trigger_uuid` (impossible by FK + NOT NULL).
- `armed_ref_key` = `COALESCE(trigger_uuid::text, service_code)` — same dead second arm.
- `service_code` column itself may now be vestigial on `job_schedules` (was the infra ownership anchor) — audit remaining consumers before deciding.

**Why not fixed.** Discovered during the record-sheet collapse fix — out of scope there.

**Direction.** Single-truth consolidation: `armed_ref_entity`/`armed_ref_key` collapse to the trigger uuid (or are removed entirely if the FE only needs `armed_by` label + trigger ref); evaluate dropping the `service_registry` join arm and possibly the `service_code` column. Keep audit-writer `created_by` untouched — different concern.

## 2 — `version_history.actions.*` per-entity seed duplicates

**Evidence.** Closed platform enum `AuditAction` (INSERT/UPDATE/SOFT_DELETE/HARD_DELETE/RESTORE/CLONE) — but translation seeds emit a full `*.entities.<e>.version_history.actions.*` block per entity: crm alone has 784 live rows (16 entities × 49). `system` had the same pattern for `customer` (migrated → soft-deleted rows remain in history).

**Status.** The *data* cleanup is owned by `version-history-title-prose.md` task 5 (crm patch soft-deletes the duplicates). **Open here**: the seed-generation convention itself — whoever authors a new entity translation block still copies the action vocabulary in. Decide: (a) convention change — per-entity blocks stop carrying `actions.*` (closed vocab lives only in the generic block), or (b) accept per-entity override as a feature and keep seeds. Aligns with the lookup-level decision in the same plan.

## 3 — Pre-existing svelte-check shim errors

**Evidence.** `pnpm svelte-check` on `primebrick-fe-v3` reports longstanding errors for missing `*.svelte` module shims — `alert`, `loading-bar`, `password`, `toggle` exports. None touch working code; they resurface on every full check and mask real signal.

**Direction.** Add/refresh the `*.svelte` ambient declarations (or fix the upstream exports) so the gate is green and stays meaningful.

## 4 — Audit: all NATS subscriptions through the lifecycle registry

**Evidence.** `bun --hot` reloads stack duplicate handlers when a factory calls `nc.subscribe` directly — root cause of the materialize-route flapping (two subs answering the same queue group, old closure winning). Fixed for `makeNatsRequestRoute` via `dedupedSubscribe` (`sdk/src/nats/nats-routes.ts:43`). `NatsClient.subscribe` itself is registry-owned; `nc.subscribe(inbox, {max:1})` for req/reply is ephemeral by design.

**Direction.** Sweep for raw `nc.subscribe`/connection-level subscribes outside `NatsClient.subscribe`/`dedupedSubscribe` across services (SSE bridge already goes through `nats.subscribe` — verify it's the wrapped client); move per-instance stragglers to the registry path, per the AGENTS.md invariant.
