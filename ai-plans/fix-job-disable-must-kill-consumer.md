# Job disable must kill the live NATS schedule — registry vs consumer drift

> Standalone investigation triggered by a dev-db bulk disable (2026-11-04):
> direct `UPDATE job.job_schedules/job_triggers` flipped rows but left live
> JetStream schedule declarations firing. Disabling a job that keeps
> consuming is a cosmetic flag — the disable must reach the NATS layer.

## Status: 🟡 IN PROGRESS — Plan date: 2026-11-04 13:30 UTC / 14:30 CET · updated 2026-11-05 (tasks 1–4 done; ONLY task 5 remains — paused for user questions on `disarm-all` semantics)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | us/job: audit the canonical disable paths — `PUT entity job_trigger` (enabled→false) and `POST /api/v1/actions/disarm-job`; verify BOTH reach `disarmSchedule` → `cancelJobSchedule` NATS purge and update `job_schedules.status` | ✅ done | 2026-11-04 | AUDIT VERDICT: canonical path was BROKEN, not just bypassed — `jobs.ctl.triggers.changed` was jetstream-published on a subject the stream never captured (`ai`'s `ensureStream syncSubjects` stomps any extra subject every boot — last-writer-wins race), `.catch(()=>{})` swallowed the failure → hot-reload NEVER worked; trigger CRUD only took effect at restart. FIX (`b0ff22f`→`4c0159e`): core `NatsClient.publish` + `subscribeShielded` reloader + canonical 4 stream subjects + warn on failure. Proven live: enable→arm (seq bump), disable→declaration purged + row `disarmed`. BONUS finding: fired `jobs.due.*` messages nacked on auth errors REDELIVER forever — purge stops future fires only; stale backlog needs consumer-side attention (max_deliver/drop policy). SECURITY note: `jobs.cancel.*` accepted a raw unauthenticated publish — any NATS client can purge any schedule; flag for prod hardening (NATS ACLs) |
| 2 | us/job + sdk: boot-time reconciliation — `reconcileSchedules()` in JH `onReady` AFTER `startTriggersEngine`; sdk gains `listJobScheduleSubjects` + `cancelJobSchedules(subjects\|"all")` (single purge logic, 1/N/all entry points). Rules: row`disarmed`+decl alive → purge; decl alive+no row (orphan) → purge; row`armed`+decl missing → trigger-kind self-heals via engine (skip), manual/infra → mark drift (row lacks payload+forwardHeaders — re-arm cannot be faithful) | ✅ done | 2026-11-04 | SDK `d3d4658`: `getJobSchedule` + `listJobScheduleSubjects` + `cancelJobSchedules(1\|set\|"all")` + `getJetStreamManager`. JH `505de4c`: `reconcileSchedules()` in onReady after engine (E2 ✓). VERIFIED LIVE w/ 3 fixtures: disarmed+live→PURGED · orphan→REPORTED only (E3 relaxed: strict purge deferred until ai direct-fallback removed — report-only now, flag in task 3) · armed+missing→REPORTED only (E1: row lacks payload/auth — never fabricate). E4: per-subject errors collected, boot safe · E5 idempotent · `getLastReconcileReport()` kept for task 3 |
| 3 | us/job + fe: surface drift — if a row is `armed` but the NATS schedule is gone (or vice versa), log + expose in the schedules list so the admin sees the real state | ✅ done | 2026-11-05 | DONE (deep-dive pass): job_schedule entity route → READ-ONLY (`a699558`); disarm-job body-validated; disarmSchedule full SUBJECT_RE. list decorate `live`/`drift` at read-time (`jobs.service.ts`); strict orphan purge ACTIVE. **2026-11-05 (2nd pass):** `POST /api/v1/actions/schedule-drift` added (`actions-route.ts` — read-only: `getLastReconcileReport()` + fresh live enumeration, `enumeration_ok` flag, never mutates); `live` (boolean) + `drift` (badge: `stale` red / `missing` amber) virtual columns in `job.meta.ts`; `status` badge fixed to include `fired`/`expired`; i18n keys ×7 langs + `reconcile_interval_ms` config seed → patch `20261112000000`, MANIFEST re-signed (`dev-micha-2`). FE: zero code — badges render from meta |
| 4 | doc: `.devin/rules` or dev-guide note — job_schedules/job_triggers are mirrors of NATS state; direct SQL writes on them are bypass-only and REQUIRE a `disarmSchedule` NATS call or a job-handler restart to take effect | ✅ done | 2026-11-05 | index.mdx: "Mirror semantics" section — live truth = JetStream declarations; SQL UPDATE leaves declaration firing until reconcile; boot+periodic reconcile converge; drift columns documented. Fire-time-auth section updated to throw/defer semantics. `schedule-drift` route added to HTTP surface table |
| 5 | decide: FK/guard — should `job_schedules` expose a guarded admin route for bulk disarm ("disarm all") instead of raw SQL? A `POST /api/v1/actions/disarm-all` on job-handler | ⏸️ paused | — | **PAUSED 2026-11-05 — user wants to discuss semantics first.** Open questions: disarm-all = "stop now" vs permanent (trigger-kind re-arms on boot if triggers stay enabled); scope filter (`kind`/`service`); permission level. Do NOT implement until the user decides |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

