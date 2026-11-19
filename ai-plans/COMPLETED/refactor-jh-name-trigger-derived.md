# JH — chain TRIGGER → SCHEDULE → RUN hardened; display_field = trigger-derived

> v3 — refined per user direction. Reverts physical `name` (us `850c62a`) AND
> removes the field entirely: the trigger's display name surfaces through one
> unified `trigger` column — `job_schedule.armed_by` renamed `trigger`,
> `job_run.trigger` already exists — both `type:"ref"` + `kind:"calculated"`,
> both `display_field` (sticky first-visible). `job_trigger.name` stays the
> physical display_field labeled "Name". Runs must ALWAYS derive from a
> trigger: `job_run.trigger_uuid` → NOT NULL, every insert path carries
> trigger lineage, uncorrelated own-lane inserts stop.

## Status: ✅ DONE — verified empirically 2026-12-21 (moved to COMPLETED)

> Landed as `69dfa4c` (revert `850c62a` → derived identity) + FE
> `a549c89`/`88419b4`/`52fa69c`. Empirical re-verification: NO `@Column
> name` on either entity; `trigger_uuid` NOT NULL both tables (DB live:
> 0/356 NULL); `trigger` calc = `COALESCE(jt.name, uuid::text)` on both;
> `display_field:"trigger"` in both metas (`jobTriggerMeta` keeps
> `name`); `JobForwardEnvelope` has no `name`; forwarder resolves
> `scheduleRow?.trigger_uuid ?? trampolineTriggerUuid(subject)` + stamps
> `x-job-trigger-id`; recorder drops unresolvable lineage with warn;
> patch `20261222090000` applied (legacy DELETE + NOT NULL + DROPs + i18n
> `armed_by`→`trigger`); `ServiceRecordPanel` binds `context_row.trigger`;
> E2E uses `columns-toggle-trigger`; JH vitest 158/158, standards clean.
> Chain proven live by the choreography e2e (watcher fire → run row with
> `trigger_uuid` recorded, 2026-12-21).

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `job_schedule_entity.ts`: drop `@Column name` (no replacement — `armed_by` already resolves `job_triggers.name` live + survives soft-delete, uuid fallback covers hard-delete) | ⏳ | — | |
| 2 | `job_run_entity.ts`: drop `@Column name`; `trigger_uuid` → `nullable:false` | ⏳ | — | `trigger` calc already joins trigger.name — becomes display_field |
| 3 | `schedule-service.ts`: `DeclareScheduleInput.name` removed; mirror insert stops stamping name | ⏳ | — | |
| 4 | `triggers-engine.ts`: `declareSchedule` call drops `name`; envelope drops `name` | ⏳ | — | NO `trigger_uuid` in envelope — already on the wire (subject tail) |
| 5 | `due-forwarder.ts`: `insertRun` → `trigger_uuid: scheduleRow?.trigger_uuid ?? trampolineTriggerUuid(msg.subject)`; drop `name`/`scheduleRow.name`; stamp `x-job-trigger-id` on republish (lineage headers: x-job-run-id, x-job-schedule-subject precedent) | ⏳ | — | adds `trampolineTriggerUuid()` helper next to `trampolineSubject()` — grammar single-sourced |
| 6 | `run-recorder.ts`: `recordDirectRun` → `trigger_uuid` from `x-job-trigger-id` header ?? scheduleRow; **no trigger resolvable → warn + skip insert**; drop `name` write + `parseTarget().name` | ⏳ | — | verify middleware propagates `x-job-*` headers into results |
| 7 | `job_schedule_entity.ts` + meta: `armed_by` calc **renamed `trigger`** (same COALESCE expr — `jt.name` else `trigger_uuid::text`); `display_field:"trigger"`; col → identity position (sticky, `hideable:false`, `default_visible:true`, order ~10, drop `audited:true`); drop `name` column | ⏳ | — | D1 resolved: header "Trigger", ref link — unified vocabulary with `job_run.trigger` |
| 8 | `job_run_entity.ts` + meta: `trigger` calc → `COALESCE(t.name, {self}.trigger_uuid::text)` (D2: symmetric fallback); `display_field:"trigger"`; col → identity position; drop `name` column; `schedule` ref stays hidden drill | ⏳ | — | `job_trigger.name` physical stays display_field labeled "Name" — no change |
| 9 | DB patch: `DROP COLUMN name` both tables; delete non-correlatable legacy runs (294 — user confirmed pre-chain: services emitting results directly); `job_run.trigger_uuid` SET NOT NULL; sign + regen snapshots | ⏳ | — | destructive — flagged |
| 10 | i18n: delete `fields.name` rows for schedule+run (orphaned); `fields.armed_by` → rename/retarget to `fields.trigger` on schedule; `fields.trigger` on run exists | ⏳ | — | |
| 11 | Tests: forwarder/schedule/recorder suites — name → trigger_uuid assertions; uncorrelated-result skip case | ⏳ | — | |
| 12 | FE: `ServiceRecordPanel` `context_row.name` → `context_row.trigger` (+ label `fields.trigger`); E2E `columns-toggle-name` → `columns-toggle-trigger` (both lists); `RunRow.name` → `trigger` | ⏳ | — | commit fe separately |
| 13 | Verify: JH vitest + live fire chain (trigger → schedule → run, name resolves in both lists; uncorrelated own-lane publish → warn, no row); commit us | ⏳ | — | |

