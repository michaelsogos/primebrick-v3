---
id: schedule-lifecycle-actions
title: Schedule lifecycle actions — arm/disarm/stop/pause/disarm-all + endpoint-declared FE custom actions
status: open
created: 2026-11-05
owner: job-handler + sdk + core + fe
---

# Schedule lifecycle actions + remote custom-action pipeline

Extracted from `fix-job-disable-must-kill-consumer` task 5 — the scope grew
from "a disarm-all route" into the full lifecycle-action surface plus the
missing remote custom-action dispatch pipeline (meta → FE).

## Semantics (user-decided 2026-11-05)

Two levels, always distinct:

| Action | Level | Semantics | Re-arms? |
|---|---|---|---|
| STOP (`disarm-job`, existing) | instance | purge declaration only | yes — owner/engine may re-arm |
| PAUSE (`pause-schedule`) | owner-ad-interim | `enabled` stays true; re-generation suppressed | no, until RESUME |
| DISABLE (`disarm-schedule`) | owner | trigger → `enabled=false`; infra → sticky `disarmed` suppression | never — only explicit `arm-schedule` |
| ENABLE (`arm-schedule`) | owner | trigger → `enabled=true` + refreshTrigger; infra → unsuppress + owner rearm ping | — |
| DISARM ALL / PAUSE ALL / RESUME ALL | bulk owner-level | bulk version of the above | — |

**ENABLE/DISABLE = ARM/DISARM SCHEDULE, always** — trigger or not, they are
owners not runs. `disarm-job` (STOP) is the ONLY instance-level op and is
the temporary one (≈ "stop this execution now").

## Empirical evidence (verified 2026-11-05 — all live code)

### Arm-suppression gap (infra sticky disarm — user requirement)

- `declareSchedule` (`schedule-service.ts:~192`) gates ONLY on terminal-once
  (`@at` fired/expired same-spec → `{skipped:"terminal-once"}`). A
  `disarmed`/`paused` row is NOT checked → the mirror upsert writes
  `status:"armed"` → **any owner re-declare (boot, config-change) silently
  resurrects an admin-disabled infra job today**. The suppression gate is
  required: row.status ∈ {disarmed, paused} → `{armed:false, skipped:"suppressed:<status>"}`.
- Identity = `schedule_subject`. Same subject + different spec while
  suppressed → stays suppressed (deliberate). New subject (new job name)
  = new identity → arms normally.
- `refreshTrigger` (engine re-derive) needs the same gate for kind=trigger
  paused rows; the event-side `armTimer` path too (see pause analysis).

### Queue/durability analysis (for pause semantics)

- **Inbound event lane**: `subscribeShielded(trigger.event_subject, …)` —
  PLAIN NATS subscribe (queue-group for LB per engine comment :344), NOT
  JetStream durable. Events arriving during pause have NO backlog to
  preserve: skip-eval = drop; unsubscribe = drop. Conservation is
  impossible without a new durable event lane (stream capture of event
  subjects + durable consumers) — separate workstream if ever wanted.
- **Critical consequence**: event+schedule triggers — an event match calls
  `armTimer` → would RE-ARM a paused schedule. Pause MUST gate the event
  handler's arm step too, or pause is a lie for this trigger kind.
- **Silent-consume vs dead-letter**: events skipped during pause are
  dropped either way. Optional `jobs.dlq.<event_subject>` dead-letter
  publish for audit — additive, config-flaggable, not required for v1.
- **Outbound last-mile**: forwarder republishes to the callable via
  `NatsClient.publish` (PLAIN — `emailsender.send` is declared
  `nats_send: "fire-and-forget"` queue subscribe, no JetStream). If the
  callable is down at fire time → message lost → run row ages
  `dispatched→lost` via sweeper. The durable boundary stops at
  `jobs.due.*` (JOBS_STREAM workqueue, `maxDeliver:5` since 2026-11-05).
  True last-mile durability = per-service JetStream capture — separate
  workstream, NOT in this plan.
- **Suppression survives restart**: `paused`/`disarmed` are mirror states —
  boot reconcile + periodic reconcile respect them (terminal/expected-gone).

### Status vocabulary (job_schedules.status)

Current: `armed | disarmed | fired | expired`. Additions:
- `stopped` — STOP wrote this (or left armed+missing? DECIDED: `stopped` =
  expected-gone, no drift alarm; re-arm by owner/engine allowed — NOT a
  suppressor).
- `paused` — suppressor; cleared only by resume.
- `disarmed` (existing) — suppressor for infra (sticky); for trigger-kind
  it is the schedule-side mirror of `trigger.enabled=false`.
