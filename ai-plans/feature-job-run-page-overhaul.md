# Feature — `job_run` list page overhaul (3/3 of the JH ELT alignment)

> Third and last page of the Job Handler ELT alignment (schedules ✅,
> triggers ✅ — see session history). The triggers/screenshots turn
> surfaced a systemic gap that is part of this plan: persisted
> `visibleKeys` freeze a list's column set forever — meta evolution
> (new columns, changed defaults) never reaches existing profiles.
> Scope: `job_run` meta + entity + FE page + one shared contract fix.

## Status: ✅ DONE — Plan date: 2026-11-17 · implemented+verified 2026-11-17 (all tests green)

| # | Task (detail level — one row per task) | Status | When | Notes |
|---|----------------------------------------|--------|------|-------|
| 1 | `job.meta.ts` — jobRunMeta column overhaul: reorder, `run_as`→visible, **`service_code` dropped from meta**, `status` badge recolor, `schedule_subject`→`format:"nats_subject"`+"Coda di Ingresso"+null_label, `trigger`/`trigger_uuid`/`report`/`fire_seq` new columns | ✅ done | 2026-11-17 | us-v3 |
| 1b | **Physical `service_code` drop** (`3c4b471` precedent): migration patch `ALTER TABLE job.job_runs DROP COLUMN service_code` + remove `@Column` from `JobRunEntity` + remove writes (`due-forwarder.ts:81`, `run-recorder.ts:119`) — `parseTarget` keeps returning svc for the `created_by` actor stamp (executor provenance stays in `created_by`, exactly the schedules end-state) + MANIFEST re-sign | ✅ done | 2026-11-17 | us-v3 db-meta — patch `20261117140000` applied |
| 2 | `job_run_entity.ts` — `@Calculated` projections `trigger_uuid` + `trigger` (name via mirror join) | ✅ done | 2026-11-17 | us-v3 |
| ~~2b~~ | ~~`parseTarget` writer fix~~ — **superseded by 1b**: the "job"-trampoline executor bug only manifested through the `service_code` column; dropping it kills the wrong-data path (`created_by=system:job` on gate dues was already truthful) | ✅ resolved by 1b | — | — |
| 3 | `job.meta.ts` — `table.filter_presets` `outcome` button_group (all/succeeded/failed/skipped/lost/dispatched, default `all`) | ✅ done | 2026-11-17 | us-v3 |
| 4 | `job.meta.ts` — `table.default_sort` → `{key:"created_at",dir:"desc"}` | ✅ done | 2026-11-17 | us-v3 |
| ~~5~~ | ~~`table.row_custom_actions` `view_run`~~ — **REVERSED by user**: "per adesso non si apre nulla". Read-only entities have no actions column by design (every row op gates on `meta.actions` — `useRowActions`/`EntityListTable.svelte:543-575`); `entity.record` remains the automatic drill whenever a `ref` column on ANY page points at a run — no CTA needed, no endpoint needed. The invented `POST /actions/view-run` was also removed from `actions-route.ts` | 🚫 dropped | 2026-11-17 | endpoint removed |
| ~~6~~ | ~~`runs/+page.svelte` customActionHandlers~~ — **REVERSED**: page stays untouched (only the existing `duration_ms` cell override) | 🚫 dropped | — | — |
| 7 | ~~`TableCell.svelte` deep-link / `service_registry` ref~~ — **superseded**: `service_code` fully dropped (task 1b); no FE work needed | ✅ resolved | — | — |
| 7b | **`RunDetailSheet.svelte` dead-field cleanup** (part of the 1b drop): removed `service_code`/`initiator`/`lane` `dt/dd` pairs + fields from the `JobRun` type. Sheet stays declared+unopened; `remote-sheet.spec.ts` positive test green against live fixture | ✅ done | 2026-11-17 | us-v3 fe |
| 8 | Translations patch ×7 langs: `fields.trigger`, `fields.trigger_uuid`, `fields.*.states.manual`, `presets.outcome.{label,…_tip}` (option labels **reuse `status.*`** — same words as the badge, one vocabulary — see A.5), **`fields.schedule_subject` relabel → "Coda di Ingresso"** + MANIFEST re-sign — bundled into ONE patch with the 1b schema drop | ✅ done | 2026-11-17 | us-v3 db-meta |
| 9 | `useEntityList.svelte.ts` — visibleKeys contract fix: `{shown,hidden}` model + legacy migration (preserves exact current render, new columns honor `default_visible`). Helpers `VisibleKeyPrefs`/`deriveVisibleKeyPrefs`/`resolveVisibleKeyPrefs` live in `v3-core columns.ts`, re-exported via `@primebrick/ui` and `$lib/entity-list` | ✅ done | 2026-11-17 | fe-v3 + core |
| 10 | Unit tests: `service-routes.test.ts` meta assertions (JH 148 green); `columns.test.ts` visibleKeys v2 spec (core 24 green); writer tests updated for the drop | ✅ done | 2026-11-17 | us-v3 + core |
| 11 | E2E `jobs-pages.spec.ts`: served-meta contract, rendered visibility, preset outcome wire AND-ing, `schedule_subject` nats_subject anatomy, visibleKeys v2 migration regression — 4 new tests, all green; `remote-sheet.spec.ts` fixture switched to live-uuid resolution (dev DB is reseeded; hardcoded uuid had rotted) | ✅ done | 2026-11-17 | fe-v3 — 25/25 jobs-pages + 2/2 remote-sheet |
| 12 | Verify: `tsc --noEmit` clean (JH), `svelte-check` 0 errors (FE), vitest green (JH 148 / FE 687 / core 24), Playwright green, live meta contract verified via authenticated E2E | ✅ done | 2026-11-17 | — |
| 13 | Commits per repo + plan status update | ⏳ in progress | — | |
| — | User remediation (NO code): Columns sheet → reset on triggers/schedules/runs to heal stored prefs | ⏳ not done | — | manual — visibleKeys v2 self-heals legacy profiles, reset optional |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Empirical evidence (TIC findings, cited)

