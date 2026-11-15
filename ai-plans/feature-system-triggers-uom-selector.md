# System triggers (is_system) + UOM selector on NumericInput

> Two workstreams, one architectural spine: **the `job_trigger` row becomes
> the single declaration of record for EVERY scheduled job** — user-made and
> module-made — while `NumericInput` gains the unit-of-measure selector the
> schedule widget needs. User decision recorded verbatim below.

## Status: ✅ DONE — Plan date: 2026-11-15 / TIC→TOC complete

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | core: `NumericUomSpec.options` + dropdown-vs-sheet surface rule | ✅ | | |
| 2 | ui: NumericInput internal unit dropdown (≤5 options) | ✅ | | |
| 3 | ui: schedule-spec-input adopts UOM adornment (kills ComboSelect) | ✅ | | |
| 4 | us-v3: `system_key` + derived `is_system` on job_trigger (entity + meta + db patch) | ✅ | | |
| 5 | us-v3: `depends_on.disabled_when` on code-owned fields; ELT is_system column | ✅ | | |
| 6 | us-v3: `jobs.ctl.triggers.materialize` route + reconcile (delta-only writes) | ✅ | | |
| 7 | us-v3: wire enforcement — system-trigger protected-set shape rule | ✅ | | |
| 8 | us-v3: drop `kind`/`infra_derived` — column, meta badge, all branches, ctl route, rearm ping | ✅ | | |
| 9 | ai: partition-maintenance migrates to system trigger + callable | ✅ | | |
| 10 | be/us: db patches (schema + translations) signed | ✅ | | |
| 11 | tests: unit (reconcile, shape rule, uom surface) + e2e (system trigger lifecycle) | ✅ | | |
| 12 | docs: job-handler dev-guide rewrite (system triggers model) | ✅ | | |

---

## Part A — UOM selector on NumericInput

### What exists today (verified)

- `NumericInput` already accepts `uom?: NumericUomSpec` —
  `{kind:"percent"|"currency"|"custom", symbol?, code?, position?, on_pick?,
  before_return?, after_receive?}` — and renders the adornment as an
  `InputGroupButton` with symbol + code + ChevronDown inside the input
  (`numeric-input.svelte` suffix branch).
- `on_pick` is host-owned: the component never decides the picker surface —
  the caller wires it (currency → `openSheet('config.currencySelect', …)` in
  `FormFieldDispatcher.svelte:382-401`).
- `MetaColumn.uom` is the contract-level declaration; `MetaColumnUomSource` =
  `"currencies" | {entity} | {api_url, value_field, label_field?}`.
- **Impact gap found**: the dispatcher's `custom` branch today returns
  `{kind:'custom', code, symbol}` **without `on_pick`** — a declared custom
  UOM currently shows the adornment but can never open a selector. This work
  gives `custom` its picker for the first time.

### The surface rule (user decision)

> options `length ≤ 5` → **inline dropdown** anchored to the adornment CTA;
> `> 5` or not enumerable ahead of time (api_url/entity source) → **sheet**
> (the `openSheet` pattern already used by currency).

Design: extend `NumericUomSpec` with `options?: UomOption[]` where
`UomOption = {code, label_key?, symbol?}`:

- `options` present && `options.length <= UOM_DROPDOWN_MAX (5)` → the
  component renders its OWN internal `Popover` + option list anchored to the
  adornment button. No host wiring needed — self-contained.
- `options` absent or `> 5` → `on_pick` is the surface; the host opens the
  sheet (currency path unchanged).
- Picking an option emits the new `code` — the selected UOM is visible to the
  host via the same bind channel (`bind:uom.code` is not needed: `on_pick`
  already delegates the write to the host; for the internal dropdown the
  component needs a new bindable `uom_code` or an `on_uom_change` callback —
  **decision: `bind:uom_code`** so the spec stays declarative and the host
  reads the selection reactively).

Adoption site: `schedule-spec-input.svelte` — the interval builder replaces
`NumericInput + ComboSelect w-28` with a single `NumericInput` carrying
`uom={kind:"custom", code:everyUnit, symbol:$t(unit label), options:[m,h,d],
bind:uom_code=everyUnit}`. Three options → internal dropdown, no sheet.

Impatti ad oggi: **zero breaking**. `options`/`bind:uom_code` are additive;
percent/currency paths untouched; `MetaColumnUomSource` keeps producing
sheet-surface `on_pick` for entity/api sources (always >5 or async → sheet,
matching the rule by construction).

Files:
- `primebrick-v3-ui/src/lib/composables/useNumericInput.svelte.ts` —
  `NumericUomSpec.options` + `UomOption` type export.
- `primebrick-v3-ui/src/lib/components/numeric-input/numeric-input.svelte` —
  internal dropdown (Popover anchored to the adornment CTA) +
  `bind:uom_code` prop + emit on pick.
