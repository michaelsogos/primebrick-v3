# Bugfix: sequence create-sheet field drift — flag contract, revive_interval format, default_from anchor input

> Plan-first workflow — named at every turn; ledger updated per turn with
> ✅ + commit hash or ⏳ + residuals. Deviation → STOP, update plan first.
> Parent: `sequence-reviver-sections-and-tz.md` (task 7 shipped the meta
> columns — this is the post-review form-contract fix found on that surface).

## Status: 🟡 TOC wave-2 in progress — explicit-date requirement + labels/tooltips — Plan date: 2026-11-24

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
| 2 | ui: `ReviveIntervalInput` — `NumericInput` + `UomOption[5]` internal dropdown (≤5 rule), emits/round-trips `"N unit"` canonical; seedFromValue parses existing value (schedule-spec anatomy) | ✅ | ui `1bfd876` | units day/week/month/quarter/year; i18n `app.widgets.revive_interval.*`; dual-state n/unit ↔ canonical with lastEmitted reseed |
| 3 | fe: `FORM_CONTROLS` mapping `revive_interval` + filter-surface fallback `text`; cross-field validator `sequence_revive_shape` in `CROSS_FIELD_VALIDATORS` (pattern+sez+slot coherence — shared predicate from core: extract `assertReviveCoherence` check to `checkSequenceReviveShape(row)` returning issues, consumed by BOTH form registry and dal wire validator) | ✅ | fe `0b8e62f` | one rule, three surfaces — no drift |
| 4 | core: `checkSequenceReviveShape` predicate extracted (from dal `assertReviveCoherence` logic — core owns the grammar already: `parseSequencePattern`, `derivePeriodLabel`) | ✅ | core `a0017c9` | shipped as `sequenceReviveShapeIssues` — FieldIssue[] {path,code,message} kmsg-keyed |
| 5 | dal: `sequence-decl.ts` meta columns — `expire_at`/`switch_at`/`revived_from`/`revived_at`/`revived_by` → `audited:true`; `binding_key` → `hidden:true`; `sez*` → `immutable:true`; `revive_every`/`revive_grace` → `format:"revive_interval"`; `revive_slot` → `type:"badge"` + `badge.values{sez,sez2,sez3}` + `depends_on.disabled_when{revive_every,set:false}` (the `run_as` anatomy, job.meta.ts:130); `default_from` → `immutable` + `depends_on.disabled_when{revive_every,set:false}` + order into revive block; wire validator `SEQUENCE_WRITE_KEYS` += `default_from` (create-only, `vInstant`); `reviveAnchors` uses `body.default_from ?? now` as anchor; `assertReviveCoherence` delegates to `checkSequenceReviveShape` | ✅ | dal `fafd3fa` | + `meta.form.validators`; last_alloc_* orders 14/15→23/24 (collision the edit widened); spec 15/15 |
| 6 | fe: `FormFieldDispatcher` — `revive_interval` → `ReviveIntervalInput`; `depends_on` resolution already generic (no work). `default_from` prefill: `default_value`/`col.default` are literal-only — the computed baseline precedent is `format:"i18n_key"` → `i18nKeyInitial` in `buildInitial` (EntityFormSurface:207,229). RESOLVED: authored `default` gains a computed spec `{kind:"next_day_start_local"}` (closed vocab — the authored-default channel already exists for non-SQL values, entity-meta.ts:560-571); `buildInitial` resolves it to tomorrow 00:00 browser-local → Date, control emits UTC ISO. No per-column hardcoding | ✅ | fe `0b8e62f`; core `a0017c9` | spec lives on `col.default` (`ColumnDefaultSpec`), resolved by `resolveColumnDefault` → `date-wire.nextDayStartLocalIso` |
| 7 | i18n patch ×N schemas: `<ns>.entities.sequence.fields.revived_from` value → "Cloned From"/"Clone Di"/"Cloné Depuis"/"Clonado Desde"/"Geklont Von"/"Clonado De"; `<ns>.entities.sequence.fields.default_from` → "Starts from"/"Valida dal" copy; `<ns>.entities.sequence.fields.revive_slot` label check | ✅ | be `e89b16e`, us-v3 (crm+ai+job-handler+emailsender), fe `ef1a32c` | `20261231240000_*` patches signed+applied; crm canonical, mirrors `INSERT SELECT` from crm; DB-verified 35+56 rows |
| 8 | e2e: sequence create sheet field census — exactly the 13 write-key fields render; `default_from` gated-disabled until `revive_every`; revive_interval control round-trips `"1 year"`; update sheet: sez/revive_every/revive_slot/default_from disabled; expire/switch/revived_* in audit accordion | ✅ | fe `9477cd9`, ui `ece19ad` | `sequence-form-contract.spec.ts` 2/2 green. Found+fixed: ui mount-clobber (seed fix), e2e helpers stale (`public.config_entries`→system, partial-index ON CONFLICT arbiter) |
| 9 | docs: `entity-metadata.mdx` — `depends_on.disabled_when` + `audited`/`immutable` flag taxonomy recap; `sequence` dev-guide revive section — create contract (default_from anchor, derived expire/switch); commit per repo | ✅ | fe `3e8bcab`, be `adc24fb`, dal `6f67b6d` | dal `sequences.mdx` new dev-guide (taxonomy + revive contract + 3-surface validation); fe: `revive_interval`/`meta.form`/`set:false`/default-spec/census rule |

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
- **e2e session (task 8)** — `sequence-form-contract.spec.ts` 2/2 green on live stack. Findings the spec caught: (a) `ReviveIntervalInput` mount-clobber — outward `$effect` emitted `''` over a bound stored value before the inward pass parsed it; fixed by seeding n/unit from the initial prop (ui `ece19ad`); (b) e2e infra stale after schema moves — `public.config_entries`→`system.config_entries` (test-users, 2 queries) and `ON CONFLICT (provider)` now needs `WHERE deleted_at IS NULL` arbiter for the partial index (db.ts); (c) cross-field validator live-verified: `"2026" cannot be advanced by "3 months"` flags sez on the composite — month-grain cadence needs month-grain sez shape; (d) sheet stays open in view mode after create (product behaviour), POST 201 + API list assertions carry the wire truth — `default_from=23:00Z` (tomorrow 00:00 Europe/Rome) → `expire_at=2027-01-01`.