## Deep-dive findings 2026-11-04 (empirical — fixed / open)

FIXED:
- **B1 dueLaneVerify throw→nak-forever** — verify threw AuthError → `nak(5000)` → infinite redelivery (30 poisoned msgs, ~160k errors). FIXED in SDK `613cac3`.
- **B2 user-lane schedules died ~65min after arm** — frozen rotating secret (60m+5m) in declaration headers. dueLaneVerify is now L1-identity + x-user-id claim only; auth re-derived at fire time (existing `freshAuthHeaders` checkpoint → `auth.ctl.resolve_user`), RBAC at callable on CURRENT permissions. LIVE VERIFIED: restart drained all 30 msgs (ack_pending→0), flood stopped.
- **B3 job_schedule entity route writable** — mirror flipped via canonical API (PUT disarmed → NATS keeps firing). Now read-only (list/get/audit) `a699558`.
- disarm-job body validation; disarmSchedule SUBJECT_RE; stale triggers-engine tests.

OPEN (priority order — updated 2026-11-05, struck items resolved):
- ~~**ai direct-publish fallback**~~ — RESOLVED: ai now arms via governed `jobs.ctl.schedule.request` (`armJobSchedule` SDK wrapper); strict orphan purge verified live.
- ~~**Trigger delete leaves job_schedules row**~~ — RESOLVED: `dropScheduleMirror` wired into trigger delete.
- ~~**declareSchedule TOCTOU**~~ — RESOLVED: single-flight lock inside the atomic arm protocol.
- ~~**ensureStream(syncSubjects)** footgun~~ — RESOLVED: ai drops the flag; JH owns JOBS stream config.
- ~~**Silent `.catch(()=>{})`**~~ — RESOLVED: publish failures now `warn`-logged.
- ~~**Periodic reconcile**~~ — RESOLVED 2026-11-05: `setProcessInterval` in `onReady`, `reconcile_interval_ms` config-governed (default 300000, 0 disables — seeded via patch `20261112000000`); `kind=trigger` armed-missing → `refreshTrigger(trigger_uuid)` rescue (engine re-derives; `rescueTrigger` injected to keep schedule-service engine-free); `infra_derived` armed-missing still surfaces as drift. Boot call now passes the same rescue.
- ~~**forwarder unreachable-resolver fallback**~~ — RESOLVED 2026-11-05: `freshAuthHeaders` now throws `AuthCheckpointUnreachable` on resolver outage — handler naks, fire defers to redelivery. Verified why: `dueLaneVerify` post-B2 checks static identity + `x-user-id` claim only, NOT rotating secrets — so arm-time headers were STALE CLAIMS the callable would ACCEPT (roles frozen at arm time), not dead headers. Fallback = bypass of the checkpoint.
- ~~**Old-version ua_prefix rows accumulate** in client_shield_registry~~ — RESOLVED 2026-11-05: documented as deliberate (old declarations need frozen UA headers to still verify); index.mdx mirror-semantics section covers the model.
- ~~**jobs.cancel.\* accepts raw unauthenticated publish**~~ — RE-HOMED: `ai-plans/nats-acl-hardening.md` (NATS server account/JWT ACLs = infra config, not service code).
- ~~**due-lane redelivery on auth errors**~~ — RESOLVED 2026-11-05: `consumer.maxDeliver: 5` on both `job-due-forwarder-user`/`job-due-forwarder-system` durable consumers — poisoned messages bound to 5 attempts; the `dispatched→lost` sweeper closes run-level accounting.

### Residual drift check (2026-11-05)

- Task 5 `disarm-all`: **paused — user deciding**. Only remaining item.
- Tests: 89/89 JH suite green (2 new rescue tests + unreachable-throw contract).
- Typecheck clean; DB patch `20261112000000` added + MANIFEST re-signed.

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