`scheduleDrift` must treat `stopped`/`paused`/`disarmed` as expected-gone
(no `missing` drift), and a live declaration on any of them = `stale`
(existing logic already covers live-on-terminal via TERMINAL_STATUSES —
extend the set).

### FE/meta pipeline gaps (verified)

- `meta.actions` (`EntityAction` in core `entity-meta.ts:47`) — ops emitted
  with `endpoint:{method,path}`; dispatch doctrine documented in FE
  `docs/ai/entity-list-pages.md` ("declared endpoints, not conventions").
- `table.row_custom_actions` (`RowCustomAction` core :351) — chrome only:
  `action_name` (== op), `translation_key`, `icon`, `required_permission`,
  `disabled_when_deleted`. NO endpoint/row_key/payload binding.
- BE-only mechanism: `metaExtraScans` (`be/src/http/entity-router.ts:122`)
  scans extra-prefix routers into `meta.actions` (`change_password` on
  `/api/v1/auth/users/:uuid/…`). **SDK `makeServiceRoutes` has NO
  equivalent** — remote entities cannot attach custom ops at all.
- `useRowActions.handleCustomAction` (FE :313) — JS `customActionHandlers`
  only; no handler → 501 toast. Remote host-rendered lists CANNOT supply
  handlers (archetype is generic) → **remote row_custom_actions are dead
  code today**.
- `TableMeta` — no `bulk_custom_actions` (bulk bar maps only standard
  `delete.bulk`/`restore.bulk`/`duplicate.bulk`).
- Remote host surface (`ModuleHostBase`, core `page-route.ts:436`) —
  `ctx.api()` service-bound fetch + `components.mfaStepUp` exist for
  remote SHEETS; irrelevant for host-rendered lists (the host does the
  calls).
- Enforcement doctrine (fail-fast construction): SDK entity-router already
  refuses `permissions.export` without `meta` (:391) — same pattern must
  gate custom ops: a `row_custom_actions.action_name` with no declared op
  → boot error. Lint rule in check-standards = belt (static cross-check
  meta↔service-routes), construction check = the real guard.

## Design (locked pending final OK)

### Routes (all `RpcRoute[]` in `rpc:` — `/api/v1/actions/*`, NEVER entity paths)

- `POST /api/v1/actions/disarm-job` — EXISTS, unchanged (STOP).
- `POST /api/v1/actions/disarm-schedule` — body `{schedule_subject}`; kind=trigger → `trigger.enabled=false` + `refreshTrigger`; infra → `disarmSchedule` + sticky `disarmed`.
- `POST /api/v1/actions/arm-schedule` — trigger → `enabled=true` + refresh; infra → clear suppression + `jobs.ctl.schedule.rearm.<svc>` ping (owner re-declares fresh payload/headers; services lacking a rearm handler → row unsuppressed, `missing` drift visible until natural re-declare — documented edge).
- `POST /api/v1/actions/pause-schedule` / `resume-schedule` — pause: suppression flag (+ event-arm gate); resume: like arm.
- `POST /api/v1/actions/disarm-all` — bulk: all enabled triggers → enabled=false+refresh; all armed infra → disarm+sticky; report `{disarmed, skipped, errors}`.
- `POST /api/v1/actions/pause-all` / `resume-all` — freeze/thaw (maintenance window; survives restart via mirror).
- Permission: `AUTHENTICATED_ADMIN`; bulk ops additionally guarded by FE `mfaStepUp` (host provides it for remote ops).

### Suppression gates (arm paths)

- `declareSchedule`: row.status ∈ {disarmed,paused} → `{armed:false, skipped:"suppressed:<status>"}` (symmetric to `terminal-once`).
- `refreshTrigger`: trigger's schedule row paused → skip arm step.
- Event handler arm path (`armTimer` via event match): paused → skip arm (event still evaluates — silent-consume documented; optional DLQ flag).

### Schema/meta

- `job_schedules.status` += `stopped`, `paused` (vocabulary change — DB patch optional CHECK? check if status has CHECK constraint; meta badge values + i18n ×7).
- `scheduleDrift`: `stopped|paused|disarmed` = expected-gone (no `missing`); live-on-any = `stale`.
- `job_schedule` meta `table.row_custom_actions`: `stop`/`pause`/`disable`/`enable` (+`resume` on paused rows — visibility by row status? RowCustomAction has no per-row-visibility predicate — check FE filter mechanism or accept always-visible with server-side refuse).
- `job_schedule` meta `table.bulk_custom_actions` (NEW contract): `disarm_all`, `pause_all`, `resume_all`.