- `primebrick-v3-ui/src/lib/components/schedule-spec-input/schedule-spec-input.svelte`
  — adopt UOM adornment, drop `unitOptions`/ComboSelect; seeding keeps
  `Math.round` clamp (already landed).
- i18n: no new keys (unit label_keys already exist).

---

## Part B — System triggers: `job_trigger` as the single declaration of record

### The model (user's formulation, verified against code)

- **TRIGGERS = job declarations** (what exists, with what params)
- **SCHEDULES = arming state** (JetStream declarations + read-only mirror)
- **RUNS = execution log**

`kind:"infra_derived"|"trigger"` on `job_schedules` **dies completely** —
column, meta badge, every `kind === "trigger"` branch, the
`jobs.ctl.schedule.request` route (its only producer was infra self-declare),
the `jobs.ctl.schedule.rearm.<svc>` ping, and the `infra_derived`-only
admin-suppression gate. A schedule row's trigger-ness is read from
`trigger_uuid` (already present); whether the trigger is system-owned is read
from the trigger's `system_key` — **never from the schedule row**.

### Schema changes (job-handler `db-meta`)

```sql
ALTER TABLE job.job_triggers ADD COLUMN system_key text;
CREATE UNIQUE INDEX job_triggers_system_key_uq
  ON job.job_triggers (system_key) WHERE deleted_at IS NULL;
ALTER TABLE job.job_schedules DROP COLUMN kind;
```

- `system_key` = the module's stable job id (`"ai.partition-maintenance"`) —
  set once at materialization, `immutable`, `managed`, never editable,
  never in the form.
- `is_system` = **derived** (`system_key IS NOT NULL`) — `@Calculated` SQL
  projection like `last_run`, surfaced as a meta column (`type:"boolean"`,
  badge display, `default_visible`) so the trigger ELT shows it and the form
  record carries it for `disabled_when`. One physical source (`system_key`),
  zero dual-truth.
