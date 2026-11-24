# Bugfix: sequence create-sheet field drift — flag contract, revive_interval format, default_from anchor input

> Plan-first workflow — named at every turn; ledger updated per turn with
> ✅ + commit hash or ⏳ + residuals. Deviation → STOP, update plan first.
> Parent: `sequence-reviver-sections-and-tz.md` (task 7 shipped the meta
> columns — this is the post-review form-contract fix found on that surface).

## Status: 🟡 TOC in progress — tasks 1-6 ✅ (i18n + e2e + docs remain) — Plan date: 2026-11-24

## The bug (user report)

The sequence create sheet (synthesized `page_props.form` fallback in
`build-entity-form-schema.ts:199` `synthesizeFormDecl`) renders **every
physical non-audited/non-managed/non-kind/uid column** — `default_visible`
is a LIST flag only and never suppresses a field from forms. The reviver
columns were authored `default_visible:false` → all leaked into the form:
`binding_key`, `expire_at`, `switch_at`, `default_from`, `revived_from`,
`revived_at`, `revived_by` — **fields the wire validator rejects as
"unknown field"** (`SEQUENCE_WRITE_KEYS`, sequence-decl.ts:444). Plus a
label collision: `revived_from` and `revived_by` both serve it-IT
"Rinnovato da" (i18n patch `20261231151000`).

## TIC evidence (verified this session)

| Question | Evidence |
|---|---|
| Form field source | `synthesizeFormDecl` excludes `hidden`/`audited`/`kind`/`managed`/uid/`version` — **not** `default_visible` (fe `build-entity-form-schema.ts:199-213`) |
| numeric+uom→text precedent | `format:"schedule_spec"` on `type:"text"` (`job.meta.ts:110,224`) → `ScheduleSpecInput` = `NumericInput` + `UomOption[]` emitting text canonical `@every 5m`. THE pattern for `revive_every` |
| uom dropdown threshold | `UOM_DROPDOWN_MAX_OPTIONS = 5` (ui `useNumericInput.svelte.ts:62`) — day/week/month/quarter/year = exactly 5 → **internal dropdown**, no host sheet needed |
| Cascade system | `MetaColumn.depends_on.disabled_when{set:false}` — "disabled while the pivot is empty" (core `entity-meta.ts:601-634,426-441`). Governed, zero hardcoding. DISABLES, never hides |
| `managed` flag | derived-only, reserved for DB-filled keys — **authors MUST NOT set** (`entity-meta.ts:543-548`) |
| `audited` form effect | `EntityFormField` throws by construction on audited columns (fe `EntityFormField.svelte:107-109`) → accordion + audit band, never a form field |
| `binding_key` semantics | series identity `<table>.<field>` written ONLY at binding materialize; `name` on bound rows already displays it → redundant to show (sequence-entity.ts:104-108) |
| sez literal-only | `SEZ_VALUE_RE` charset excludes braces → `{expr}` impossible; `derivePeriodLabel` parse-and-preserves at revive (sequence.ts:106,495) |
| revive_slot validation | `assertReviveCoherence` already enforces: slot ∈ pattern tokens, row-owned value parses under `derivePeriodLabel` (sequence-decl.ts:565-599) |
| `reviveExpireAt` semantics | truncates `at` to current boundary, +N units → first boundary after anchor (sequence.ts:407) |
| "Cloned From" label | `system.common.fields.cloned_from` — it-IT is "Clone Di" post-collision-fix (`20261113141900`) |
| Cross-ns labels | `system.common.fields.*` resolves from BE metas — field-specific keys stay canonical per-module |

## Locked decisions (user)

1. **`revive_every`/`revive_grace`** → new `format:"revive_interval"` →
   dedicated control on the `NumericInput`+uom anatomy (5 units → internal
   dropdown), emits `"N unit"` text canonical. Same family as
   `schedule_spec`, NOT `MetaColumn.uom` (numeric-columns-only).
2. **`default_from`** becomes a CREATE write key: datetime input
   "a partire da quando" — default **tomorrow 00:00 local → UTC payload**,
   `immutable`, gated `depends_on.disabled_when{field:"revive_every",set:false}`.
   `expire_at` = `reviveExpireAt(default_from, every, tz)` server-side —
   never an input.
3. **`expire_at`, `switch_at`, `revived_from`, `revived_at`, `revived_by`**
   → `audited:true` (audit band + accordion, form-impossible by
   construction). `expire_at` leaves the visible list column → audit band
   (accepted).
4. **`binding_key`** → `hidden:true` (machine key, `name` already shows it).
5. **`sez`,`sez2`,`sez3`** → `immutable:true` (identity of the revive axis).
6. **`revive_from` label** → reuse "Cloned From" copy (it "Clone Di") —
   patch the VALUE of `<ns>.entities.sequence.fields.revived_from` on all
   schemas; key stays canonical.
7. **`revive_slot`** stays closed-enum select {sez,sez2,sez3} + NEW
   cross-field form validator `sequence_revive_shape` in the closed
   `validators` registry — pattern-driven coherence (slot ∈ pattern
   tokens, value parses `derivePeriodLabel`) live in the form, same
   contract as wire `assertReviveCoherence`.
8. Plan location: this file (multi-repo span); reviver plan ledger gets a
   cross-reference note on task 7.

## Tasks

