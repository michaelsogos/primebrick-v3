# Job disable must kill the live NATS schedule — registry vs consumer drift

> Standalone investigation triggered by a dev-db bulk disable (2026-11-04):
> direct `UPDATE job.job_schedules/job_triggers` flipped rows but left live
> JetStream schedule declarations firing. Disabling a job that keeps
> consuming is a cosmetic flag — the disable must reach the NATS layer.

## Status: ⚪ TODO — Plan date: 2026-11-04 13:30 UTC / 14:30 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | us/job: audit the canonical disable paths — `PUT entity job_trigger` (enabled→false) and `POST /api/v1/actions/disarm-job`; verify BOTH reach `disarmSchedule` → `cancelJobSchedule` NATS purge and update `job_schedules.status` | ✅ done | 2026-11-04 | AUDIT VERDICT: canonical path was BROKEN, not just bypassed — `jobs.ctl.triggers.changed` was jetstream-published on a subject the stream never captured (`ai`'s `ensureStream syncSubjects` stomps any extra subject every boot — last-writer-wins race), `.catch(()=>{})` swallowed the failure → hot-reload NEVER worked; trigger CRUD only took effect at restart. FIX (`b0ff22f`→`4c0159e`): core `NatsClient.publish` + `subscribeShielded` reloader + canonical 4 stream subjects + warn on failure. Proven live: enable→arm (seq bump), disable→declaration purged + row `disarmed`. BONUS finding: fired `jobs.due.*` messages nacked on auth errors REDELIVER forever — purge stops future fires only; stale backlog needs consumer-side attention (max_deliver/drop policy). SECURITY note: `jobs.cancel.*` accepted a raw unauthenticated publish — any NATS client can purge any schedule; flag for prod hardening (NATS ACLs) |
| 2 | us/job + sdk: boot-time reconciliation — `reconcileSchedules()` in JH `onReady` AFTER `startTriggersEngine`; sdk gains `listJobScheduleSubjects` + `cancelJobSchedules(subjects\|"all")` (single purge logic, 1/N/all entry points). Rules: row`disarmed`+decl alive → purge; decl alive+no row (orphan) → purge; row`armed`+decl missing → trigger-kind self-heals via engine (skip), manual/infra → mark drift (row lacks payload+forwardHeaders — re-arm cannot be faithful) | ✅ done | 2026-11-04 | SDK `d3d4658`: `getJobSchedule` + `listJobScheduleSubjects` + `cancelJobSchedules(1\|set\|"all")` + `getJetStreamManager`. JH `505de4c`: `reconcileSchedules()` in onReady after engine (E2 ✓). VERIFIED LIVE w/ 3 fixtures: disarmed+live→PURGED · orphan→REPORTED only (E3 relaxed: strict purge deferred until ai direct-fallback removed — report-only now, flag in task 3) · armed+missing→REPORTED only (E1: row lacks payload/auth — never fabricate). E4: per-subject errors collected, boot safe · E5 idempotent · `getLastReconcileReport()` kept for task 3 |
| 3 | us/job + fe: surface drift — if a row is `armed` but the NATS schedule is gone (or vice versa), log + expose in the schedules list so the admin sees the real state | ⏳ partial | 2026-11-04 | DONE (deep-dive pass): job_schedule entity route → READ-ONLY (mirror can't drift via canonical API — `a699558`); disarm-job body-validated; disarmSchedule full SUBJECT_RE. REMAINS: list decorate `live`/`drift` at read-time (1 enumeration per call) + `schedule-drift` action exposing `getLastReconcileReport()` + meta badge fields + FE badge |
| 4 | doc: `.devin/rules` or dev-guide note — job_schedules/job_triggers are mirrors of NATS state; direct SQL writes on them are bypass-only and REQUIRE a `disarmSchedule` NATS call or a job-handler restart to take effect | ⏳ not done | — | prevents repeating today's mistake |
| 5 | decide: FK/guard — should `job_schedules` expose a guarded admin route for bulk disarm ("disarm all") instead of raw SQL? A `POST /api/v1/actions/disarm-all` on job-handler | ⏳ not done | — | DECISION point — today's need was "kill everything for testing" |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

## Deep-dive findings 2026-11-04 (empirical — fixed / open)

FIXED:
- **B1 dueLaneVerify throw→nak-forever** — verify threw AuthError → `nak(5000)` → infinite redelivery (30 poisoned msgs, ~160k errors). FIXED in SDK `613cac3`.
- **B2 user-lane schedules died ~65min after arm** — frozen rotating secret (60m+5m) in declaration headers. dueLaneVerify is now L1-identity + x-user-id claim only; auth re-derived at fire time (existing `freshAuthHeaders` checkpoint → `auth.ctl.resolve_user`), RBAC at callable on CURRENT permissions. LIVE VERIFIED: restart drained all 30 msgs (ack_pending→0), flood stopped.
- **B3 job_schedule entity route writable** — mirror flipped via canonical API (PUT disarmed → NATS keeps firing). Now read-only (list/get/audit) `a699558`.
- disarm-job body validation; disarmSchedule SUBJECT_RE; stale triggers-engine tests.

OPEN (priority order):
- **ai direct-publish fallback** (partition-jobs.ts:86) — produces legitimate orphans; replace with `service.register`-triggered re-declare via governed route → then orphan purge can go strict.
- **Periodic reconcile** — boot-only today; post-boot drift (manual purge/NATS wipe) invisible until restart. Run same fn on interval (config `job.reconcile_interval_ms`) + kind=trigger armed-missing → `refreshTrigger(uuid)` (engine-owned re-derivation).
- **Trigger delete leaves job_schedules row disarmed forever** — registry accumulates dead identities; delete should remove the row (runs keep subject text).
- **declareSchedule TOCTOU** — findAll→add/update races on schedule_subject unique; needs atomic upsert or in-process single-flight.
- **forwarder unreachable-resolver fallback** — forwards frozen headers that die at the callable anyway; should nak/retry instead (transient) or refuse (fail-closed).
- **Silent `.catch(()=>{})`** on disarm at onEvent:268 + refreshTrigger:291 — drift invisible; log warn at least.
- **ensureStream(syncSubjects)** footgun on shared JOBS stream — JH owns config; others must not sync (ai drops the flag, keeps allowMsgSchedules for boot-race create).
- **Old-version ua_prefix rows accumulate** in client_shield_registry (needed for frozen UA headers on old declarations — keep, but document).

---

## Architecture (verified)

**Arm**: `armJobSchedule` (sdk `nats/job-schedule.ts:111`) publishes a
declaration on `jobs.schedule.<svc>.<name>[.<id>]` — rollup subject, the
NATS server itself republishes `payload` to `target` per schedule.
Governed entry: `jobs.ctl.schedule.request` on primebrick-job, which also
writes the `job.job_schedules` registry row.

**Disarm (canonical)**: `cancelJobSchedule(scheduleSubject, cancelSubject)`
(`job-schedule.ts:124`) publishes `Nats-Schedule-Next: purge` on
`jobs.cancel.*` → NATS removes the live schedule server-side. Wrapped by
`disarmSchedule` in `services/schedule-service.ts:158`, reachable via:

- `jobs.ctl.schedule.cancel` NATS route (service callers, namespace-guarded)
- `POST /api/v1/actions/disarm-job` HTTP (admin, `actions-route.ts:99`)
- `triggers-engine` automatically on trigger disable/delete (:264-295)

**The bug shape**: `job_schedules` + `job_triggers.enabled` are *mirrors*
of NATS-resident state. Writing them directly (SQL, DAL bypass) flips the
mirror but the JetStream schedule declaration still republishes `jobs.due.*`
messages — consumers keep firing until a canonical disarm (or a service
restart IF the boot path reconciles — today it does NOT, that is task 2).

**Evidence today**: `jobs.due.user.job.forward.*` kept firing after the bulk
UPDATE, producing `AUTH_CLIENT_SHIELD_SECRET_INVALID` on every stale
message — the schedule was still alive with a pre-rotation signature.

## Why the fix must be structural

"Don't write SQL by hand" is a process rule — the system must make wrong
state unrepresentable or self-healing:

- Boot reconciliation (task 2) turns every restart into a truth sync —
  the single cheap fix that covers all bypasses forever.
- Drift surfacing (task 3) makes residual lies visible instead of silent.
- `disarm-all` route (task 5) gives the legitimate bulk operation so raw
  SQL is never the convenient path again.

## Acceptance

1. Disable a trigger via the normal UI/API → the `jobs.due.*` consumer
   stops firing (verify via NATS monitoring / job-handler logs).
2. `UPDATE job_triggers SET enabled=false` + restart job-handler → no
   messages fire for that trigger afterward (reconciliation works).
3. A schedule row marked `disarmed` with a live NATS declaration is
   disarmed at next boot AND visible as drift before that.