---

## Wave 2 — explicit-date requirement + labels/tooltips (TIC 2026-11-25)

### Verified — wave-2 TIC

- **Component taxonomy answered** (user asked, no task): ONE `NumericInput` for every numeric surface — anatomy is prop-driven slots `[stepper+][uom-prefix][input][uom-suffix][stepper−][eraser]`. `ReviveIntervalInput` renders that same component (zero own markup) — it exists solely for the text↔number dual-state (`"3 months"` varchar ↔ n+unit pair). `align` defaults `"left"` globally; no FE consumer passes it (`step`/`start` identical).
- **Screenshot captured** (`test-results/tmp-sheet.png`, tmp spec deleted): `[3…month ▾ ⌫]` — canonical suffix-uom anatomy, the "gap" is the input's `flex-1` space between left-aligned n and the right-clustered CTAs.
- **Tooltips**: `MetaColumn.{tooltip, tooltip_title, tooltip_priority, show_form_tooltip, show_list_tooltip}` exist (entity-meta.ts:732-741) — i18n-keyed, static copy.
- **`section` is a dead prop** — `FormFieldPlacement.section` (page-route.ts:136) has zero renderer consumers; user dropped the fieldset idea ("no fa niente").
- **Anchor chain**: `expire_at` create = calendar-boundary after `default_from`; SUCCESSORS already arithmetic `expire_pred + revive_every` (reviver plan:181) — an explicit first `expire_at` flows through the chain day-preserving.
- **`switch_at = expire_at + revive_grace`** (sequence-decl.ts:577) — the overlap window: the expired row serves until `switch_at` so in-flight/backdated minting keeps the old series (`revive_grace` edit recomputes `switch_at` only — operational slack, not identity). Editable on update ✓.

### Decisions needed — wave-2

| # | Decision | Resolution |
|---|----------|------------|
| W1 | `align` on numeric inputs | ✅ **right — GLOBAL**: "il value è sempre allineato a destra… PER TUTTI A LIVELLO BASE" — change `NumericInput` `align` default `left`→`right` (table cells already right-align); audit every consumer for regression |
| W2 | Label rename | ✅ **`revive_grace` → "Attivazione"/"Activation"**: the user's two-moment model — (1) `expire_at` = il revive, (2) `switch_at` = quando il successore sostituisce nel mapping = "Attivazione". `default_from` keeps "Valida dal" |
| W3 | Explicit-date grammar | ✅ **Model A**: `'N unit' | 'at <RFC3339>'` on `revive_every`; `'N unit' | 'until <RFC3339>'` on `revive_grace`. User: literal = "solo un modo diverso di impostare expire_at diretto invece che calcolato dal default_from" — the `*_at` columns stay always-computed-persisted; the varchar carries HOW the moment was expressed (interval → derived, literal → direct). Composite gets every/at mode (ScheduleSpecInput anatomy, cron off). Clone sanitizes literals → NULL on successor. |
| W4 | `'at'` successor sez | ✅ **unit = `pattern.period_kind`**: clone synthesizes `'1 '+period_kind` → `derivePeriodLabel` — shape-preserving (`'26'`→`'27'`), reuses existing parse-and-preserve, no new machinery. `'at'` requires `period_kind ≠ 'none'` (no grain → nothing to advance) + `revive_slot` (already mandatory with axis). `'until'` requires `switch_at ≥ expire_at`. |
| W5 | Immutability | ✅ **editable while in-tempo** — `revive_every`/`revive_grace` lose `immutable` post-create under atomic guards (mechanics below). **`revive_every→NULL` on update = "revive off"** (wanted): clears `expire_at`/`switch_at`, row becomes permanent generation. `revive_slot`/`sez*`/`default_from`/`pattern` stay immutable (identity, not timing). Enabling revive on a never-reviving row stays impossible (revive_slot immutable+NULL) — boundary case, revisit only if asked. |
| W6 | Labels (moment/mode pairs) | ✅ `expire_at`→"Rinnovo il", `switch_at`→"Attivato il", `revive_every`→**"Rinnovo Ogni"** (confirmed — holds for `at` mode too), `revive_grace`→"Attivazione", `default_from`→"Valida dal" — i18n patch ×schemas |