| # | Task | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | core: `MetaColumnFormat` + `"revive_interval"` — closed vocab entry; docs comment (varchar `"N (day|week|month|quarter|year)[s]"` canonical, NOT pg interval) | ✅ | core `a0017c9` | same family as `schedule_spec`/`nats_subject`/`sequence_pattern` |
| 2 | ui: `ReviveIntervalInput` — `NumericInput` + `UomOption[5]` internal dropdown (≤5 rule), emits/round-trips `"N unit"` canonical; seedFromValue parses existing value (schedule-spec anatomy) | ✅ | ui `9bf24c4` | units day/week/month/quarter/year; i18n `app.widgets.revive_interval.*`; dual-state n/unit ↔ canonical with lastEmitted reseed |
| 3 | fe: `FORM_CONTROLS` mapping `revive_interval` + filter-surface fallback `text`; cross-field validator `sequence_revive_shape` in `CROSS_FIELD_VALIDATORS` (pattern+sez+slot coherence — shared predicate from core: extract `assertReviveCoherence` check to `checkSequenceReviveShape(row)` returning issues, consumed by BOTH form registry and dal wire validator) | ✅ | fe `0b8e62f` | one rule, three surfaces — no drift |
| 4 | core: `checkSequenceReviveShape` predicate extracted (from dal `assertReviveCoherence` logic — core owns the grammar already: `parseSequencePattern`, `derivePeriodLabel`) | ✅ | core `a0017c9` | shipped as `sequenceReviveShapeIssues` — FieldIssue[] {path,code,message} kmsg-keyed |
| 5 | dal: `sequence-decl.ts` meta columns — `expire_at`/`switch_at`/`revived_from`/`revived_at`/`revived_by` → `audited:true`; `binding_key` → `hidden:true`; `sez*` → `immutable:true`; `revive_every`/`revive_grace` → `format:"revive_interval"`; `revive_slot` → `type:"badge"` + `badge.values{sez,sez2,sez3}` + `depends_on.disabled_when{revive_every,set:false}` (the `run_as` anatomy, job.meta.ts:130); `default_from` → `immutable` + `depends_on.disabled_when{revive_every,set:false}` + order into revive block; wire validator `SEQUENCE_WRITE_KEYS` += `default_from` (create-only, `vInstant`); `reviveAnchors` uses `body.default_from ?? now` as anchor; `assertReviveCoherence` delegates to `checkSequenceReviveShape` | ✅ | dal `fafd3fa` | + `meta.form.validators`; last_alloc_* orders 14/15→23/24 (collision the edit widened); spec 15/15 |
| 6 | fe: `FormFieldDispatcher` — `revive_interval` → `ReviveIntervalInput`; `depends_on` resolution already generic (no work). `default_from` prefill: `default_value`/`col.default` are literal-only — the computed baseline precedent is `format:"i18n_key"` → `i18nKeyInitial` in `buildInitial` (EntityFormSurface:207,229). RESOLVED: authored `default` gains a computed spec `{kind:"next_day_start_local"}` (closed vocab — the authored-default channel already exists for non-SQL values, entity-meta.ts:560-571); `buildInitial` resolves it to tomorrow 00:00 browser-local → Date, control emits UTC ISO. No per-column hardcoding | ✅ | fe `0b8e62f`; core `a0017c9` | spec lives on `col.default` (`ColumnDefaultSpec`), resolved by `resolveColumnDefault` → `date-wire.nextDayStartLocalIso` |
| 7 | i18n patch ×N schemas: `<ns>.entities.sequence.fields.revived_from` value → "Cloned From"/"Clone Di"/"Cloné Depuis"/"Clonado Desde"/"Geklont Von"/"Clonado De"; `<ns>.entities.sequence.fields.default_from` → "Starts from"/"Valida dal" copy; `<ns>.entities.sequence.fields.revive_slot` label check | ⏳ | | be/system + crm + ai + job-handler + webhook? (whichever schemas own sequences) |
| 8 | e2e: sequence create sheet field census — exactly the 13 write-key fields render; `default_from` gated-disabled until `revive_every`; revive_interval control round-trips `"3 months"`; update sheet: sez/revive_every/revive_slot/default_from disabled; expire/switch/revived_* in audit accordion | ⏳ | | `sequences.spec.ts` extend or new spec — canonical e2e docs pre-read mandatory |
| 9 | docs: `entity-metadata.mdx` — `depends_on.disabled_when` + `audited`/`immutable` flag taxonomy recap; `sequence` dev-guide revive section — create contract (default_from anchor, derived expire/switch); commit per repo | ⏳ | | |

## Open questions — resolved or none

- ~~default_from visible always or only with revive?~~ → `depends_on.disabled_when{set:false}` — disabled-chrome until revive_every set (governed cascade, not hide).
- ~~expire_at still visible in list?~~ → `audited` moves it to audit band — user accepted ("le _at sono audit").
- revive_slot options filtered to pattern tokens → NOT expressible via depends_on (no options-filter edge); closed enum + `sequence_revive_shape` validator covers it.

## Verified — TIC

- `synthesizeFormDecl` filter list read verbatim; `audited`→EntityFormField throw confirmed; `depends_on` spec + `set:false` facet read; `UOM_DROPDOWN_MAX_OPTIONS=5`; `reviveExpireAt`/`derivePeriodLabel`/`SEZ_VALUE_RE` read in core; wire validator `SEQUENCE_WRITE_KEYS` + `assertReviveCoherence` read; clone label patches read.

## TOC log

- **builtin-entity form axis** — the sequence leaf (`builtinSequenceNav`) is `entity:`-only; builtin entities have NO route decl to author `page_props.form` against. RESOLVED: `EntityMeta.form{validators}` added (core `a0017c9`) — `synthesizeFormDecl` attaches it; authored route decls win. `meta.create{surface}` precedent. Section headers skipped: `FormFieldPlacement.section` has no renderer consumer.
- **D: drive disconnect mid-TOC** — `date-wire.ts` tail truncated by the failed write; restored verbatim. All commits pushed per-repo for safety (user directive: commit every turn while the fault may recur).
- fe svelte-check green (0/0); pre-existing strict-null error in `elt-export-chrome.spec.ts` fixed with `?.` (semantics preserved).