### Cross-repo extension (endpoint-declared custom actions)

- **core** `entity-meta.ts`: `RowCustomAction` += `row_key?: string` (row→body field bind, sparkline convention); `EntityActionEndpoint` stays `{method,path}`; `TableMeta.bulk_custom_actions?: BulkCustomAction[]` (`{action_name, translation_key, icon, required_permission, requires_selection?, confirm?}`).
- **sdk** `service-routes.ts`/`rpc-router`: `RpcRoute.entity_op?: { entity: string; op: string }` — the ROUTE declares its op binding; `makeServiceRoutes` attaches `op`+`endpoint` to that entity's `meta.actions`. Construction check: entity must exist in `entities`; op must be unique; every `row_custom_actions.action_name` must resolve to a declared op → fail-fast (mirrors `metaExtraScans` intent but route-declared = single source, no scan tables).
- **fe** `useRowActions.handleCustomAction`: no JS handler + op has `endpoint` → dispatch `apiFetch(endpoint.path, {method, body:{[row_key]: row[row_key]}})` via service proxy + refresh list. `customActionHandlers` stays for interactive flows (dialogs). Bulk: `useBulkActions` gains custom-CTA dispatch (selection-aware).
- **Breaking-change note**: op names snake_case (`disarm_schedule`) — action paths kebab (`/actions/disarm-schedule`); op derived from `entity_op.op` explicitly, NOT from path parsing.

### Docs to update

- FE `docs/ai/entity-list-pages.md` — custom CTA section: endpoint dispatch becomes canonical; `customActionHandlers` = interactive-only.
- JH `index.mdx` — action surface + pause/sticky-disarm semantics + DLQ note.
- Core api-reference + SDK api-reference — regenerated (extract-docs), no hand edits.
- check-standards rule proposal: `meta.row_custom_actions`/`bulk_custom_actions` action_names must resolve to `entity_op`-declared RpcRoutes in `service-routes.ts` (static cross-check).

## Edge cases (acknowledged)

1. Same subject + changed spec while suppressed → still suppressed (identity = subject). New subject = new job → arms.
2. Mirror row deleted by surgery + owner re-declare → fresh arm (no row). Deliberate surgery, acceptable.
3. Infra arm/resume with no rearm handler on owner → unsuppressed + `missing` drift until natural re-declare. Drift badge shows it.
4. STOP on trigger-kind → `stopped` → engine `refreshTrigger`/reconcile-rescue may re-arm at next interval — temporary by design (≤ reconcile_interval).
5. Trigger enabled + schedule paused → engine gates both re-derive and event-arm; event evaluation continues (drop semantic documented).
6. `disarm-all` while a `once` is mid-flight → terminal statuses skipped in report.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | core: `RowCustomAction.row_key`, `TableMeta.bulk_custom_actions`, `BulkCustomAction` type + extract-docs | ⏳ | additive, breaking-safe |
| 2 | sdk: `RpcRoute.entity_op`, `makeServiceRoutes` op attach + construction fail-fast + tests | ⏳ | mirrors BE metaExtraScans intent |
| 3 | jh: suppression gates in `declareSchedule`/`refreshTrigger`/event-arm + `stopped`/`paused` status + drift update | ⏳ | sticky disarm = user req |
| 4 | jh: routes arm/disarm/pause/resume/×-all + infra rearm ping contract (`jobs.ctl.schedule.rearm.<svc>` — doc + JH publish; owner handler contract documented for services) | ⏳ | permission ADMIN; report shapes |
| 5 | jh meta: row_custom_actions + bulk_custom_actions + status badges + i18n patch ×7 + re-sign | ⏳ | patch 20261112x |
| 6 | fe: `handleCustomAction` endpoint dispatch + bulk custom CTA + mfaStepUp on bulk + refresh | ⏳ | useRowActions/useBulkActions |
| 7 | tests: gates (suppress/paused/stopped), routes, FE dispatch; JH suite + fe where wired | ⏳ | |
| 8 | docs: entity-list-pages.md, JH index.mdx, check-standards rule + extract-docs regen | ⏳ | |
| 9 | E2E live: disable→survives restart+redeclare; pause→freeze; resume→thaw; disarm-all report | ⏳ | |

## Open decisions

- [ ] DLQ for events skipped during pause — add now or later? (proposed: later, config-flaggable)
- [ ] Row-status-conditional action visibility (show RESUME only when paused) — predicate in RowCustomAction vs always-visible+server-refuse?
- [ ] Bulk ops MFA step-up required? (FE pattern exists via `components.mfaStepUp`/useMfaStepUp)
