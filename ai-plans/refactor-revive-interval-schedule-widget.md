# Plan: revive_every/offset widget — replace frankenstein composite with schedule widget?

## Status: 🟢 TIC DONE — verdict only, NO implementation — awaiting user ratification — Plan date: 2026-11-26

## User request (verbatim, 2026-11-26)

"abbiamo un widget completamente fuori standard, è quello adottato da revive_every che è un frankenstein mai visto !!! perchè non possiamo usare lo schedule widget che con la choice box dovrebbe coprire il @every e il @at ????? cosa ce lo impediva ????? fase tic"

## Scope discipline

TIC ONLY: read the real code, produce evidence, verdict + options. Do NOT implement. The user ratifies before any TOC.

## Known facts (empirical, from the 2026-11-26 filter-parity session — verify, don't re-assume)

- `revive_every` is a SINGLE varchar column on `crm.sequences`; canonical wire values: `'N unit'` interval strings (e.g. `'1 year'`) OR `'at <ISO>'` literal pin. Same dual-shape for `revive_grace` with the `until` axis.
- Standard filters match it ILIKE substring (proven live: typing `1` in the composite wires `revive_every ILIKE "1 year"`).
- `ReviveIntervalInput` mounts with `literal="at"` (revive_every) / `literal="until"` (revive_grace) on BOTH form and filter surfaces (filter mounting restored in fe `0491b7d`).
- `schedule_spec` is classified EDITOR-only in the filter-widget-parity plan (`elt-filters-widget-parity.md`) — editors degrade to contains-text on filters by sanctioned decision.
- DAL write-path logic parses revive_every in `sequence-decl.ts` (lines ~298-320): `'N unit'` → expire_at = next calendar boundary; `'at <ISO>'` → literal pin; NULL → revive off, clears expire/switch/slot.
- Historical rows exist in dev/prod DBs with the varchar format — any wire change is a MIGRATION, not a refactor.

## TIC tasks — answer with file/line evidence

1. READ the schedule widget end-to-end (find it: grep `schedule_spec` in fe `src/lib/entity-form/`, probably `ScheduleSpecInput` or similar — also check `primebrick-v3-ui`). Document: anatomy (choice box? modes?), what it emits (cron? structured JSON? human string?), which entities use it today (jobs?), its i18n.
2. READ `ReviveIntervalInput` fully — enumerate exactly WHY it's a frankenstein (user's words): non-standard anatomy, bespoke controls, duplicated logic vs the schedule widget?
3. SEMANTIC GAP analysis — the core question: is revive's dual-mode really schedule-like?
   - `'N unit'` interval = RELATIVE duration recurrence (every N units from boundary)
   - `'at <ISO>'` = absolute one-shot pin
   - schedule/cron = absolute calendar recurrence
   These are NOT the same algebra — document precisely what the schedule widget can and cannot express vs revive semantics.
