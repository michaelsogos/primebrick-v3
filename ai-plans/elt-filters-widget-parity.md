# Plan: ELT filters — widget parity with entity forms (single control source)

> Related plans: `metadata-driven-page-system.md` (umbrella), `action-chrome-and-bulk-scope-dialog.md` (sibling ELT work).
> Origin: user request — filters must mount **the same components as create/update forms** (standard tab labels + values, advanced tab values), driven by **one** control-resolution logic, not two. "Quante fonti della verità stai usando?" — the audit below answers: **three**, one incomplete.

## Status: 🟠 WIP — Plan date: 2026-11-20 (empirical audit complete, implementation not started)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | `MetaColumn` gains `options_source` / `widget` / `allow_create` (core `entity-meta.ts`) — hoisted verbatim from `FormFieldPlacement`; closed unions typed | ⏳ not done | — | column owns its option vocabulary — entity semantics, not page layout |
| 2 | `FormFieldPlacement` drops `options_source` / `widget` / `allow_create` (core `page-route.ts`) + nav-declaration/enrollment validator **rejects** them on placements (construction-time, never silent) | ⏳ not done | — | breaking change, coherent |
| 3 | `job.meta.ts` columns: `event_subject`→`options_source:"census.emits"`, `target_subject`→`options_source:"census.callables"`, `payload_map`→`widget:"payload_map"`; `nav-declaration.ts` TRIGGER_FORM cleaned | ⏳ not done | — | `allow_create:false` moves too |
| 4 | `FormFieldDispatcher` reads `column.widget/options_source/allow_create` instead of `placement.*` — behavior identical | ⏳ not done | — | same resolution, new source |
| 5 | Extract census option derivation (`emitsOptions`/`callablesOptions` anatomy: `value/label/_desc/_sub/_icon/_icon_color`) from `EntityFormPage` → shared `$lib` helper reading `shellNav.modules`; form consumes it too | ⏳ not done | — | kills inline duplication, no prop drilling into sheets |
| 6 | `FormFieldDispatcher` → surface-aware (`surface: "form" \| "filter"`); closed `CONTROLS` per surface; unknown → throw (construction enforcement preserved) | ⏳ not done | — | ONE dispatcher, two surface maps |
| 7 | Filter surface control map: `badge`→ComboSelect `display="badge"` **mode=multi**; `nats_subject`+options_source→`subject_combo` (multi); `boolean`→tri-state control; `json`/`payload_map`/`schedule_spec`→text (contains semantics); number/email/url/phone→same inputs as form | ⏳ not done | — | see B.3 decision table |
| 8 | `FiltersPanel` standard tab: `renderFilterInput`/`getBadgeOptions`/custom badge DropdownMenu **deleted** — every column renders `PrimeField` + dispatcher control | ⏳ not done | — | the second logic dies here |
| 9 | `PrimeField` gains `icon?: string` — `DynamicIcon` before label text (mirrors `FormLabel` `{#if col.icon}` in EntityFormPage:655) | ⏳ not done | — | standard-tab label icons |
| 10 | `FiltersPanel` advanced tab: value input replaced by dispatcher control, operator-aware (`BETWEEN`→pair, array-producing controls feed IN) | ⏳ not done | — | field selector icons already done ✅ |
| 11 | Boolean filter control — tri-state (any / true / false) for both tabs; `getOperatorsForColumnType("boolean")` → `["=","!="]` (core `columns.ts` — currently falls into numeric `>,<,>=,<=`) | ⏳ not done | — | `>` on booleans is nonsense today |
| 12 | `appendListFilterParams` (core `list-filter-params.ts`): `col.options_source` → `op:"="` (not ILIKE); ANY array value → `IN`/`NOT IN` (generalizes the badge-only OR-chain) | ⏳ not done | — | ILIKE on governed subjects is wrong (`a.b` matches `a.b.v2`) |
| 13 | Operator icons — canonical `operator→icon` map in core `columns.ts` next to `getOperatorsForColumnType`; advanced operator combobox renders it | ⏳ not done | — | lucide names must be verified empirically before authoring |
| 14 | `type:"ref"` filterable columns (found: `job_run.schedule_subject`) → entity-ref options surface: `options_source:"entity.ref"` derived from `col.ref.entity`, fetch target `/list` (value=uid, label=display_field) | ⏳ not done | — | candidate phase-2 if heavy — text input acceptable interim |
| 15 | E2E: subject combo in both tabs (options carry icon+desc+subject), boolean tri-state wire `=true/false`, badge multi → IN/OR-chain wire shape, icon on standard labels | ⏳ not done | — | mandatory per workflow |
| 16 | svelte-check + check-standards + unit tests (new: serializer IN-generalization, boolean ops, surface control map) | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Part A — Empirical findings (verified 2026-11-20)