---

## TIC — chain audit (verified in source + live DB)

### Wire facts

- Trampoline: `jobs.due.<lane>.job.forward.<trigger.uuid>` — **the trigger uuid IS the subject tail** (`triggers-engine.ts:124` `trampolineSubject(lane, trigger)`; JH owns publish AND consume — intra-module grammar). Every dispatch — scheduled fire or immediate event fire — arrives at the forwarder with trigger uuid in `msg.subject`. **No envelope field needed** (would be the 2nd copy of info already transported); `event.uuid`/`event.batch` are SOURCE-entity identities, not the trigger — no overlap, but no need either.
- `JobForwardEnvelope` `{mark, name?, target, payload, schedule_subject?}` — `name` becomes dead weight once name derives via join; `schedule_subject` stays (it's the run→schedule link for scheduled fires; absent on immediate).
- Lineage headers precedent: forwarder already stamps `x-job-run-id` + `x-job-schedule-subject` on the republished callable message → result reports carry them back. Adding `x-job-trigger-id` hardens run-trigger correlation when the schedule mirror is already hard-deleted by result time.
- `job_run` also gets `trigger` (existing `type:"ref"` calculated join, resolves `job_triggers.name`, survives soft-delete) — as display_field it IS the run's job identity; `name` column goes entirely.

### The real hole (now closed)

`insertRun` today: `trigger_uuid: scheduleRow?.trigger_uuid` — immediate event-fired dispatches have no schedule mirror → **trigger_uuid NULL → run exists outside trigger lineage**. Fixed by the subject-tail parse: the trampoline subject itself is proof a trigger dispatched it.

`recordDirectRun`: own-lane `jobs.result.*` with no `x-job-run-id` correlation = a callable executed with NO JH dispatch — under "everything is a trigger" that's an anomaly, not a job run → warn + skip (still acked). Correlated results keep the update path; `x-job-trigger-id`/schedule headers resolve trigger on fresh inserts where legitimate.

### Legacy rows (user confirmed: pre-chain — services emitted schedules/results directly)

- `job_schedules`: 10/10 trigger-owned — NOT NULL already true.
- `job_runs`: 294/329 trigger-less (`partition-maintenance` ×135, `crm.emit_fake_event` ×123, `emailsender.send` ×36; targets NULL/old tail names) — can't be honestly attributed → **delete in migration** (dev data, acknowledged legacy), then SET NOT NULL.

## Open points — resolved (user decisions, 2026-11-19)

- **D1 ✔**: trigger list → `name` labeled "Name" (unchanged); schedules → `trigger` labeled "Trigger" as **ref link** (field key `armed_by` → renamed `trigger`, same calc); runs → `trigger` labeled "Trigger". One vocabulary: `trigger` = the owning trigger on both entities.
- **D2 ✔**: yes — `job_run.trigger` gets the same `COALESCE(t.name, trigger_uuid::text)` fallback as schedule: hard-deleted triggers surface the uuid, never "—".
- **D3 ✔**: `x-job-trigger-id` on the republish — hardens run→trigger correlation past schedule-mirror hard-delete. Middleware `x-job-*` propagation verified in TOC; fallback `x-job-schedule-subject`→row→trigger already exists.
- **D4 ✔**: skipped/failed-early runs keep inserting — every forwarder-consumed message arrives via `job.forward.<uuid>` = trigger-dispatched by grammar; NOT NULL holds by construction.

## Impacted files

US `job-handler`: entities `job_schedule_entity.ts`, `job_run_entity.ts`; services `schedule-service.ts`, `triggers-engine.ts`, `due-forwarder.ts`, `run-recorder.ts`; `modules/jobs/job.meta.ts`; `db-meta/patches/<ts>_trigger_chain_name.sql`; test suites ×3.
FE: `ServiceRecordPanel.svelte`, `sheet-manager.svelte.ts` comment, e2e helpers + specs (`columns-toggle-*`).

## Acceptance criteria

- Full chain proven live: create trigger "X" → schedule mirror `armed_by`="X" → fire → run `trigger`="X" — and a **trigger rename relabels schedule+run display live** (calculated, no re-arm).
- Every NEW job_runs row has trigger_uuid (scheduled, immediate, skipped, correlated-update); uncorrelated own-lane publish → `warn`, no row.
- `job_run.trigger_uuid` NOT NULL in schema; schedules list shows trigger name as pinned first-visible column; runs list same via `trigger`.
- JH vitest green; `columns-toggle-armed_by`/`columns-toggle-trigger` verified live; stack stays up.