### Wave-2 deep-dive — `@at` design space (clone code read: `repository.ts:991-1057`)

The clone copies `revive_every`/`revive_grace` **verbatim** to the successor and computes `expire_succ = expire_pred + revive_every` (arithmetic — a pinned day propagates). An instant literal copied verbatim is poison:

- `revive_every='at <ISO>'` on the successor → `reviveExpireAt` can't add → and a past instant would re-fire the sweep every pass (infinite revive loop). Fix: **explicit literals never propagate** — successor gets `revive_every=NULL` → the arbitrary date applies exactly once; the successor is the permanent final generation until hand-edited.
- `revive_grace='at/until <ISO>'` on the successor → its `switch_at` would land in the past → instant phase-B death at creation. Same rule: explicit grace literal → successor `revive_grace=NULL` (immediate switch at its own expire).
- ~~`derivePeriodLabel("2026", 'at <ISO>')`~~ → **W4 resolved above**: `pattern.period_kind` supplies the unit.

**Model A — grammar extension** `'N unit' | 'at <RFC3339>'` on `revive_every`; `'N unit' | 'until <RFC3339>'` on `revive_grace`. Single column per axis, composite gets every/at mode (ScheduleSpecInput anatomy, `@at` keeps dialect alignment). Clone sanitizes 'at'/'until' → NULL on successor. **← chosen**
~~Model B — `expire_at`/`switch_at` optional write keys~~ — rejected; the varchar carries the authored syntax, the `*_at` columns stay the computed contract.

### W5 — editable-while-in-tempo update contract (race-safe)

Two independent axes, each editable only while its moment is still future — enforced in ONE atomic conditional UPDATE (guards in WHERE, not check-then-write):

| Axis | Guard (WHERE) | On accept → recompute |
|---|---|---|
| expire (`revive_every`) | `expire_at > now() AND NOT EXISTS(successor)` | `'N unit'` → `reviveExpireAt(now, every, tz)` (next boundary from NOW — `default_from` is past); `'at X'` → `expire_at=X` (X>now required); `NULL` → clears `expire_at`/`switch_at` (revive off — row becomes permanent generation) |
| switch (`revive_grace`) | `switch_at > now()` | `'N unit'` → `switch_at=expire_at+grace`; `'until X'` → `switch_at=X` (X≥expire_at AND X>now); `NULL` → `switch_at=expire_at` |

Race mechanics (vs the sweep): (1) clone's due-row SELECT gains `FOR UPDATE` — serializes with concurrent updates on the predecessor row; post-lock EvalPlanQual re-checks the due predicate, so an expire_at moved future mid-flight drops out of the due set. (2) Update takes the row lock with guards evaluated atomically — if the clone committed first, `NOT EXISTS(successor)` sees it → 0 rows → typed error kmsg (`sequence_revive_closed`); if the update committed first, the clone's post-lock re-read sees the new expire_at → skips. (3) Grace edits during the grace window (successor exists, predecessor not yet switched) are allowed by design — that's exactly what the window is for.

### Wave-2 tasks (post-decision)

| # | Task | Status | Commits | Notes |
|---|------|--------|---------|-------|
| 10 | Tooltips: `MetaColumn.tooltip*` on `revive_every`/`default_from`/`revive_slot`/`revive_grace`/`sez*` (copy explains the gate + literal-only sez shapes) + i18n patch ×schemas | ⏳ | | static copy carries the disabled_when rule |
| 11 | Labels (W2+W6): `revive_grace`→"Attivazione", `expire_at`→"Rinnovo il", `switch_at`→"Attivato il", `revive_every`→"Rinnovo ogni" (+fr/de/es) — i18n patch ×schemas | ⏳ | | moment/mode label pairs |
| 12 | `NumericInput` `align` default `left`→`right` (GLOBAL) + consumer audit | ⏳ | | W1 resolved — every FE numeric flips right |
| 13 | Explicit date (W3/W4): core grammar `'N unit'|'at <ISO>'`+`'until <ISO>'`, `parseReviveInterval`/`reviveExpireAt`/`reviveAddInterval` branches, clone sanitization + `FOR UPDATE` + `'1 '+period_kind` sez advance, `sequenceReviveShapeIssues` both branches + `at`-requires-period_kind≠none + `until`≥expire, `ReviveIntervalInput` every/at mode (ScheduleSpecInput anatomy), wire validator, e2e, i18n | ⏳ | | biggest chunk — touches core/dal/ui/fe/i18n |
| 14 | Editable-while-in-tempo (W5): drop `immutable` on `revive_every`/`revive_grace`, atomic conditional UPDATE guards (expire-axis: `expire_at>now AND no successor`; switch-axis: `switch_at>now`), recompute branches incl. `NULL`→revive-off, wire validator accepts axis keys on update, typed `sequence_revive_closed` error, unit+e2e | ⏳ | | depends on 13 grammar |
