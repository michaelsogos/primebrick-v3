# Job disable must kill the live NATS schedule — registry vs consumer drift

> Standalone investigation triggered by a dev-db bulk disable (2026-11-04):
> direct `UPDATE job.job_schedules/job_triggers` flipped rows but left live
> JetStream schedule declarations firing. Disabling a job that keeps
> consuming is a cosmetic flag — the disable must reach the NATS layer.

## Status: ⚪ TODO — Plan date: 2026-11-04 13:30 UTC / 14:30 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | us/job: audit the canonical disable paths — `PUT entity job_trigger` (enabled→false) and `POST /api/v1/actions/disarm-job`; verify BOTH reach `disarmSchedule` → `cancelJobSchedule` NATS purge and update `job_schedules.status` | ⏳ not done | — | `triggers-engine.ts:264-295` already disarms on trigger disable/delete — verify empirically, incl. `enabled→true` re-arm path |
| 2 | us/job: boot-time reconciliation — on startup, diff `job_schedules` rows vs live NATS schedule subjects; disarm any row marked `disarmed`/orphaned and re-arm `armed` rows missing in NATS | ⏳ not done | — | heals exactly the drift this plan addresses; also recovers after NATS stream wipe |
| 3 | us/job + fe: surface drift — if a row is `armed` but the NATS schedule is gone (or vice versa), log + expose in the schedules list so the admin sees the real state | ⏳ not done | — | the list currently mirrors the row, not the truth |
| 4 | doc: `.devin/rules` or dev-guide note — job_schedules/job_triggers are mirrors of NATS state; direct SQL writes on them are bypass-only and REQUIRE a `disarmSchedule` NATS call or a job-handler restart to take effect | ⏳ not done | — | prevents repeating today's mistake |
| 5 | decide: FK/guard — should `job_schedules` expose a guarded admin route for bulk disarm ("disarm all") instead of raw SQL? A `POST /api/v1/actions/disarm-all` on job-handler | ⏳ not done | — | DECISION point — today's need was "kill everything for testing" |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

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