### A.1 Current `job_run` contract

- Entity `job.job_runs` — persisted fields: `uuid`, `schedule_subject?`,
  `service_code`, `job_name`, `run_as`, `status`, `fire_seq?`,
  `error_code?`, `error_detail?`, `duration_ms?`, `redelivery_count?`,
  `report?` (jsonb) + audit.
  `job-handler/src/domain/entities/job_run_entity.ts:20-75`
- Meta declares 11 columns; **`fire_seq` and `report` are absent** —
  unreachable even via column picker or record sheet (served meta is the
  only surface). `job-handler/src/modules/jobs/job.meta.ts:361-389`
- Entity decl is read-only (`meta`/`list`/`get`) — the run row IS the
  audit trail. `job-handler/src/controllers/http/entities-route.ts:58-68`
- No `entity_op` binds `job_run` — all actions ride `job_schedule`.
  `job-handler/src/controllers/http/actions-route.ts:326-448`
- `JobRunsService` has **no `auditPort`** → no entity-changed marker on
  `addRun`/`patchRow`. `jobs.service.ts:465-500`
- Page `runs/+page.svelte` already humanizes `duration_ms` via `cell`
  override and sets `deletionFilter={false}`; **no `syncChannel`**.
- Sibling column conventions verified: `run_as` is default-visible on
  BOTH `job_schedule` (`default_visible:true`, `job.meta.ts:232`) and
  `job_trigger` (no flag → visible, `job.meta.ts:129`). `job_run`'s
  `default_visible:false` is the outlier — user's call confirmed.
- Trigger ref convention: schedules' `armed_by` = `@Calculated` ref
  displaying the resolved name, `ref.key_field` drills by uuid
  (`job.meta.ts:308-311`). IT vocabulary: `job_trigger` = **"Attivatore"**
  (`db-meta/patches/20261115230000_trigger_it_attivatore.sql`).
- `format:"service_code"` renders module icon + translated-name badge,
  and the badge IS an `<a>` link — href = constant
  `/system/settings/modules` (generic list, NOT the specific module).
  `TableCell.svelte:191-375`. Audit `_by` cells by contrast render
  plain resolved text (no link, no badge) via the `<col>_name` join.
  **User decision: column DROPPED — `created_by` owns provenance**
  (A.1b) — no renderer involved at all.
- Subject-field convention: EVERY subject-valued column on the sibling
  ELTs is `type:"text"`, `format:"nats_subject"` —
  `job_trigger.event_subject` (zap, `options_source:"census.emits"`),
  `job_trigger.target_subject`, `job_schedule.schedule_subject`
  (zap, "Coda di Ingresso"), `job_schedule.target_subject` (send).
  `job_run.schedule_subject` was `type:"ref"` — the only outlier.

### A.1b What `service_code` IS on a run — the EMPIRICAL truth (corrected)

The `job_schedules.service_code` saga (git-verified):
`0393390` badge chrome → `a6d060d` hidden → `8516784` suppressed
("**created_by owns provenance**") → `3c4b471` physical DROP —
rationale in patch `20261115220000_schedule_service_code_drop.sql`:
the namespace it denormalized was **already carried by
`schedule_subject`** (`jobs.schedule.<owner>.<name>`) and the audit
actor: "a second copy is a second truth".

**Live `job.job_runs` census — the column as actually written:**

| `service_code` | `created_by` | `job_name` | rows | Writer path |
|---|---|---|---|---|
| `ai` | `system:ai` | partition-maintenance | 135 | `recordDirectRun` own-lane — stamps `created_by = system:<service_code>` → **column ≡ created_by literally** (`run-recorder.ts:130`) |
| `emailsender` | `system:job` | emailsender.send | 39 | `due-forwarder` — **the only true divergence** (writer=JH, executor=ES) |
| `job` | `system:job` | crm.emit_fake_event | 36 | `recordDirectRun` on `jobs.due.<lane>.job.<callable>` → svc=`"job"` = **the trampoline, NOT the executor — factually wrong** |
| `job` | `system:job` | emailsender.send | 28 | same writer bug |