### A.1 How many "sources of truth" resolve a column → control today

| # | Where | Logic | Covers |
|---|-------|-------|--------|
| 1 | `fe/src/lib/entity-form/FormFieldDispatcher.svelte:118-150` | `placement.widget ?? deriveControl()` → `format` → `type`/`pg_type` → text; **closed `CONTROLS` set — unknown control throws** | schedule_spec, json, subject_combo, payload_map, badge, textarea, number, email, url, phone, text |
| 2 | `fe/.../sheets/panels/FiltersPanel.svelte:226-254` `renderFilterInput()` | `col.type` only: badge→custom DropdownMenu, date/datetime→DateWheelPicker, **else→TextInput** | 3 of ~12 cases; ignores `format`, `pg_type`, `json_schema`, `widget`, `options_source` |
| 3 | Option vocabularies: `EntityFormPage.svelte:138-166` | `emitsOptions`/`callablesOptions` derived inline from `modules` prop — **not reusable** | census emits/callables only |

Two control resolvers + a non-reusable option builder = the drift the user flagged.

### A.2 Where the missing metadata lives

`options_source`, `widget`, `allow_create` exist ONLY on `FormFieldPlacement`
(core `page-route.ts:98-140`) — route `page_props.form.fields`, page-domain.
`MetaColumn` (core `entity-meta.ts:266`) has **none** of them. Filters receive
`MetaColumn[]` → structurally unable to know a column is census-backed.

