# fix: schedules page — sparkline truth, run_as correspondence, armed_by

## Goal
The `/system/job/job-schedules` page must tell the truth: every terminal
run state visible in the histogram, run_as chrome coherent across
surfaces, and "Armed By" rendered from structured provenance — never a
string soup.

## Empirical findings (live DB, this session)

### 1. Sparkline — `lost` runs are INVISIBLE
`runStats` SQL counts only `succeeded|failed|skipped`; the status badge
vocab has `dispatched|succeeded|failed|skipped`. The sweeper writes
`lost` (dispatched, never reported) — **28 rows on
`jobs.schedule.job.e2e-callable-dispatch`, ALL runs of that schedule** →
its histogram is an empty frame with tooltip "0 ok, 0 failed, 0 skipped"
while 28 runs happened and were lost. Empty bucket ≠ skipped: `skipped`
is the conservation layer (a due arrived while the schedule was no
longer `armed` — pause/disarm race, 6 rows ever). User expectation
">90% skipped" = the invisible `lost` runs read as skipped.
Also: `dispatched` is a real status not counted in stats (transient, but
a stuck dispatch would be invisible), and `job_run_entity.ts` comment
omits `skipped` (doc drift).

### 2. run_as — it IS a badge, it's just hidden + unexplained
`job_schedule.run_as` and `job_run.run_as` are `type:"badge"`
(user=primary / system=#000000) but `default_visible:false` — the
column never renders, hence "shouldn't it be badge?". Trigger's
`run_as` is visible with a tooltip. Correspondence to document:
`user` = materialized lane of authored `originator|author` (wire has
two lanes only — intent detail is dropped by design);
`system`↔`system` (same black). Gap: no tooltip on schedule/run
explaining the materialization; hidden by default.

### 3. Armed By — triple truth, one of them a string soup
- `created_by` (labeled "Armed By", `type:"ref"`) holds the actor
  stamp: `trigger:<name>` (engine), `rule:<name>` (legacy), `job`/`ai`
  (service declares). The `created_by_name` user-profile join misses
  all of them → raw soup on screen.
- `trigger_uuid` is a real `@Ref("job_trigger")` FK — the join already
  projects `trigger_uuid_name` (same info, structured, rename-proof).
- `job_name` (calculated) ALSO resolves the trigger name via the same
  subselect — third copy of the same fact.
- Writers: `triggers-engine` `initiator:'trigger:<name>'` and
  `schedule-request` `caller_service` → both folded into `created_by`
  (audit abuse). No manual/user arm path exists (entity CRUD is not a
  schedule-arming surface; enable/resume are status ops).
- `dropScheduleMirror` hard-deletes the row when the trigger dies →
  dangling `trigger_uuid` cannot occur on new data; the `trigger:` /
  `rule:` stamp only matters for legacy tombstones.

## Design (existing machinery only)

### A. runStats + status vocab — count every terminal state
- `actions-route.ts` runStats SQL: add
  `count(*) FILTER (WHERE status='lost')` and
  `count(*) FILTER (WHERE status='dispatched')` to the same grouped
  projection (no new query — same scan).
- `job.meta.ts` sparkline series (trigger + schedule + any other
  consumer of the same endpoint):
  `succeeded` fill-emerald-500, `failed` fill-red-500,
  `lost` fill-orange-500 (new — failure-adjacent but distinct: outcome
  never reported), `skipped` fill-neutral-400,
  `dispatched` fill-slate-300 (in-flight honesty — a stuck dispatch
  shows instead of an empty tick).
- `job_run` status badge: add `lost` (color `orange`) — vocab becomes
  dispatched|succeeded|failed|skipped|lost, matching the sweeper's
  write set.
- `job_run_entity.ts` comment: `dispatched | succeeded | failed |
  skipped | lost`.
- Translations patch (JH db-meta, ×7): `job_run.fields.status` value
  keys for `lost` (new) — `dispatched`/`skipped`/`succeeded`/`failed`
  keys already exist (badge vocab).
- Tooltip polish (v3-ui SparklineBars): all-zero bucket → single line
  "No runs" / "Nessuna esecuzione" instead of five zero rows (the
  anatomy loop already iterates series; all-zero is the only special
  case worth collapsing).

### B. run_as — visible + self-documenting
- `job_schedule.run_as`: `default_visible:true` + tooltip/tooltip_title
  explaining "the materialized dispatch lane — originator and author
  both fire as User; System fires with module privileges".
- `job_run.run_as`: same tooltip (stays hidden — the run's lane is
  secondary to status+job_name; reachable via column picker).
- Colors unchanged — correspondence is already right:
  `user`↔`originator` primary, `system`↔`system` #000000.
- Translation keys for the two tooltips ×7.

### C. Armed By — structured provenance + FULL soup purge (user directive)
`rule:`/`trigger:` stamps must never resurface anywhere — purge data
AND every reader. Overlap correction (empirical): `job_run.job_name`
is PARSED from target_subject by run-recorder — `emailsender.send`
stays `emailsender.send`, `jobs.due.user.jobs.x` → `x`. The run's
job_name = WHAT ran (the callable). So on schedules:
- `JobScheduleEntity` `job_name` — rewritten to actually mirror the
  run semantics (the entity comment already claims this but the impl
  resolves jt.name — doc/impl drift): the schedule's OWN
  `target_subject` with the same strip run-recorder applies:
  `regexp_replace({self}.target_subject, '^jobs\.due\.[^.]+\.[^.]+\.', '')`
  — physical column, no join, no created_by, matches its runs' job_name
  verbatim. = "cosa gira quando scatta" (the callable/job tail).
- `JobScheduleEntity` `armed_by` (new `@Calculated`) —
  `COALESCE((SELECT jt.name FROM job.job_triggers jt WHERE jt.uuid =
  {self}.trigger_uuid AND jt.deleted_at IS NULL), {self}.service_code)`
  — "chi l'ha armata": the trigger's live name via FK (rename-proof) or
  the declaring service code. NO created_by reads — the stamp is dead.
- Result per row — ZERO overlap, each column one fact:
  trigger-kind → Job Name `emailsender.send` | Armed By `e2e-gate-…`;
  infra → Job Name `partition-maintenance` | Armed By `job`.
- `trigger` column REMOVED from the list meta — its drill is absorbed
  by `armed_by`; `trigger_uuid` field stays for detail/filters.
- `target_subject` column → hidden in list (same info as job_name, raw
  routing form; detail keeps it).

### C2. armed_by clickable — polymorphic drill (user directive)
`armed_by` must drill to the ARMER's sheet for BOTH kinds. Empirical
findings that shape the design:
- Config-key premise FALSE: `ai.partition-maintenance` is CODE-declared
  (`const JOB_NAME` in `ai/src/controllers/nats-sub/partition-jobs.ts`);
  `partition_maintenance_schedule` config key holds only the cadence —
  no row field identifies a config key. The honest infra armer = the
  SERVICE itself (ownership = module + system: `service_registry.code`
  + `part_of='system'`).
- `service_registry` is NOT entity-served: no
  `/api/v1/entities/service_registry` route exists — it has bespoke
  RPC routes (`GET /api/v1/system/services/:code`, code-keyed) consumed
  by the `/system/settings/modules` page (SSE-live: status, instances,
  health, config CTA). Serving it AGAIN as an entity would create a
  second truth surface — rejected.
- `ref` contract: `entity` static per column; the cell does
  `openSheet('entity.record',{entity, value})` →
  `entityApiBase(entity)` → `/svc/<svc>/api/v1/entities/<e>/<uid>` for
  service-owned entities (census map), `/api/v1/entities/<e>` for
  BE-owned; uuid GET, or `ref.filter_field` business-key → `/list`
  filter → `rows[0].uid` → same GET. Sheet layout from census
  `page_props.form` else `meta.columns` fallback; nested refs drill
  recursively.
Design — GENERAL lazy-ref mechanism (user directive: reusable
everywhere, not an armed_by special-case):
- ref spec gains `entity_field` + `value_field` (optional;
  `entity` XOR `entity_field` enforced by withColumnConstraints):
  `entity = ref.entity ?? row[ref.entity_field]` — any column may
  declare a lazy ref resolving to 2+ entities per row;
  `key = row[ref.value_field] ?? value` — the drill key comes from a
  sibling field when the cell value is a label.
- Contract rule for lazy refs: no `_name` auto-decoration (one join
  can't serve N entities) — the column value IS the display label,
  provided by a @Calculated; the two hidden calc fields provide entity
  + key. Documented in entity-meta.ts.
- FE cell (GENERIC, written once): `entity = column.ref.entity ??
  row[column.ref.entity_field]`; `key = row[column.ref.value_field] ??
  value`; panel dispatch via a static `PANEL_FOR_ENTITY` map —
  `service_registry` → `service.record`, default `entity.record` — any
  future non-entity-served ref target registers its panel there.
  openSheet(panel, {entity, value:key, context}) — entity.record flow
  unchanged for entity-served targets.
- Schedule fields (all @Calculated, hidden except armed_by):
  `armed_ref_entity` = `CASE WHEN trigger_uuid IS NOT NULL
   THEN 'job_trigger' ELSE 'service_registry' END`;
  `armed_ref_key` =
  `COALESCE({self}.trigger_uuid::text, {self}.service_code)` — each
  kind carries the key its drill expects (uuid | code — the panel owns
  the key contract);
  `armed_by` = `COALESCE(jt.name via FK, service_code)` — could join
  `sr.name` for a friendlier label once service_registry is
  platform-shared; code is the canonical fallback.
- NEW `service.record` sheet panel (fe-v3): fetches the EXISTING
  `GET /api/v1/system/services/:code` — recoverable detail: name,
  version/pkg_name, status + last_health_check_at + instances,
  capabilities, schemas, base_url, part_of (module + system root
  ownership).
- Arming section — the trigger-arm parallel minimum (user directive):
  what a trigger arm carries, virtualized for a service armer —
  `{job_name, schedule_spec, run_as}` where
    · `job_name` = what runs (the callable/due tail),
    · `schedule_spec` = the cadence,
    · `run_as` = the USER EXECUTION CONTEXT — `user`|`system` lane:
      trigger-armed = materialized from the trigger's authored intent
      (originator|author → user; system → system);
      service-armed = ALWAYS `system` — the virtual inherit, a service
      has no user context (jobs.due.system.* lanes only).
  Same semantic field the trigger sheet shows — the service sheet
  mirrors it so the arming info is uniform across kinds.
- ExternalLink affordance: `filteredEntityListHref` for entity-served
  targets; `service_registry` → `/system/settings/modules` (canonical
  services page — map carries the page path).
- `trigger` column REMOVED from the list meta — drill absorbed.

### C2b. DAL platform-shared registration (user directive) ✅ DONE
`service_registry` joins the `user_profiles`/`translations` club —
public, non-domain, admissible in joins+display_name:
- `PLATFORM_SHARED_TABLES` += `"service_registry"` (schema-domain.ts).
- NEW DAL-owned `ServiceRegistryRefEntity` — read-only projection of
  `public.service_registry` (uuid, code, name) mirroring
  `UserProfileRefEntity` — the governed join target for any service.
- Verified: calc-SQL subselects bypass the guard today (raw SQL not
  inspected), so the entity-level registration is what makes the join
  a GOVERNED contract rather than a loophole; `created_by_name` is
  likewise hardcoded-unconditional (audit-query.ts), NOT dynamic —
  the precedent is an explicit club, not self-adapting magic.
- IMPL FINDING: `assertEntitySchemaDomain` honors only the caller's
  sharedTables (the SDK passes none) — the built-in set governs the
  RUNTIME path (`resolveEntitySchema`/`getQualifiedTableName` via
  `configureSchemaDomain` union). Ref projections are DAL-internal and
  never enter consumer registries, so the runtime gate is theirs.
  Test: schema-domain.test.ts — 2 new specs prove club membership from
  a `["job"]` domain + the caller-scoped boot semantics.
  659/659 dal tests green, tsc clean. Committed dal-v3.

### C3. armed_at / created_at semantics + labels (user question)
Empirical: `armed_at` is NOT `created_at` — re-arms OVERWRITE it
(partition-maintenance created Oct 12, armed Nov 5). It is the
mechanism's LAST-ARM stamp, not a run-derived value — a never-run
schedule still has armed_at. The honest timeline trio:
`armed_at` (last arm) · `fired_at` (last actual dispatch — calc) ·
`next_run_at` (next due, gated). `created_at` = row birth (audit).
- Labels: `armed_at` "Abilitata il"→"Armata il"/"Armed at" and
  `disarmed_at` "Disabilitata il"→"Disarmata il"/"Disarmed at" — patch
  ×7, pairing armed_at↔armed_by.
- User's "first run row" model corrected: armed_at is declaration-time,
  not min(runs). First-run = min(runs.created_at) is a different fact —
  NOT added (armed_at already bounds the start; no asked-for surface).
- Writers stop the audit abuse — `initiator` param DELETED from
  `DeclareScheduleInput` (it exists only to build the soup): engine
  mirrors stamp `actor='system:job'`; schedule-request stamps
  `system:<caller>` — the same convention `job_run.created_by` uses
  (`system:ai`/`system:job`). `created_by` = who physically wrote the
  row, always.
- Data patch (in 0017): `created_by ~ '^(trigger|rule):'` →
  `'system:job'`; `created_by ~ '^service:'` → `'system:'||tail`;
  bare `'job'`/`'ai'` → `'system:job'`/`'system:ai'`. All current soup
  rows resolve via `trigger_uuid` — verified: every live `trigger:`/
  `rule:` row has a resolvable FK.
- Meta: `created_by` loses the `armed_by` label + the
  `default_visible:true` override → honest hidden audit. New
  `armed_by` calculated text column order ~35, visible, tooltip. The
  armed_at/armed_by pair: `armed_at` = WHEN armed (exists, visible),
  `armed_by` = WHO armed — two honest columns.

### D. Sparkline slot hover — visible slot feedback (v3-ui)
The `Tooltip.Trigger` overlay is already a full-height DOM element per
slot — add the hover chrome there: `hover:bg-foreground/10
hover:ring-1 hover:ring-inset hover:ring-foreground/20
transition-colors rounded-[1px]`. Works identically over empty ticks,
partial stacks and full bars because the overlay sits above the whole
slot — one uniform affordance, zero layout shift (absolute overlay).

### E. "Eseguita il" — `fired_at` BECOMES the last-run instant (user directive)
`fired_at` physical is write-only in the mechanism (stamped on once-fire
`schedule-service.ts:466`, cleared on arm `:284`, heal-write `:574`) —
NOTHING reads it for logic → convert to calculated:
- `JobScheduleEntity`: DROP the physical `fired_at` column; new
  `@Calculated fired_at` =
  `(SELECT max(r.created_at) FROM job.job_runs r WHERE
   r.schedule_subject = {self}.schedule_subject AND r.status <> 'skipped')`
  — "l'ultima volta che ha girato" for EVERY kind (recurring+once),
  every origin (trigger+infra), every lane (user+system). skipped
  excluded per the user's rule (a suppressed due never executed).
- Mechanism stops writing it (remove from the three update payloads);
  `status='fired'` stays the once-terminal marker.
- Meta: `fired_at` declared datetime, VISIBLE — the existing
  `F(job_schedule,fired_at)` label "Eseguita il"/"Fired at" (×7 already
  in DB) now means what it says. No `last_run` column — ONE field.
- DDL patch: `ALTER TABLE job.job_schedules DROP COLUMN fired_at`.
- Empirical: only `partition-maintenance` has runs (135, last
  2026-11-05) → one visible value is the honest current state; e2e runs
  are orphans under name-based subjects.

### E2. next_run_at — NULL unless armed (user directive + live bug)
Live proof: `demo-once` is `status=disarmed` yet carries
`next_run_at=2026-12-14` — a stale projection. `disarmSchedule` DOES
clear it (l.373) and `markScheduleFired` only stamps armed rows — so
the leak is a status-flip path outside disarmSchedule (entity PUT /
admin op flipping status without the next_run_at invariant).
Whack-a-mole fix = gate at the read truth, not at every writer:
- DDL patch: rename physical `next_run_at` → `next_fire_mirror_at`
  (mechanism-owned, hidden).
- Entity: `@Calculated next_run_at` =
  `CASE WHEN {self}.status = 'armed' THEN {self}.next_fire_mirror_at END`
  — the SERVED field is NULL for disarmed/paused/stopped/fired/expired
  → universal `-` contract renders `-`. Served field name + labels
  unchanged; writes target `next_fire_mirror_at`.

### F. Null-cell contract — `-` ALWAYS, no exceptions (user directive)
`formatListCellValue` returns `''` for null; `-` exists only in four
hand-written branches. Every other type falls through to blank.
Fix in `TableCell.svelte`: absent value (`null|undefined|''`) → `-`
EVERYWHERE — normalize `'' → '-'` in the final fallback and every
branch that can emit empty text (datetime `parts.text`, generic text,
badge-null, ref-null, subject/service_code/spec-null). `null_label`
stays the declared contextual override. Sparkline: `buckets===undefined`
(no stats data) → `-`; buckets present (even all-zero) → the tick frame
(zeros ARE data). json empty → `-`.

### G. Expected-vs-actual fires — the enumeration analysis
`nextScheduleFire` (SDK): `@every`/`@at` derivable; **cron → null BY
DESIGN** ("NATS owns cron evaluation — a second interpreter would
drift"). Live check: all 5 current schedules are `@every`/`@at` →
enumerable today.
- @every per bucket: closed-form, no iteration — fires landing in
  `[max(armed_at, bucketStart), bucketEnd)` via interval floor-math.
- @at: expected ∈ {0,1}.
- `missed` = expected − recorded (ALL run rows count — a `skipped` run
  IS an arrived fire, only suppressed).
- Limits to state honestly: re-arms overwrite `armed_at` (pre-last-arm
  misses invisible); cron specs → `expected=null`, the observable proxy
  is `next_run_at` staleness (armed cron + stale next = missed,
  drift-class signal, not a per-bucket count).
- Deliverable in this plan: compute `expected`/`missed` per bucket
  server-side in runStats for @every/@at only → optional 4th series
  `missed` (fill-rose-400 or similar) — the honest "was supposed to
  fire but nothing arrived" anomaly. Gate: only when derivable;
  tooltip shows "expected not derivable (cron)" as a line when null.

## Files touched
- `primebrick-us-v3/job-handler/src/controllers/http/actions-route.ts` (stats SQL: lost + dispatched + expected/missed)
- `primebrick-us-v3/job-handler/src/modules/jobs/job.meta.ts` (series, badge vocab +lost, run_as visible+tooltips, created_by→audit, armed_by, fired_at visible)
- `primebrick-us-v3/job-handler/src/domain/entities/job_schedule_entity.ts` (`armed_by` @Calculated, `fired_at` → @Calculated, `job_name` loses the soup branch)
- `primebrick-us-v3/job-handler/src/domain/entities/job_run_entity.ts` (status comment)
- `primebrick-us-v3/job-handler/src/services/schedule-service.ts` (actor rule, `initiator` param deleted, fired_at writes removed)
- `primebrick-us-v3/job-handler/src/services/triggers-engine.ts` + `controllers/nats-sub/schedule-request.ts` (honest `system:*` actors)
- `primebrick-us-v3/job-handler/db-meta/patches/0017_*.sql` (DROP fired_at + rename next_run_at + created_by soup purge + lost key + label/tooltip renames ×7) — signed
- `primebrick-v3-ui/src/lib/components/SparklineBars.svelte` (slot hover chrome + all-zero tooltip line)
- `primebrick-v3-core/src/entity-meta.ts` (ref `entity_field`/`value_field` contract keys + constraint)
- `primebrick-dal-v3/src/meta/schema-domain.ts` (service_registry → PLATFORM_SHARED_TABLES)
- `primebrick-dal-v3/src/entities/service-registry-ref-entity.ts` (NEW — public projection à la UserProfileRefEntity)
- `primebrick-fe-v3/src/lib/components/entity-list-table/table/TableCell.svelte` (null `-` contract + per-row ref/panel dispatch)
- `primebrick-fe-v3/src/lib/shell/sheets/panels/ServiceRecordPanel.svelte` (NEW — `service.record` sheet, backed by `GET /api/v1/system/services/:code`)
- `primebrick-fe-v3/src/lib/entity-list/entity-links.ts` (per-row entity in filteredEntityListHref call)
- e2e: `jobs-pages.spec.ts` (lost series + armed_by resolution + fired_at assertions)

## Acceptance criteria
- `lost` and `dispatched` counted in runStats + rendered as sparkline
  series and status badges — no run state is invisible.
- Hover on any sparkline slot shows a uniform highlight (empty ticks
  included) + the existing styled tooltip.
- Every absent cell renders `-` — one rule, all branches (`null_label`
  override intact); sparkline shows `-` only when no stats exist.
- `fired_at` visible and = last actual dispatch (skipped excluded) for
  every kind — partition-maintenance resolves a timestamp; physical
  column dropped, mechanism writes removed.
- "Run As" badge visible on schedules; tooltip explains the
  originator/author→user materialization.
- "Armed By" shows trigger name (FK) / service code AND drills to the
  armer's record sheet per row kind (job_trigger | service_registry)
  via the `entity_field`/`source_field` ref extension; `trigger`
  column dropped from the list.
- `armed_at`/`disarmed_at` relabeled "Armata il"/"Disarmata il".
- `next_run_at` renders `-` for every non-armed status (gated calc;
  stale `demo-once` row self-heals).
- `created_by` back to hidden audit; `initiator` param deleted;
  writers stamp `system:*`.
- `trigger:`/`rule:`/`service:`/bare-code soup PURGED — data patched,
  zero readers remain (job_name + armed_by read only FK/service_code).
- @every/@at schedules: runStats returns `expected`+`missed` per bucket;
  cron → null (stated in tooltip).
- 210+ JH unit/standards green; sparkline e2e green; live boot clean.

## Known limits (stated, not silently shipped)
- cron specs → `expected=null` (NATS owns cron evaluation by design —
  no second interpreter); tooltip states it. `next_run_at` staleness on
  an armed cron schedule is the drift proxy, not a per-bucket count.
- Re-arms overwrite `armed_at` — misses before the last arm are not
  reconstructible (history lives in runs, not the mirror).
- A disarmed or never-due schedule shows an all-empty histogram — the
  truth (no fire was due).

## Progress log

- **Turn 1 — dal-v3** ✅ `4cdf591`: `service_registry` → `PLATFORM_SHARED_TABLES` + `ServiceRegistryRefEntity` projection (uuid/code/name, `UserProfileRefEntity` precedent). 659/659 dal tests.
- **Turn 2 — contract + us-v3** ✅ `47da940` (v3-core: `entity_field`/`key_field` lazy-ref keys), `c3cdbc4` (dal-pg: XOR/required enforcement), `cf1a428` (JH):
  - Entities: `fired_at` physical dropped → @Calculated latest non-skipped run; `next_run_at` → `next_fire_mirror_at` + status-gated calc; `armed_by`/`armed_ref_entity`/`armed_ref_key` calcs; `job_name` → callable tail (run-recorder parity); trigger `next_run` repointed.
  - Writers: `initiator` deleted everywhere; honest `system:<caller>`/`system:job` actors; all `next_run_at` writes → `next_fire_mirror_at`; no `fired_at` writes remain.
  - `runStats`: lost/dispatched counts + `expected`/`missed` closed form (@every armed-window, @at 0/1, cron null); skipped counts as arrival; mirror rows read via `JobSchedulesService.listRowsBySubjects` (this.dal, no new debt).
  - Meta: armed_by lazy-ref col (visible, tooltip), run_as visible+tooltip, `lost` badge, 6 sparkline series ×2, `next_run_at`/`fired_at` calc-kind declared, `created_by` back to hidden audit.
  - Patch `20261114202425_schedule_armed_truth`: DROP fired_at, RENAME next_run_at→next_fire_mirror_at, soup purge (verified live: trigger:/rule:→system:job, bare codes→system:*), relabels ×7 armed/disarmed, 91 new rows (lost/missed/plumbing labels + hints).
  - Verified live: calc SQL against real rows (partition-maintenance fired_at=2026-11-05T01:24, demo-once gated null), meta served shape (lazy ref contract in wire), 216/216 tests, standards clean, boot + post-apply drift clean.
- **Turn 3 — FE/UI** ✅ `4f8f46b` (be-v3: 3 i18n patches — service_registry labels, is_enabled, job_schedule system-key revert), `1c88d6f` (v3-ui: SparklineBars hover chrome + noRunsLabel), `293635e` (fe-v3): TableCell lazy-ref engine (`refEntity = ref.entity ?? row[ref.entity_field]`, `refKey = row[ref.key_field] ?? value`), `REF_PANEL_FOR_ENTITY` (service_registry→service.record), universal `-` contract, ServiceRecordPanel (armed-schedule section + service info), 13/13 jobs e2e.
- **Turn 4 — semantic split + housekeeping** ✅ `a6d060d`/`e2bc1a1` (job_name = COALESCE(jt.name sans deleted_at, callable tail); service_code→default_visible:false; e2e divergenza orfani), `0196037` (hidden:true su next_fire_mirror_at/armed_ref_entity/armed_ref_key), `fb15578` (updated_at non dichiarato → banda canonica 2130 su trigger/schedule/provider/template), `9e5841a` dal-v3 (warn su audit-field dichiarati).
- **Turn 5 — audit actor `system:*` resolution** ✅ DONE (B globale):
  - `86fe5eb`+`581113f` dal-v3: 2nd LEFT JOIN service_registry gated su `system:%` (CASE in rightExpr — `x:<code>` actors non risolvono) → `X_name=COALESCE(up.display_name, sr.name, actor)`; `<col>_ref_entity`/`_ref_key` wire-only verdicts guidati dal join matchante (NULL→raw text, no affordance); actor cols → lazy ref `entity_field/key_field`; `auditActors()` + `changed_by` stessa COALESCE 3-vie; `JoinExpr.rightExpr`({self}) + verbatim `projections`; fixture `service_registry` nei test DB. 659/659.
  - Seam note (plan correction): `userEntity` non è iniettata via buildConfig — è un parametro di `buildAuditableJoinsSelective`; `serviceEntity` è entrato nella stessa seam reale (options param; `entity-service.ts` passa `ServiceRegistryRefEntity` come passa `UserProfileRefEntity`).
  - `8516784` us-v3: `service_code` → `hidden:true` su job_schedule (drop definitivo — duplicato di created_by; campo fisico resta per armed_by/armed_ref_key calcs + filterable/searchable). mdx rigenerato, 216/216.
  - FE: ZERO modifiche sorgente — accordion audit resta text-only per design standard (display name via `_name`); il link vive nella cella lista via lazy ref già shippato al Turn 3.
  - `a9ee21c` fe-v3 e2e: nuovo test `created_by` service-actor → service.record; `service_code` picker-absence lock; ref-cell-sheet spec → row-scoped selectors + nuovo contratto unresolved (plain text, no affordance).
  - Live-verified via `JobSchedulesService.list` su DB reale: `system:job`→"Process Manager"(service_registry, key=job), `system:ai`→"AI Assistants Manager", `migration-armed-truth`→raw+NULL ref; `audit.actors` vocab → labels risolti. E2E: 3/3 jobs-pages + 15/15 ref-cell-sheet (customers su be-v3 = prova multi-servizio).
- **Turn 7 — Destination Event default-visible** ✅ `eb1a01a` us-v3 (`target_subject` → `default_visible:true` su job_schedule, mdx rigenerato), `ecc79b0` fe-v3 (lock e2e columnheader). 216/216 + e2e green.
- **Turn 6 — lifecycle stamps → audit block** ✅ `dd34d38` dal-v3 (kind:"calculated" ora passa da `withAuditOrder` — gap: tornava presto, audited calc restava order:undefined fuori band), `b7312d5` us-v3 (`fired_at`/`armed_by`/`armed_at`/`disarmed_at` → `audited:true`, extras band 2000-2030 in declaration order; fired_at/armed_at/armed_by `default_visible:true`, disarmed_at togglable; semantica: armed_at storia monotona persiste, disarmed_at stamp attivo azzerato al riarmo). mdx rigenerato (doc-gen esclude audited dalla tabella business). 216/216 + e2e 4/4.