4. WIRE COMPATIBILITY: if the schedule widget were adopted, how would it serialize into the flat varchar `revive_every`? Options: (a) adapter serializing schedule-spec → canonical varchar (lossy? reversible?); (b) migrate the column to a structured spec (DB migration + backfill historical rows + filter semantics change from ILIKE to structured operators); (c) keep varchar but change the editor only. Evaluate each against: ILIKE filter semantics, historical data, `sequenceRevive` write-path parsing, the `revive_offset` sibling (grace/until — same question).
5. FILTER SURFACE consequence: schedule_spec is editor-only by parity doctrine — if revive adopts it, do revive filters stay contains-text (regression vs today's composite) or does the schedule widget need a filter variant? Cost it.
6. VERDICT: one of — (A) adopt schedule widget with adapter, (B) migrate wire to structured spec, (C) keep varchar but RESTYLE ReviveIntervalInput onto standard widget primitives (the likely middle path: the complaint is "fuori standard", maybe the anatomy can be rebuilt from ComboSelect/segmented primitives without touching the wire), (D) keep as-is with documented rationale. Recommend with evidence.

## Context breadcrumbs for next session

- All prior work committed+pushed: core `feature/elt-visibility-prefs-v3`, dal+fe on `feature/sequence-revive-docs` (fe HEAD `4f5366a`), workspace plans on `docs/ext-json-wasm-bun-gate`. Nothing volatile.
- Closed plan with full ledger: `ai-plans/bugfix-elt-filter-widget-drift.md` (incl. addendum on column-order reset).
- Widget sources: fe `src/lib/entity-form/` (FormFieldDispatcher mounts it — grep `ReviveIntervalInput`), specs in `src/e2e/sequences.spec.ts` (the governed-widgets test asserts revive composite anatomy — will need rework if widget changes).
- tz/revive_every are now default_visible:false in the list (dal commit on `feature/sequence-revive-docs`) — user-ratified, do not regress.
- ComboSelect a11y gap (div[role=combobox] no accessible name) is a separate re-homed drift — candidate for a ui plan, NOT this one.

---

# TIC evidence + verdict — 2026-11-26

## Task ledger

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Read schedule widget end-to-end | ✅ done | `primebrick-v3-ui/src/lib/components/schedule-spec-input/schedule-spec-input.svelte:1-20,53-103,114-167,174-263,292-323`; parser `primebrick-v3-ui/src/lib/utils/parse-schedule-spec.ts:1-12,25-32,67-101` |
| 2 | Read `ReviveIntervalInput` fully | ✅ done | `primebrick-v3-ui/src/lib/components/revive-interval-input/revive-interval-input.svelte:1-23,39-83,85-151,154-199` |
| 3 | Semantic gap analysis | ✅ done | core revive grammar/calendar arithmetic `primebrick-v3-core/src/sequence.ts:331-397,433-504`; schedule grammar `primebrick-v3-core/src/field-validation.ts:145-153,201-224` |
| 4 | Wire compatibility + historical data | ✅ done | entity varchar contract `primebrick-dal-v3/src/entities/sequence-entity.ts:110-124`; write path `primebrick-dal-v3/src/builtin/sequence-decl.ts:296-303,556-569,663-695`; sweep/successor `primebrick-dal-v3/src/repository/repository.ts:1064-1086`; dev DB probe below |
| 5 | Filter surface consequence | ✅ done | dispatcher doctrine/mounts `primebrick-fe-v3/src/lib/entity-form/FormFieldDispatcher.svelte:14-23,334-347,369-372,862-872`; filter panel `primebrick-fe-v3/src/lib/entity-list/sheets/panels/FiltersPanel.svelte:1-18,434-455,537-570`; serializer `primebrick-v3-core/src/list-filter-params.ts:14-20,57-79,111-119`; DAL ILIKE wrapping `primebrick-dal-v3/src/query/list-filters.ts:17-18,155-157` |
| 6 | Verdict | ✅ done | **Option C** below; no TOC started |

## DOC RECEIPTS

| doc:line | what it says | consequence |
|---|---|---|
| `primebrick-fe-v3/docs/dev-guide/entity-metadata.mdx:229` | `schedule_spec` = schedule builder + localized prose | schedule widget is the canonical control for job schedule strings |
| `primebrick-fe-v3/docs/dev-guide/entity-metadata.mdx:238-239` | `revive_interval`/`revive_offset` render `ReviveIntervalInput`; filters mount the SAME composite because the emission is the stored wire value | current governed doctrine already treats revive as a value control, not a schedule editor |
| `primebrick-fe-v3/docs/dev-guide/elt-case-study-job-schedules.mdx:224-229` | job `schedule_spec` is authoring-only, `filterable:false` — “a writer, not a matcher” | making revive a `schedule_spec` would regress or contradict the filter doctrine |
| `primebrick-dal-v3/docs/dev-guide/api-reference.mdx:1197-1205` | revive axes are varchar canonical specs; varchar preserves round-trip because PG interval normalization breaks it | the flat string wire is intentional, not accidental debt |
| `primebrick-dal-v3/docs/dev-guide/api-reference.mdx:1266-1273` | update path recomputes expire/switch: interval → next calendar boundary, `at` → literal pin, NULL → revive off | revive semantics are generation-boundary semantics, not job scheduling semantics |
| `primebrick-dal-v3/docs/dev-guide/api-reference.mdx:6624-6628` | `schedule_spec` grammar is `@every <n>[smhd]`, `@at`, or 5-field cron — the NATS header contract | schedule wire grammar belongs to JetStream/NATS, not sequences |

## 1. What the standard schedule widget really is

`ScheduleSpecInput` is a **single-string NATS schedule editor**:

- grammar: `@every <dur>` | `@at <RFC3339>` | 5-field cron (`parse-schedule-spec.ts:1-12`);
- UI anatomy: free-text input first, trailing assist CTA, popover builder, live interpreter strip with validity + next runs (`schedule-spec-input.svelte:1-20,174-195,292-323`);
- the choice box is inside the assist popover and has THREE modes: interval / once / cron (`schedule-spec-input.svelte:198-263`);
- interval units offered by the builder are only `m/h/d` (`schedule-spec-input.svelte:94-103`); parser grammar accepts `s/m/h/d`, with the product floor at one minute (`field-validation.ts:145-153,201-224`);
- apply writes exactly `@every <n><unit>`, `@at <ISO>`, or the cron expression into the same free-text value (`schedule-spec-input.svelte:153-161`);
- cron next-run preview is UTC because NATS owns cron evaluation in UTC (`parse-schedule-spec.ts:92-98`); internal cron is converted to NATS 6-field form by prefixing second `0` (`job-handler/src/nats/schedule-mechanism.ts:53-66`).

Production usage is job-only:

- `job_trigger.schedule_spec` is the trigger's arm specification (`job-handler/src/domain/entities/job_trigger_entity.ts:99-103`); meta declares it `format:"schedule_spec"`, `filterable:false`, explicitly “a writer, not a matcher” (`job-handler/src/modules/jobs/job.meta.ts:110-113`);
- `job_schedule.schedule_spec` mirrors the same value and is also `filterable:false` (`job-handler/src/modules/jobs/job.meta.ts:224`);
- no other production `format:"schedule_spec"` authors exist outside tests.

## 2. What `ReviveIntervalInput` really is

`ReviveIntervalInput` is already a **canonical-varchar value control**, not a JSON/structured editor:

- grammar: interval `'N unit'` where unit ∈ `day|week|month|quarter|year`, or axis literal `'at <RFC3339>'` / `'until <RFC3339>'` (`revive-interval-input.svelte:1-23`);
- it uses standard primitives: `NumericInput` with the closed 5-unit internal UoM dropdown, `DateWheelPicker`, and `Button` (`revive-interval-input.svelte:24-35,168-199`);
- the exact 5 units intentionally hit the `UOM_DROPDOWN_MAX_OPTIONS` internal-dropdown path (`revive-interval-input.svelte:39-41,80-83`; `numeric-input.svelte:136-139,254-255`; translations seeded in BE patch `20261231240000_i18n_revive_interval_widget.sql:4-6`);
- state round-trips both ways: internal `(mode,n,unit,instant)` ↔ the exact varchar (`revive-interval-input.svelte:85-151`);
- form/filter dispatcher mounts it with `literal="at"` for `revive_every` and `literal="until"` for `revive_grace` (`FormFieldDispatcher.svelte:862-870`).

Why it feels “frankenstein” despite using standard primitives:

1. the mode selector is a small inline ghost `Button` whose label flips (`every`/`at`/`until`), not the schedule widget's explicit `Choicebox` cards (`revive-interval-input.svelte:154-167` vs `schedule-spec-input.svelte:198-263`);
2. it has no free-text canonical display and no interpreter strip/next-instant explanation, unlike the schedule widget (`schedule-spec-input.svelte:174-195,292-323`);
3. it is inline shape-shifting UI: the same row swaps numeric+uom and date-picker bodies in place (`revive-interval-input.svelte:168-199`);
4. it duplicates the “quantity + unit / absolute instant” builder pattern instead of visibly sharing the schedule widget's assist anatomy.

So the drift is **composition/anatomy drift**, not wire-format drift and not wholly bespoke primitives.

## 3. Semantic gap — the decisive blocker

The two grammars look similar only at the `@every`/`at` surface.

### Revive interval is calendar-generation algebra

- accepted units: `day|week|month|quarter|year` (`sequence.ts:331-352`);
- `reviveExpireAt` computes the FIRST CALENDAR BOUNDARY after the anchor in the row timezone: day/week/month/quarter/year are wall-calendar periods, not elapsed milliseconds (`sequence.ts:461-504`);
- `reviveAddInterval` likewise performs wall-calendar arithmetic in the row timezone (`sequence.ts:433-459`);
- the interval advances the row-owned sezionale label and creates successor generations; it is not a timer specification (`repository.ts:1064-1086`).

### Schedule interval is job-fire algebra

- accepted `@every` units are `s/m/h/d` and mean fixed durations in milliseconds (`parse-schedule-spec.ts:25-32`);
- `nextScheduleRuns` computes `from + everyMs` repetitions (`parse-schedule-spec.ts:83-90`);
- cron is an absolute UTC calendar recurrence owned/evaluated by NATS (`parse-schedule-spec.ts:92-98`);
- `@at` is a one-shot job fire instant, not a sequence-generation expiry axis (`job_trigger_entity.ts:99-103`; schedule-service terminal-once handling `schedule-service.ts:216-234`).

### Exact incompatibilities

| revive need | schedule widget can express? | why / why not |
|---|---:|---|
| `1 day` calendar boundary in row tz | approximately `@every 1d` textually, but NOT semantically | `@every` is elapsed 24h from arming/fire; revive is the next local-midnight boundary |
| `1 week` ISO-week boundary | no | `@every 7d` is elapsed time, not ISO-week Monday boundary; cron cannot carry row timezone or generation semantics |
| `1 month` / `1 quarter` / `1 year` | no | variable-length calendar units have no fixed millisecond representation; cron can approximate fixed dates only, not arbitrary `N` + row-tz boundary algebra |
| `'at <ISO>'` pin | superficially `@at <ISO>` | representation is compatible after stripping `@`, but the domain meaning differs: job fire vs `expire_at` pin |
| `'until <ISO>'` grace pin | no | schedule grammar has no `until` axis; `@at` is the wrong keyword and wrong axis |
| cron | not needed / invalid | revive grammar intentionally rejects cron |

## 4. Wire compatibility + historical data

### Current wire is deliberate

- physical columns are `character varying` (`revive_every`/`revive_grace`, length 40 in the current entity contract) because PG `interval` output normalizes values and breaks round-trip (`primebrick-dal-v3/src/entities/sequence-entity.ts:110-124`);
- wire validation accepts only revive grammar, axis-specific literals included (`primebrick-dal-v3/src/builtin/sequence-decl.ts:556-569`);
- create/update derive `expire_at`/`switch_at` from those strings (`sequence-decl.ts:296-303,663-695`);
- successor generation sanitizes literal pins: `at` does not propagate; `until` grace pins likewise do not propagate (`primebrick-dal-v3/src/repository/repository.ts:1077-1085`);
- in-tempo axis edits are guarded under row lock and optimistic version (`repository.ts:1189-1210`).

### Dev DB empirical probe — 2026-11-26

Read-only PostgreSQL probe over schemas with `sequences` tables. Only `crm.sequences` currently has rows in this dev database.

Distribution:

| field | value | rows |
|---|---|---:|
| `revive_every` | `1 day` | 13 |
| `revive_every` | `1 year` | 18 |
| `revive_every` | `2 years` | 4 |
| `revive_every` | `at 2028-11-24T23:30:30.000Z` | 1 |
| `revive_every` | `at 2028-11-24T23:31:07.000Z` | 1 |
| `revive_every` | `at 2028-11-25T13:39:44.000Z` | 1 |
| `revive_grace` | `2 days` | 13 |

Totals in CRM: `revive_every` 35 interval rows + 3 literal rows; `revive_grace` 13 interval rows; zero non-conforming strings found. Any wire change is therefore a migration/backfill, not a refactor.

Local schema observation (non-blocking): most schemas expose length 40 for both revive columns; `boilerplate.sequences` still reports length 30 in this dev database. That looks like local migration drift or a stale service schema, not part of this widget decision.

## 5. Filter surface consequence

Current governed behavior:

- `revive_interval`/`revive_offset` are VALUE controls on the filter surface, explicitly never degraded to text (`primebrick-fe-v3/src/lib/entity-form/FormFieldDispatcher.svelte:334-339`; `primebrick-fe-v3/src/lib/entity-list/sheets/panels/FiltersPanel.svelte:1-18`);
- standard filter rows mount the same dispatcher control (`FiltersPanel.svelte:434-455`); advanced criteria mount it in the value slot (`FiltersPanel.svelte:537-570`);
- quick text filters serialize as `ILIKE` (`primebrick-v3-core/src/list-filter-params.ts:57-79`); DAL wraps a wildcardless ILIKE value as `%value%` (`primebrick-dal-v3/src/query/list-filters.ts:155-157`);
- the E2E contract proves typing `1` in the revive composite emits canonical `1 year` and wires `filters[i][field]=revive_every&op=ILIKE&value=1 year` (`primebrick-fe-v3/src/e2e/sequences.spec.ts:631-665`).

If revive became `schedule_spec`: doctrine says schedule is an EDITOR (`writer, not matcher`); job metas mark it `filterable:false`; dispatcher degrades schedule-like editors to text when filtered. Revive filters would therefore disappear or regress from the governed composite to text. Building a filter variant of `ScheduleSpecInput` that emits revive varchar would recreate a bespoke adapter/control — exactly the cost adoption was supposed to avoid.

## 6. Options evaluated

### (A) Adopt `ScheduleSpecInput` with an adapter — REJECT

Not reversible and not semantic-preserving:

- only day-sized `@every` values have a superficial textual mapping to revive (`@every 1d` → `1 day`), and even that changes meaning from elapsed duration to calendar boundary;
- week/month/quarter/year cannot round-trip through `s/m/h/d`;
- cron has no revive meaning and would become invalid input the widget actively encourages;
- `@at` requires stripping `@`; `until` has no representation at all;
- free-text schedule input would admit `m/h` and cron values that the revive wire validator must reject.

Verdict: adapter is lossy, asymmetric, and semantically false.

### (B) Migrate wire to structured spec — REJECT for this problem

A structured revive spec (`kind,count,unit,instant`) could be honest, but it is a cross-repo data migration: core type/format/validation, DAL entity/write-path/sweep/migrations/backfill, FE form/filter serialization, structured filter semantics instead of varchar ILIKE, and historical-row backfill. It still would NOT make the value a NATS `schedule_spec`, so the schedule widget would need adaptation anyway. Cost is architectural; benefit does not answer the original complaint (visual/anatomy standardization).

### (C) Keep varchar + restyle/rebuild revive anatomy from standard primitives — RECOMMEND

Keep the canonical wire and domain semantics unchanged; fix the actual drift: anatomy.

Recommended TOC direction (ONLY after user ratification):

1. keep `format:"revive_interval"` / `format:"revive_offset"`, parser, validators, DB columns, filter contract untouched;
2. redesign `ReviveIntervalInput` composition using the schedule widget as reference anatomy:
   - explicit mode selection through governed primitives (`Choicebox` or segmented standard chosen in TOC after anatomy inventory);
   - `NumericInput` internal UoM dropdown retained;
   - `DateWheelPicker` retained for `at`/`until`;
   - add an interpreter/preview strip derived from the same core parsers (and ideally the row timezone when available) instead of leaving the canonical invisible;
3. decide in TOC whether the primary face remains direct-input composite or becomes canonical text + assist popover like `ScheduleSpecInput`; this is a UX/anatomy ratification point, not a wire decision;
4. update widget tests to assert the new product anatomy while preserving existing wire assertions (`1 year`, `at <ISO>`, ILIKE filter);
5. update FE/DAL docs that currently describe the leading mode toggle as canonical.

### (D) Keep as-is — not recommended

Defensible technically because wire/parsers/filter are correct, but it does not address the user's real complaint: the composition is visibly non-standard compared with the schedule builder.

## Final verdict

**Option C. Do NOT adopt `ScheduleSpecInput`; do NOT migrate the wire. Restyle/rebuild `ReviveIntervalInput` onto standard widget primitives using `ScheduleSpecInput` as the reference anatomy.**

The blocker is not a missing choice box. The blocker is that `schedule_spec` and revive specs are different algebras:

- `schedule_spec` schedules job fires through NATS (`@every` elapsed duration, `@at` one-shot fire, cron UTC recurrence);
- revive specs define sequence-generation boundaries (`day/week/month/quarter/year` wall-calendar periods in row timezone) and generation pins (`at`/`until`).

They share a visual pattern (quantity+unit vs absolute instant), not a semantics or wire contract.

## Anomalies / doc gaps surfaced (not fixed in TIC)

1. `primebrick-dal-v3/src/builtin/sequence-decl.ts:91-95` still comments `revive_every` as immutable/create-only, while the same file implements editable-in-tempo axes (`:296-303`) and the FE E2E asserts both axes editable while in tempo (`primebrick-fe-v3/src/e2e/sequence-form-contract.spec.ts:225-239`). Reconcile in any TOC that touches this area.
2. Local dev DB reports `boilerplate.sequences.revive_*` length 30 while the current entity contract is length 40; likely migration drift in the local environment. Not used as verdict evidence.
3. `primebrick-fe-v3/src/e2e/sequences.spec.ts:90` appears to assert `revive_every` is not `default_visible:false`, while the later visibility contract and metadata say it IS hidden by default. Verify before any future E2E edit.

## Next step

Await user ratification. If ratified, open/convert this plan to TOC for **option C only**, starting with the mandatory anatomy inventory/reference lock against `ScheduleSpecInput`, `NumericInput`, `Choicebox`, and `DateWheelPicker`. No source files were modified by this TIC.