The doc on `MetaColumn.format` already states the intended contract:
*"the SEMANTIC input contract of a column: which control archetype a form
renderer must use"* — `options_source`/`widget`/`allow_create` are the same
kind of statement (the column's option vocabulary + control override), NOT
page layout. Hoisting them completes the contract.

### A.3 Audit — filterable columns rendering wrong widgets today

Scanned all `*.meta.ts` (`be/src/modules`, `us/*/src/modules`), columns with
`filterable: true`, grouped by type/format:

| Type/Format | Count | Today | Should be |
|---|---|---|---|
| `type:"text"` (plain + identifier/snake_key/slug/no_space formats) | 37 | TextInput | TextInput ✓ |
| `type:"datetime"` | 13 | DateWheelPicker | DateWheelPicker ✓ |
| `type:"boolean"` | 6 | **TextInput** — free-text "true"?? | tri-state any/true/false |
| `type:"badge"` | 5 | custom DropdownMenu+Badge | canonical ComboSelect `display="badge"` multi |
| `format:"nats_subject"` + census options (event_subject, target_subject) | 2 | **TextInput** — ungoverned free text | `subject_combo` (same as form) |
| `format:"nats_subject"` no options_source (job_schedule.schedule_subject) | 1 | TextInput | TextInput ✓ (ungoverned) |
| `type:"ref"` (job_run.schedule_subject) | 1 | **TextInput** on a uid | entity-ref combo (task 14) |

Advanced tab additionally: boolean falls into `default` branch of
`getOperatorsForColumnType` → `>,<,>=,<=` on booleans.

### A.4 Wire contract (verified `core/list-filter-params.ts`)

- `filterValues` (standard): `type:"text"`→ILIKE, else `=`; **badge array → per-value OR-chain** (not IN).
- `advancedFilters`: array→`IN`/`NOT IN`; `BETWEEN`→`value[start]/value[end]`; `contains|startsWith|endsWith`→ILIKE patterns.
- Consequences: (a) subject fields must emit `=`/`IN`, not ILIKE; (b) multi-select filter controls just produce arrays — the serializer already knows IN; (c) generalizing "array → IN" beyond badge makes the OR-chain redundant.

### A.5 Pieces already verified reusable

- `shellNav.modules` (`$lib/shell/modules-shell.svelte.ts:146`) — app-wide reactive census, importable by sheet panels directly (no prop drilling). Same payload `EntityFormPage` receives via prop.
- `ComboSelect` — `mode:"single"|"multi"`, `display:"detailed"|"badge"`, `iconField`/`iconColorField`/`descriptionField`/`secondaryField` — the subject anatomy AND badge anatomy are both first-class.
- `PrimeField` — `label?: string` only; needs `icon?: string` (form labels render `col.icon` via `FormLabel`+`DynamicIcon` — different stack, same visual).
- Census option anatomy is hardcoded inline in `EntityFormPage`: `zap`/`amber-500` (emit), `send`/`sky-500` (callable) — already the canonical pair used in table cells (see metadata-driven-page-system §D drift-audit notes).

---

## Part B — Target design

### B.1 Single control-resolution contract

```
MetaColumn (entity-owned)                    FormFieldPlacement (page-domain)
  key, label_key, type, format, pg_type        key, col/span/row/row_span, section,
  icon, badge, json_schema, …                  default_value, placeholder_key,
  options_source  ◄── MOVED HERE               required, readonly
  widget          ◄── MOVED HERE
  allow_create    ◄── MOVED HERE
```

- `options_source` closed union starts as `"census.emits" | "census.callables"`;
  task 14 may add `"entity.ref"`.
- Enrollment validator: a placement carrying the moved keys = construction
  error (message points at the column). Drift impossible at decl time.

### B.2 One dispatcher, two surfaces

`FormFieldDispatcher` gains `surface: "form" | "filter"` (default `"form"`).
`resolveControl(column)` stays the ONLY resolution: `column.widget ??
deriveControl(column)`; the CONTROLS set is per-surface — unknown → throw.

Filter-surface map (the DIFFERENCES, everything else identical to form):

| Column | Filter control | Rationale |
|---|---|---|
| `type:"badge"` | ComboSelect `display="badge"` **multi** → `string[]` | IN semantics; kills custom DropdownMenu |
| `format:"nats_subject"` + `options_source` | `subject_combo` multi → `string[]` | governed vocabulary, same options builder |
| `type:"boolean"` | tri-state select (`any`/`true`/`false`) | filter needs "don't care" third state |
| `format:"json"`/`pg_type:jsonb`, `widget:"payload_map"` | TextInput (contains on serialized JSON) | filter ≠ editor; syntax lint irrelevant for ILIKE |
| `format:"schedule_spec"` | TextInput | filtering `@every …` strings, no need for the builder UI |
| number/email/url/phone/date/datetime | same component as form | parity |

`resolveControl` never silently falls back — a `type`/`format` combo with no
filter-surface mapping throws (same posture as form surface).

### B.3 Census options shared

`censusSubjectOptions(modules, "emits"|"callables")` — pure derivation extracted
from `EntityFormPage` (identical anatomy). Form page calls it with its `modules`
prop; `FiltersPanel` calls it with `shellNav.modules`. Same options object in
both surfaces → same combobox, same rows, same icons.

### B.4 Wire refinement (task 12)

- `col.options_source` → `op:"="` regardless of `type:"text"` (governed
  equality, not substring).
- Any array in `filterValues` → `IN` (badge included — replaces the OR-chain;
  same semantics, better SQL, one shape).
- `getOperatorsForColumnType("boolean")` → `["=", "!="]`.

### B.5 Standard-tab label icon

`PrimeField` `icon?: string` prop — `DynamicIcon` before `{label}`, same
position/visual as `FormLabel`'s `{#if col.icon}` block. Panel passes
`icon={col.icon}` — optional, absent → nothing (same contract as header).

### B.6 Operator icons (proposal — needs user confirmation of the map)

Canonical `FILTER_OPERATOR_ICON: Record<FilterOperator, string>` in core
`columns.ts` — the operator combobox renders it. Candidate lucide names
(VERIFY in vendor before authoring):
`=`→`equal`, `!=`→`equal-not`, `>`→`chevron-right`, `<`→`chevron-left`,
`>=`/`<=`→`chevrons-right`/`chevrons-left`, `contains`→`text-search`,
`startsWith`→`arrow-right-to-line`, `endsWith`→`arrow-left-to-line`,
`BETWEEN`→`arrow-left-right`, `IN`→`list`, `NOT IN`→`list-x`.

---

## Part C — Non-goals / explicitly out of scope

- Filter PRESETS (button-group/combobox in toolbar) — already shipped.
- Form-page layout/policy fields stay in placement — this is not a merge
  of MetaColumn and placement, only the vocabulary/override hoisting.
- `ref_count`/reverse_ref filter UX — virtual columns are non-filterable by
  construction (contract already enforced).
- The remote `jobs-page.js` surfaces — they consume the same serializer via
  `@primebrick/ui` re-export; the wire change propagates for free.

## Part D — Acceptance criteria

1. `FiltersPanel` contains **zero** control-selection logic — `renderFilterInput`,
   `getBadgeOptions`, the custom badge DropdownMenu are gone.
2. Filtering `event_subject`/`target_subject` shows the identical detailed
   combobox the create form shows (icon ⚡/✈, label, desc, raw subject) —
   standard AND advanced tabs.
3. Boolean columns show tri-state; advanced boolean ops limited to `=`,`!=`.
4. `svelte-check 0/0`, `check-standards` clean, E2E green incl. new filter
   specs; serializer unit tests cover IN/NOT IN/`=` on `options_source`.
5. Declaring `options_source`/`widget`/`allow_create` on a placement fails
   at enrollment with a pointer to `meta.columns`.

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