**~84% of rows: `service_code` duplicates `created_by`** (identical
value, or `"job"` which IS `created_by`'s actor). **Zero business-logic
reads** of the column (no `WHERE service_code` in the engine — display
only). And it is a **second truth that is actively wrong on ~27% of
rows** — exactly the scenario the schedules drop was designed to
eliminate.

**The writer bug** (`run-recorder.parseTarget:71-76`): for due subjects
`jobs.due.<lane>.<consumer>.<action>` the `<svc>` segment is the **due
consumer** — `job` when the trampoline routes the due, `ai` when the
service consumes its own lane. `parseTarget` reads it as the executor;
when the action segment is itself a callable (`crm.emit_fake_event`)
the real executor is the action's first token. `due-forwarder` does
NOT have the bug (it stamps `envelope.target.split('.')[0]` — the real
callable, `:81`).

**Why `created_by` still can't answer "who executed"**: the `_name`
join resolves `system:<svc>` via `service_registry`
(`auditable-joins.ts:143-146`) and renders **plain text — no link, no
sheet** (`TableCell` auditable branch). The `service_code`→
`service_registry` **ref** is the only cell that carries the
`service.record`-sheet + `/system/settings/modules/[code]` deep-link
anatomy (`TableCell.svelte:93-111,429-443`).

**Verdict — DROP (user decision, `3c4b471` precedent)**: the column is
display-only (zero business reads), ~84% redundant with `created_by`,
and factually wrong on ~27% — a second truth that lies. Physical drop
+ writers stop writing it; `parseTarget` keeps its `<svc>` parse for
the `created_by` actor stamp (own-lane self-recording stays truthful,
`system:job` on forwarded rows stays the writer). Executor provenance
answer becomes the same one schedules use: **created_by owns
provenance** — and on forwarded runs the callable's service is
embedded in `job_name` (`emailsender.send` → `emailsender`).

### A.2 Status vocabulary (verified against writers)

`due-forwarder` inserts `dispatched` at due-forward; `run-recorder`
flips to `succeeded|failed`; lost-sweep marks stale `dispatched`→`lost`;
`skipped` = due suppressed. `dispatched` IS the in-flight state — there
is no separate executor start-ack (a true RUNNING would need engine
changes; out of scope).
`src/services/due-forwarder.ts:70,259`, `src/services/run-recorder.ts:116`

**User-decided colors** (labels unchanged): `dispatched` gray→`info`,
`skipped` amber→`gray`, `lost` orange→`amber`. `succeeded`=green,
`failed`=red unchanged.

### A.3 The stored-prefs freeze (root cause of "missing columns")

`pb:<prefix>:visibleKeys` (sessionStorage; legacy localStorage read
fallback) restores verbatim → `sanitizeVisibleKeys` intersects with
served columns and falls back to `defaultVisibleColumnKeys` **only when
the intersection is empty** → `persistState` re-writes the resolved set
on every render. A stored set is self-perpetuating: meta-evolved columns
never enter it. `useEntityList.svelte.ts:252-258,339-385`;
`core/src/columns.ts:104-125`. Explains the user's gutted tables AND the
original "`next_run` not visible" complaint. Reset exists:
`onResetColumnVisibility` → `defaultVisibleColumnKeys` (line 877-879).

### A.4 No live list push exists (verified)

`syncChannel` = `BroadcastChannel` (same-browser cross-tab only —
`useSyncChannel.svelte.ts`); `entity-changed` = row-scoped presence SSE
(`/entities/{e}/{uuid}/presence`) for collaborative forms
(`presence-channel-registry.svelte.ts:140-170`). No entity-scoped
list-changed mechanism → **live refresh is out of scope** (documented,
not implemented; see Part E).

### A.5 Contracts used

- `@Calculated(expr, {pgType,nullable?})` — `{self}` = row alias;
  projections are queryable like physical (sortable/filterable).
  `job_trigger_entity.ts:104-136` (is_system/runs/last_run/next_run).
- `null_label: { label_key, when? }` renders the key when the cell value
  is null — works for `ref` columns too (nullLabel branch after ref,
  `TableCell.svelte:480-481`). `core/src/entity-meta.ts:389-393`.
- `row_custom_actions` — **us-v3 contract (corrected TIC)**: every
  `table.row_custom_actions` entry MUST name an op backed by an
  `RpcRoute.entity_op` — `makeServiceRoutes` fail-fasts at boot on a
  dead CTA (`entity-list-pages.md:117-134`). The
  "meta action + page `customActionHandlers`, no route" pattern is BE-only
  (`change_password`), NOT available to `makeServiceRoutes` services.
  Endpoint dispatch is canonical: no JS handler →
  `POST meta.actions[action].endpoint` `{[row_key]: row[row_key]}`.
  `useRowActions.svelte.ts:327-395`.
- **Row→detail affordances on read-only entities (verified)**:
  `edit` CTA gates on `update.single` (`EntityListTable.svelte:544`);
  row dblclick → census `kind:"detail"` route (`click-handlers.ts:20-29`)
  — `job_run` has neither → **no actions column by design**
  (`hasEntityRowActions` false → suppressed). The `rowActions` SNIPPET is
  a documented `EntityListTable` escape hatch but `EntityTablePage` does
  NOT forward it (only the `rowActions` boolean — `EntityTablePage.svelte:57,94,224`).
- **`job.runDetail` remote sheet EXISTS** — `nav.sheets[]`
  (`nav-declaration.ts:99-105`), `fe/src/RunDetailSheet.svelte`, props
  `{run_uuid}`, fetches the standard `get` route — but was NEVER wired to
  any UI opener (only the E2E programmatic proof, `remote-sheet.spec.ts`).
  **User decision: no view CTA — it stays an unopened surface.**
- `entity.record` sheet opens via
  `openSheet('entity.record', { entity, value, ref? })` and renders all
  served non-`hidden` columns in form anatomy — the canonical "view a
  record" surface, reached automatically whenever a `ref` column points
  at a run (e.g. `trigger`/`trigger_uuid` ref cells).
- Preset option labels **reuse the `status.*` vocabulary** — the preset
  options are literally the status values the badge already translates;
  parallel `presets.outcome.<status>` keys would be two sources for one
  word (the "Pianificazione" collision lesson — one vocabulary, no
  drift). New keys are limited to the group `label` + per-option `_tip`.
- `filter_presets`: preset-owned fields leave the filter sheet
  (`EntityListTable.svelte:241-251`) — single source of truth, same
  contract as `schedule_kind`.

---

## Part B — `job_run` meta design (final column table)

| order | key | type/format | flags | notes |
|------|-----|-------------|-------|-------|
| -1 | `uuid` | uid (auto) | sticky | untouched |
| 10 | `job_name` | text | display_field | searchable ✓ |
| 20 | ~~`service_code`~~ | **DROPPED** | — | A.1b: display-only, ~84%≡`created_by`, 27% factually wrong — physical drop (task 1b); provenance = `created_by` |
| 30 | `status` | badge | preset-owned | colors per A.2 |
| 35 | `trigger` | ref (calculated) | `null_label` manual | NEW — "Attivatore" |
| 40 | `created_at`→`started_at` | datetime | — | unchanged label |
| 50 | `updated_at`→`finished_at` | datetime | — | unchanged |
| 60 | `duration_ms` | number | — | page humanizes |
| 70 | `schedule_subject` | **`type:"text"`, `format:"nats_subject"`, icon zap** (was `type:"ref"` — the only outlier: EVERY subject field on siblings is `nats_subject`) | `default_visible:false`, `null_label` manual, **relabel → "Coda di Ingresso"** | stays `filterable` — trigger `reverse_ref` deep-links + engine own-lane correlation depend on it (NOT droppable — `run-recorder.ts:111,183`, `jobs.service.ts:521`); "Pianificazione" label collided with `schedule_spec` on triggers — schedules label the same field "Coda di Ingresso" |
| 80 | `run_as` | badge user/system | `default_visible:true` | aligns trigger+schedule |
| 90 | `error_code` | text | `default_visible:false` | unchanged |
| 100 | `error_detail` | text | `default_visible:false` | unchanged |
| 110 | `redelivery_count` | number | `default_visible:false` | unchanged |
| 120 | `fire_seq` | number | `default_visible:false`, `filterable:false` | NEW in meta — JetStream dedup seq |
| 130 | `report` | text `format:"json"` | `default_visible:false`, `filterable:false` | NEW in meta — jsonb executor report; writer-not-matcher rule |
| — | `trigger_uuid` | text (calculated) | `hidden:true` | NEW — drill key only, never a surface |

`default_sort`: `{ key: "created_at", dir: "desc" }` — newest dispatches
first; a long-running `dispatched` row stays on top instead of sinking
behind finished ones (monitoring semantic). Alternative kept documented:
`updated_at desc` (siblings' convention — last-write first). **Judgment
call flagged for PROCEED.**

`filter_presets: [outcome]` — `display:"button_group"`,
`default_option:"all"`, options `all|succeeded|failed|skipped|lost|dispatched`
(`where:[{field:"status",op:"=",value}]`, `all` → `[]`). Effect: `status`
becomes preset-owned → leaves the filter sheet (only `!=` queries lost;
`IN` isn't expressible anyway). **Judgment call flagged for PROCEED.**

~~`row_custom_actions: [view_run]`~~ — **REVERSED (user)**: no view CTA
on a read-only entity. `entity.record` is the canonical drill whenever a
`ref` cell (e.g. the new `trigger` column) resolves a run elsewhere;
`job.runDetail` stays declared but unopened (status quo).

## Part C — Entity projections (`job_run_entity.ts`)

```ts
/** Owning trigger uuid — resolved through the schedule mirror
 *  (jobs_schedules.trigger_uuid is NOT NULL). NULL for manual/immediate
 *  runs (schedule_subject IS NULL). */
@Calculated(
  `(SELECT js.trigger_uuid FROM job.job_schedules js WHERE js.schedule_subject = {self}.schedule_subject)`,
  { pgType: "uuid", nullable: true },
)
trigger_uuid?: string;

/** Owning trigger display name — joins through the mirror; NULL on
 *  manual runs (the `null_label` "Manuale" renders instead). */
@Calculated(
  `(SELECT t.name FROM job.job_triggers t WHERE t.uuid = (SELECT js.trigger_uuid FROM job.job_schedules js WHERE js.schedule_subject = {self}.schedule_subject))`,
  { pgType: "text", nullable: true },
)
trigger?: string;
```

Meta ref: `trigger` → `ref: { entity: "job_trigger", key_field: "trigger_uuid" }`
(same anatomy as schedules' `armed_by` — name as link text, drill by uuid).

## Part D — FE changes

1. **`TableCell.svelte`** — **no change**: `service_code` is dropped
   entirely; `format:"service_code"` stays in the codebase for other
   metas; `schedule_subject` renders through the existing
   `format:"nats_subject"` branch — zero FE renderer work.
2. **`runs/+page.svelte`** — **no change** (view CTA dropped; the
   `duration_ms` humanize `cell` override is the only page-level code).
   No syncChannel (dead mechanism without a sender page — see A.4).
3. **`job-handler/fe/src/RunDetailSheet.svelte`** — remove `service_code`,
   `initiator`, `lane` from `JobRun` type + their `dt/dd` pairs
   (dead/dropped fields — part of task 1b surface cleanup).
4. **`useEntityList.svelte.ts`** — visibleKeys contract v2 (see Part F).

## Part E — Out of scope (documented, not dropped silently)

- **Live list refresh** — no entity-scoped push exists (A.4); a real
  mechanism is a platform feature (entity-level changed broadcast →
  list invalidation). Recorded as future work, not promised here.
- **Re-run action** — the run row carries no `target_subject`/request
  payload; re-dispatch would need schema + engine work. Future.
- **`type:"ref"` operator wart** — ref fields map to numeric operators
  (`>`,`<`) in the advanced sheet; correct fix is a `ref`→`=`/`!=`
  mapping in `core.getOperatorsForColumnType` — core lib change,
  separate item if desired.
- **`service_code` drop is IN scope now** (task 1b, `3c4b471`
  precedent) — earlier "keep" analysis is in A.1b for the record; live
  census disproved it (~84% ≡ `created_by`, 27% factually wrong).
- **Dead translation keys** `fields.initiator`, `fields.lane`
  (0003_job_translations.sql) — covered by `run_as`/`trigger`; cleanup
  optional, bundling allowed if trivial.
- **Stale plan drift** — `feature-run-as-unification.md` is 🟠 WIP with
  all tasks done: needs close-out + move to COMPLETED (hygiene, not this
  plan's scope; flagged).

## Part F — visibleKeys systemic fix (task 9)

**Problem** (A.3): stored `visibleKeys` freezes the column set; meta
evolution is invisible to every profile that ever persisted state.

**Design**: persist intent, not the resolved set —
`{v:2, shown:string[], hidden:string[]}`:
`visible = (defaultVisibleColumnKeys ∪ shown) − hidden`.
New meta column → in neither list → `default_visible` applies. User hides
a default column → `hidden`; user shows a hidden-default → `shown`.

**Migration (conservative, preserves today's exact render)**:
legacy array `V` over served columns `C` →
`hidden = C \ V`; `shown = V ∩ {c : c.default_visible === false}`.
Identical visible result, unlocked evolution. (`hideable===false`
re-injection stays as today.)

**Blast radius**: shared contract — every ELT page. Pure merge/migration
logic goes into a testable helper (core or `$lib/entity-list`), unit
tests for: legacy migration equivalence, new-column surfacing,
hideable-pin survival, empty-set fallback. The user's gutted tables are
healed by Columns→reset regardless (remediation row, no code).

## Part G — Translations patch (task 8)

New keys (×7 langs, en-GB/en-US/it-IT/fr-FR/es-ES/de-DE/pt-PT; copy per
`copy-tone-of-voice` — outcome words, no wire jargon):

- `job.entities.job_run.fields.trigger` — "Attivatore"/"Trigger"…
- `job.entities.job_run.fields.trigger_uuid` — same label (hidden; label
  required by convention)
- `job.entities.job_run.fields.trigger.states.manual` +
  `fields.schedule_subject.states.manual` — "Manuale"/"Manual"…
- `job.entities.job_run.presets.outcome.label` + `…options.<status>_tip`
  — option labels reuse `status.*` (A.5 — one vocabulary); only the
  group label + tooltips are new keys
- ~~`job.entities.job_run.actions.view_run`~~ — dropped (no view CTA)

`fields.report`, `fields.fire_seq` already exist (verified in
`0003_job_translations.sql`). Patch file `YYYYMMDDHHMMSS_run_page_columns.sql`,
then `primebrick-db sign --db-meta db-meta --key @<keyfile> --key-id <id>`.

## Part H — Acceptance criteria

1. Fresh profile: runs page shows `job_name, trigger, status,
   started_at, finished_at, duration_ms, run_as` (7 + uuid).
   `schedule_subject`, `error_*`, `redelivery_count`, `fire_seq`,
   `report` in picker unchecked; `trigger_uuid`/`system_key`-class fields
   absent from picker.
2. `status` badge renders info/gray/amber/green/red per A.2; manual runs
   show "Manuale" on `trigger`/`schedule_subject` cells.
3. `trigger` cell displays the owning trigger's name and drills to the
   trigger record (list/sheet); null on manual runs.
4. Preset `outcome` renders in toolbar, `failed` ANDs
   `status=failed` into the wire request; `status` absent from the
   filter sheet.
5. ~~`view_run` CTA~~ — dropped: no actions column on a read-only
   entity; `entity.record` remains the automatic ref-drill surface.
6. `service_code` absent everywhere — served meta, DB (`job.job_runs`
   post-patch snapshot clean), entity writes, `RunDetailSheet`.
7. A profile holding a legacy narrow `visibleKeys` still renders its
   stored set, and a column added to meta afterwards appears per its
   `default_visible` (regression spec).
8. `tsc --noEmit` clean (JH + FE); JH vitest + spec green; Playwright
   `jobs-pages.spec.ts` green; served `/meta` dump matches the table.
9. Commits: us-v3 (meta+entity+service+tests+patch+RunDetailSheet),
   fe-v3 (visibleKeys+tests), workspace (this plan's status).

## Verification commands

```bash
cd primebrick-us-v3/job-handler && npx tsc --noEmit && npx vitest run src/__tests__/service-routes.test.ts
cd primebrick-fe-v3 && npx tsc --noEmit && npx playwright test jobs-pages.spec.ts --project=chromium
# served meta probe (E2E context): /svc/job/api/v1/entities/job_run/meta
#   → columns[i].default_visible / hidden / kind / badge / ref / presets
```

---

## Part I — REVISION 2026-11-17 (second TIC: lineage, source/destination, diagnostics)

Post-ship review surfaced five issues; a fresh TIC re-derived the
lineage model. All findings below are empirical (live DB + source).

### I.1 Root findings

1. **`trigger` `@Calculated` is broken by schedule ephemerality** — only
   6/234 runs resolve (228 join-fail: schedules are HARD-deleted, no
   `deleted_at`; 4 truly manual). The red "Manuale" renders on
   non-manual rows → wrong twice. Fix: **physical `trigger_uuid`**
   stamped at write-time (armed_by pattern: physical anchor + friendly
   calculated ref).
2. **`null_label` misused** — it renders `text-xs italic text-destructive`
   (TableCell:481), an ALARM anatomy for noteworthy nulls (precedent:
   `next_run` → "Disabled" `when deleted_at`). A manual run's null is
   neutral → universal `-`. Guardrail: docstring sharpened in core.
3. **`schedule_subject` badge "untranslated" is by-design** — the
   nats_subject cell resolves `subjectDecl` via census
   `emits`/`callables`; `jobs.schedule.*`/`jobs.due.*` are internal NATS
   lanes, explicitly NOT census-declared → raw-path fallback. The
   DESTINATION (`target_subject` = callable) IS census-declared →
   friendly label resolves.
4. **`error_code` becomes a mapped enum badge** — census of ALL write
   sites (below); unknown callable codes coerce to `EXECUTION_ERROR`
   at write (original preserved in `error_detail` prefix).
5. **`error_detail` → `hidden:true`** (never in picker = non-toggleable,
   still in row payload) + `error_code` cell click → `job.runDetail`
   remote sheet (already renders the error section natively).

### I.2 Write-time stamping (`trigger_uuid`, `target_subject`)

| Field | Forwarder path (`insertRun`) | Direct path (`recordDirectRun`) |
|---|---|---|
| `trigger_uuid` | `scheduleRow?.trigger_uuid` — row already fetched for the armed gate (`due-forwarder:227`) | schedule lookup by `schedule_subject`; own-lane/manual → NULL |
| `target_subject` | `envelope.target` verbatim (callable subject) | `data.target` verbatim ("the subject the handler consumed") |

`job_name` stays the display name (mixed derivation — NOT renamed:
schedule ELT carries the same `job_name` display + `target_subject`
badge duality).

### I.3 `error_code` closed vocabulary (write-site census)

| Code | Producer | Badge color |
|---|---|---|
| `EXECUTION_ERROR` | recorder fallback (executor failed, no code) | red |
| `HANDLER_ERROR` | SDK transport (handler threw) | red |
| `DENIED` | SDK transport (verify denied) | amber |
| `VALIDATION_ERROR` | app-reported (in data) | red |
| `DISPATCH_ERROR` | forwarder publish failure | red |
| `DISPATCH_TIMEOUT` | lost-sweep (no result 5min) | amber |
| `AUTH_ACTOR_UNRESOLVABLE` | forwarder auth checkpoint | red |
| `SCHEDULE_PAUSED` | forwarder skip (was `"schedule paused"`) | gray |
| `SCHEDULE_DISARMED` | forwarder skip (was `"schedule disarmed"`) | gray |

Writer normalization: `schedule ${status}` → `SCHEDULE_${STATUS}`;
`data.error_code` outside the known set → `EXECUTION_ERROR` +
`error_detail` prefixed with the original code. Migration backfills the
two legacy literals; no other values exist in data.

### I.4 Final column table (supersedes Part B)

| order | key | type/format | visible | notes |
|---|---|---|---|---|
| -1 | `uuid` | uid | sticky | |
| 0 | `job_name` | text | ✓ | display_field |
| 10 | `schedule_subject` | nats_subject zap/amber | ✓ | SOURCE — mirrors schedules |
| 20 | `target_subject` | nats_subject send/sky | ✓ | DESTINATION — NEW physical |
| 30 | `status` | badge | ✓ | preset-owned |
| 35 | `trigger` | ref→job_trigger | ✓ | name + uuid drill |
| 38 | `schedule` | ref→job_schedule | ✓ | `@Calculated` alias of `schedule_subject`; `filter_field:"schedule_subject"` → business-key record lookup (orphan handled) |
| 40 | `started_at` | datetime | ✓ | |
| 50 | `finished_at` | datetime | ✓ | |
| 60 | `duration_ms` | number | ✓ | humanizer |
| 80 | `run_as` | badge | ✓ | |
| 90 | `error_code` | badge enum | hidden default | click → `job.runDetail` |
| 100 | `error_detail` | text | **`hidden:true`** | non-toggleable, in payload |
| 110 | `redelivery_count` | number | hidden default | |
| 120 | `fire_seq` | number | hidden default | non-filterable |
| 130 | `report` | json | hidden default | non-filterable |
| — | `trigger_uuid` | uuid (PHYSICAL) | `hidden:true` | write-stamped, never served |
| — | `schedule_uuid` | uuid (PHYSICAL) | `hidden:true` | write-stamped (scheduleRow.uuid), never served |

> **Errata — `schedule` ref (fixed in `fa90983`):** the first cut aliased
> `schedule` to `schedule_subject` and drilled via business-key lookup —
> the cell repeated the source queue and the drill wasn't the uuid-ref
> anatomy. Corrected to the `trigger_uuid`/`armed_by` mirror: physical
> stamped `schedule_uuid` + `@Calculated` display name (js→jt join → the
> armer trigger's name = the schedule's display_field) + `ref{key_field:
> "schedule_uuid"}`. Label "Pianificatore".

### I.5 Tasks delta

| # | Task | Status |
|---|---|---|
| R1 | `job_run_entity`: `@Column trigger_uuid` + `@Column target_subject` (nullable); `trigger` @Calculated rebinds to `{self}.trigger_uuid`; `schedule` @Calculated alias | ✅ |
| R2 | writers: forwarder stamps `trigger_uuid`+`target_subject`; `recordDirectRun` stamps `data.target` + schedule-lookup `trigger_uuid`; error_code normalize (`KNOWN_ERROR_CODES` → coerce to `EXECUTION_ERROR`, original preserved in `error_detail`) | ✅ |
| R3 | patch `20261117183000_run_lineage_error_codes`: 2 columns + backfills (35/238 trigger_uuid recovered — live join + mirror-suffix convention; 67 target_subject) + `SCHEDULE_*` normalization + translations (error_codes ×9 codes ×7 langs, `fields.schedule`/`target_subject`, dropped `states.manual`+dead `actions.view_run`) + sign + apply | ✅ |
| R4 | meta: I.4 table — no null_label, error_code closed badge enum (9 items, all labeled+colored), `schedule` business-key ref, `target_subject` send/sky, `error_detail` `hidden:true` | ✅ |
| R5 | FE: runs page `cell` snippet on `error_code` → `openSheet('job.runDetail',{run_uuid})` — badge wrapped in a button, NULL stays `-` | ✅ |
| R6 | core: `null_label` docstring — destructive red-italic alarm semantics explicit, ordinary NULLs must render `-` | ✅ |
| R7 | tests+E2E — JH vitest 152/152 (new coverage: `SCHEDULE_*` skip codes, stamped lineage, `normalizeError` coercion); service-routes meta contract; E2E 5/5 runs specs incl. error_code→runDetail click; core 142/142; FE 687/687; svelte-check+tsc clean; docs regenerated+check green | ✅ |

### I.6 Verified results

- `job_run` mirrors the `job_schedule` anatomy end-to-end: SOURCE (`schedule_subject` zap/amber) + DESTINATION (`target_subject` send/sky) + `trigger` ref + `schedule` ref.
- Lineage is stamped at write time — the trigger identity survives schedule hard-deletion (was: 6/234 resolved through the ephemeral mirror; now 35/238 backfilled + all future rows stamped at fire time).
- `error_code` is a closed enum: writers normalize at insert; unknown callable codes coerce to `EXECUTION_ERROR` with the original preserved in `error_detail` — the badge can never render a raw string.
- `error_detail` is `hidden:true` — never in the picker, present in the row payload; the click on `error_code` opens `job.runDetail` (the only surface rendering the detail).
- Ordinary NULLs render `-` — the destructive `null_label` misuse is gone and documented in core.

---

## J — Version-history capability gate (all ELTs)

**TIC finding:** `meta.actions` already serves `{op:"read.audit", enabled:false}`
on entities without a registered audit route (contract: "ops whose route is
not registered are emitted with enabled:false"). `isEntityOpEnabled` in
`@primebrick/core` is the fail-closed check. `collaboration.enabled` is the
auditable-presence semantic, NOT the trail-route signal — excluded.

**Design:** the gate lives INSIDE `VersionHistoryPanel` — the single choke
point for all 5+ openers (record-sheet badge, row action, version cell,
audit box, dict/config rows, remote bundles). `fetchEntityMeta` is cached
+ deduped, and every opener's page already warmed the cache → zero extra
requests on the standard path; a cold miss costs ONE `GET /meta` on a real
endpoint instead of a doomed `GET /:uuid/audit` 404.

- `auditEnabled === false` → disabled watermark (`Grid3x3Off` size-20 muted,
  `pb-watermark-disabled` neutral pulse, `data-testid=version-history-
  disabled`, copy `app.common.version_history_disabled`) — no fetch.
- Meta fetch failure → fall through to `loadVersionHistory()` so the real
  error watermark (incl. ApiUnreachableError owner-service copy) survives.
- i18n in `app.common.*` (public.translations): shared app chrome, not
  entity-dict vocabulary — `system.entities.version_history.*` is reserved
  for entry-internal labels. BE seed patch ×7 langs + FE en-GB fallback.

**Deps:** `@lucide/svelte` bumped 1.59.0→1.70.0 (first release carrying
`grid-3x3-off`, >7 days old) + `@iconify-json/lucide` 1.2.146→1.2.152 for
DynamicIcon name-resolution. `trash-arrow-up` still absent upstream —
CUSTOM_ICONS retained.

**Gotcha documented:** after dep-graph changes the vite optimizer cache
holds the stale lucide chunk (`does not provide an export named
'Grid3x3Off'` → SSR 500). Fix per docs/ai/dev-server.md: delete
`node_modules/.vite` + restart the dev server.

**Verified:** E2E — runs page `version` column toggled → v{n} badge →
disabled watermark renders, ZERO `/audit` requests; ref-cell-sheet spec
proves the auditable stacked panel still loads real history.

---

## K. Outcome preset monitor-first + default column surface (verified)

**Request (verbatim):** preset order `SENT → SUCCESS → FAILED → ALL`; SENT
default view, icon play-filled, "In attesa di essere processati"; FAILED
aggregates failed+lost+skipped; default-visible columns = outcome-monitor
nine; lineage columns toggleable-but-hidden.

**Field mapping (confirmed by user):** "execution count" → `fire_seq`
("Fire #"/"Esecuzione n."), "outcome" → `report` ("Esito"), "re-delivery" →
`redelivery_count`.

### Findings (TIC)

- `FilterCondition.op` accepts `IN` with array values — wire serializes as
  `filters[i][op]=IN&filters[i][value][]=a&[value][]=b` (`useEntityList`
  scopeConditions pass-through). The `failed` option is ONE `IN` clause.
- `button_group` is icon-only by design — user descriptions became
  `tooltip_key` copy; `label_key` feeds aria only (reuses `status.*`).
- `resolvePresetSelection` falls back to `default_option` on stale persisted
  ids — old `dispatched`/`lost`/`skipped` selections migrate cleanly to
  `sent`.
- Lucide 1.70 iconify set renamed `triangle-alert` →
  `triangle-exclamation-point` (the only `.svelte` file in dist/icons;
  `alert-triangle` survives as `.js` alias). `play:filled` resolves via the
  `:filled` qualifier (fill=currentColor, basename stripped).
- Default `sent` = `status=dispatched` — can be an empty scope on real
  datasets; E2E that needs rows must click `all` first.

### Changes

- `job.meta.ts` — preset `default_option:"sent"`, options
  `[sent(play:filled), succeeded(circle-check),
  failed(triangle-exclamation-point, IN failed+lost+skipped), all(list-clock)]`;
  `default_visible:false` on `trigger`,`schedule`,`schedule_subject`,
  `target_subject`,`run_as`; `default_visible:true` on `redelivery_count`,
  `fire_seq`,`report` (both keep `filterable:false`).
- Patch `20261207100000_run_outcome_preset_reorder.sql` — DELETE orphan tips
  (dispatched/skipped/lost), UPDATE `failed_tip` to aggregate copy ×7,
  INSERT `sent_tip` ×7. Manifest re-signed (28 patches), applied.
- `service-routes.test.ts` — preset order/default/IN contract + visibility
  flags.
- `jobs-pages.spec.ts` — meta-contract assertions, preset wire test
  (default-sent first-call + IN aggregate + all escape), error_code +
  version-badge selectors; version test clicks `all` first (sent can be
  empty).

### Verified

JH vitest 153/153 · svelte-check 0 err · jobs-pages 27/27 (4 transient
failures in one 12-worker run = JH watch restart mid-suite; all 4 green on
re-run) · runs.mdx regenerated (new default surface documented).