- `kind` drop on `job_schedules` — the `kind` label/badge translation family
  gets the `0013_manual_kind_vocabulary_drop` treatment (delete the label
  rows, don't leave orphans).

### Meta changes (`job.meta.ts`)

```ts
// jobTriggerMeta
{ key: "system_key", immutable: true, managed: true, filterable: true,
  default_visible: false, order: 90 },
{ key: "is_system", type: "boolean", kind: "calculated", order: 15,
  badge/ELT-visible },
{ key: "event_subject",  ..., depends_on: { field: "is_system", disabled_when: { equals: true } } },
{ key: "target_subject", ..., depends_on: { field: "is_system", disabled_when: { equals: true } } },
{ key: "run_as",         ..., depends_on: { field: "is_system", disabled_when: { equals: true } } },
{ key: "payload_map",    ..., depends_on: { field: "is_system", disabled_when: { equals: true } } },
{ key: "filter",         ..., depends_on: { field: "is_system", disabled_when: { equals: true } } },
// schedule_spec + name stay editable — that is the entire point.

// jobScheduleMeta — `kind` column removed.
```

Protected set rationale (user, verbatim): *"source e destination sono i primi
2 disable condizionali basati su is_system — l'utente non può cambiare source
e destination di un system trigger perché cambierebbe i contratti di
interscambio decisi dal codice"*. `run_as`/`payload_map`/`filter` are the
same interchange contract — same protection. `schedule_spec` (RPO/RTO) and
`name` (display) remain user-owned.

`depDisabled` already works: it evaluates `record[dep.field]` — `is_system`
calculated is served on get/list, present in the form record; on CREATE
(`is_system` undefined) the condition `{equals:true}` is false → fields
editable. Zero new machinery — closed-vocab, no eval.

### Materialization + reconcile (`jobs.ctl.triggers.materialize`)

New shielded NATS request route (same `serviceShieldVerify` pattern as the
retired schedule-request). Payload — the module's declared system jobs:

```ts
{ jobs: Array<{
    key: string;              // system_key, e.g. "ai.partition-maintenance"
    name: string;             // initial display name — insert-only
    schedule_spec?: string;   // validated via scheduleSpecError (floor!)
    event_subject?: string;
    target_subject: string;
    run_as: "system" | "author" | "originator";
    filter?: unknown;
    payload_map?: unknown;
}> }
```

Reconcile per entry (user's rule — **cosa, non quando**):

| Declared field | Row differs | Action |
|---|---|---|
| `event_subject`, `target_subject`, `run_as`, `payload_map`, `filter` | yes | **code wins** — update (the contract changed) |
| `schedule_spec`, `name` | yes | **user wins** — never touched after insert |
| anything | no delta | **no write** — never a no-op UPDATE |

- Row absent entirely → insert.
- Row soft-deleted (user disabled) → **skip, never resurrect** — the same
  protection `infra_derived` suppression gave, now expressed by the row
  itself.
- `jobs.ctl.triggers.changed` publishes ONLY when a write actually happened —
  the engine's existing `refreshTrigger` re-derive does the arm work;
  reconcile itself never arms/schedules directly.
- A `system_key` row whose decl disappeared from the payload → leave the row
  live (never silently delete a user-visible object); surface in reconcile
  logs for review.

### Wire-side enforcement (`assertTriggerShape` family, `jobs.service.ts`)

`beforeCreate`/`beforeUpdate` hooks already merge `{...existing, ...body}`
for shape checks — the protected-set rule lands there:

- update: `existing.system_key` set && body contains a protected key with a
  changed value → `FieldIssue` on that key, dedicated i18n key
  `app.common.validation.system_trigger_immutable`.
- create via API: `system_key` in body → reject (system rows are born only
  from materialization).
- the FE `disabled_when` is UX; this hook is the fail-closed mirror — same
  protected-set list read from ONE constant (`SYSTEM_TRIGGER_FROZEN_FIELDS`).

### `kind` drop — full deletion list (the "casino")

- `job_schedule_entity.ts` — `kind` column + doc comment.
- `job.meta.ts` `jobScheduleMeta` — kind badge column.
- `schedule-service.ts` — `DeclareScheduleInput.kind`; mirror insert; the
  `kind === "infra_derived"` suppression gate (trigger rows already gate on
  the owner row's deleted state); reconcile's `kind === "trigger" &&
  trigger_uuid && rescueTrigger` → unconditional rescue on `trigger_uuid`
  presence; the `infra_derived` "surface as drift" else-branch dies.
- `triggers-engine.ts` — `kind: "trigger"` in the declare input.
- `schedule-request.ts` — **whole file deleted** (`jobs.ctl.schedule.request`
  had exactly one producer: infra self-declare; `armJobSchedule` SDK helper
  deleted too). `jobs.ctl.schedule.cancel` — audit consumers before deciding
  (e2e `scheduleCancel` helper uses it; if it serves only internal paths it
  can collapse to direct `disarmSchedule`).
- `actions-route.ts` — `dropIfDeadOwner` collapses (every row has
  `trigger_uuid`); disable → always the trigger soft-delete path; enable →
  restore + re-derive (rearm ping gone); resume → `refreshTrigger`
  (rearm ping gone); `requestOwnerRearm` + `unsuppressSchedule`(infra path)
  deleted; drift report drops `kind`.
- `partition-jobs.ts` (ai) — deleted: the due-consumer on
  `jobs.due.system.ai.partition-maintenance` is replaced by a callable
  `ai.partition_maintenance` (declared in the module's `callables` vocab,
  handler runs `dal.partitionMaintenance`, returns the report — middleware
  publishes `jobs.result.ai.partition_maintenance` unchanged).
- ai `events-declaration.ts` — gains the system-jobs declaration vocabulary.
- `aiConfig("partition_maintenance_schedule")` config entry — **retired**:
  the hidden parameterization channel is exactly what this removes;
  `schedule_spec` on the trigger row is the honest surface.

### Reconcile for existing live data

Current DB: `job.job_schedules` has `kind='infra_derived'` rows +
`jobs.schedule.ai.partition-maintenance` live declaration. The db patch
inserts the `ai.partition-maintenance` system trigger; the engine derives +
arms `jobs.schedule.job.<uuid>`; the old `jobs.schedule.ai.*` declaration is
purged as orphan by the strict reconcile; the old mirror row flips per
reconcile semantics. Data preserved, machinery does the migration — no
hand-edited rows.

### Open points recorded for review

- `run_as:"system"` system trigger targeting a service callable — the
  callable's declared permission model decides admissibility (phase-3 B1
  already proves the deny path; `ai.partition_maintenance` is a
  service-internal callable, system lane by construction).
- Delete/restore on system rows: allowed (delete = the disable mechanism).
  A `deleted` system row is skipped by reconcile — same protection as today,
  expressed by the row.
- `job_triggers_name_uq` UNIQUE: materialized names use the `<svc>.<job>`
  namespace; on collision reconcile logs an error — never silently renames.

---

## Part C — verification plan

- **unit**: reconcile delta-matrices (code-wins fields / user-wins fields /
  no-delta no-write / deleted-row skip); `assertTriggerShape` protected-set
  rejections; materialize route validation (floor, vocab, callable census);
  UOM spec surface rule (≤5 dropdown, >5/on_pick sheet).
- **e2e** (`job-chain-live.spec.ts` or sibling): materialize a system trigger
  → user edits `schedule_spec` → re-arm observed; user edits
  `target_subject` → 400 `system_trigger_immutable`; re-materialize with
  changed `target_subject` → row updated, others untouched; disable →
  re-materialize does NOT resurrect.
- **docs**: `job-handler/docs/dev-guide/index.mdx` — "infra jobs" section
  rewritten to the system-triggers model; `kind`/`infra_derived` vocabulary
  purged; `entities-route.ts` doc comment (mirror contract mention).

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
