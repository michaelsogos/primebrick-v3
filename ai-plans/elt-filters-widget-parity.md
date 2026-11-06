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
| 17 | **Ghost help icon bug** — `PrimeField.resolvedHelp`: `MetaColumn` without `tooltip*` keys → `isMetaTooltipHelp=false` → FieldHelp branch returns all-undefined truthy object → icon renders, tooltip never opens (ID/NAME etc.) | ⏳ not done | — | verified `prime-field.svelte:114-129` + `FormLabelWithPriorityHelp:62` `{#if text}` |
| 18 | PrimeField help surface flag — meta path gates on `show_form_tooltip`; list-surface consumers (filters) must gate on `show_list_tooltip` → `help_context: "form"\|"list"` prop (default `"form"`), FiltersPanel passes `"list"` | ⏳ not done | — | same contract, correct surface flag |
| 19 | **Header help icon position** — `TableHeader.svelte:83-89` already renders `FormLabelWithPriorityHelp` gated `show_list_tooltip`; move it right-most (after the sort affordance — last in the header flex) | ⏳ not done | — | verify `CardField.svelte:51` same anatomy on cards |
| 20 | **Hint copy lies** — `job.entities.job_trigger.hints.event_subject` ×7 langs says "…or type an event name" while `allow_create:false` → JH patch fixing copy (drop the type clause); `target_subject` already correct | ⏳ not done | — | DB rows verified live |
| 21 | Invariant: `options_source:"census.*"` + `allow_create:true` → construction/enrollment error (census vocab is closed by definition — `allow_create` meaningful only for non-census sources) | ⏳ not done | — | enforcement, not convention |
| 22 | **SheetPanelLayout API fix**: `actions` → EXTRA actions (layout always appends standard close honoring `onClose`); migrate the 5 panels (Filters/Columns/SearchIn/JsonViewer/AiChat) — kills D8 | ⏳ not done | — | API manufactures duplication today |
| 23 | FiltersPanel anatomy: `contentClass` scroll override removed (D1); `control({id})` threaded everywhere + DateWheelPicker id (D2); advanced labels → `PrimeField` (D3 — also unblocks icons/tooltips on advanced labels); customer-status fallbacks removed (D6); `X` double import, testids, fake-column fabrication cleaned (D9) | ⏳ not done | — | lands with tasks 7-10 refactor |
| 24 | HEAD reset semantic decision: `resetAllFilters` currently live-commits (`onResetFilters`) bypassing draft→Apply — decide draft-only reset vs live reset, codify in sheets.md | ⏳ not done | — | D7 — contract gap |
| 25 | **check-standards/ESLint rules for `*/sheets/panels/*.svelte`**: (1) `<SheetPanelLayout` root mandatory, (2) `contentClass` no `overflow`, (3) no raw `<label>`, (4) `PrimeField.control` must destructure `{id}`, (5) no `$t(a\|\|b)` entity fallback in `entity-list/`, (6) `data-testid` on interactive elements, (7) no DropdownMenu-as-select once dispatcher lands | ⏳ not done | — | the "PER SEMPRE" enforcement — prose → rules |
| 26 | Commit-close semantics codified in sheets.md: FORM panels `closeSheet()` on commit OR declare `keep_open` — currently Filters=open vs BadgeValue=close by accident | ⏳ not done | — | one documented decision |

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

### A.5 Three more anomalies (reported + root-caused 2026-11-20)

**A.5.1 Ghost help icon on standard-filter labels (bug, live).**
`FiltersPanel` passes `help={col}` to `PrimeField`. In
`prime-field.svelte:111-130`: a `MetaColumn` WITHOUT `tooltip*` keys fails
`isMetaTooltipHelp` → falls into the `FieldHelp` branch → returns
`{text: undefined, priority: undefined, title: undefined, labelKey: undefined}`
— a **truthy** object → `helpIcon` renders `FormLabelWithPriorityHelp`; its
`{#if text}` (line 62) skips the content → **icon visible, tooltip never
opens** (ID, NAME, every tooltip-less column). Fix: `resolvedHelp` returns
`null` when neither `text` nor `labelKey` resolves.

**A.5.2 Wrong surface flag for filter help.** `MetaTooltipHelp` gates on
`show_form_tooltip` — the filters sheet is a LIST surface; the correct gate
is `show_list_tooltip` (same contract, wrong flag read). `PrimeField` needs
`help_context: "form" | "list"` (default `"form"` — existing callers
unchanged); `FiltersPanel` passes `"list"`.

**A.5.3 Header help icon exists but sits mid-line.** `TableHeader.svelte:83-89`
already mounts `FormLabelWithPriorityHelp` for `col.tooltip &&
col.show_list_tooltip !== false` — same component, same content as the form
label (single truth already). The gap is positional: it renders between label
and sort arrow; requested right-most (after the sort affordance). Card view:
`CardField.svelte:51` renders the same gated icon — verify its anatomy matches.

**A.5.4 Authored hint copy contradicts the closed vocabulary (live data bug).**
`job.entities.job_trigger.hints.event_subject` in DB (all 7 languages, verified):
*"…Scegli un evento disponibile **o digita il nome di un evento**."* — while the
field is `options_source:"census.emits", allow_create:false` (free entry
impossible). `target_subject`'s hint is already correct ("Available
destinations depend on the active services"). Fix: JH patch rewriting the
copy in 7 languages (drop the "or type" clause). Structural follow-up (task
21): `census.*` + `allow_create:true` must be a construction error — the copy
was wrong because nothing made the closed vocabulary visible to authors.

### A.6 Sheet-anatomy drift audit — FiltersPanel vs `docs/ai/sheets.md` (verified 2026-11-20)

**The FOOT itself is the ONE conforming element** — `p-3` + `Button.w-full`
matches the FORM-panel skeleton verbatim (sheets.md:149-153). The perceived
"non-standard footer" is real but architectural, not a local bug:

- **Two commit-footer vocabularies coexist.** Sheet FORM panels: single
  `w-full` primary CTA (sheets.md contract). Form pages (`FormPageLayout:55`):
  `bg-muted/50 border-t p-4` + right-aligned `flex gap-2` Reset/Cancel/Save.
  The entity create/update form — the reference the user sees daily — uses
  the second. Within the entity-list sheet family, `entity.filters` is the
  **only** panel with a foot at all (columns/searchIn = pickers,
  versionHistory/jsonViewer = viewers) → nothing to compare it against.
- **Micro-divergences inside the vocabulary**: Apply carries a `Play` icon
  (BadgeValuePanel foot CTAs use `Plus`/none — no icon convention exists);
  `applyFilters` does NOT `closeSheet()` while BadgeValuePanel's `saveEdit`
  does (`BadgeValuePanel.svelte:152`) — the only two FORM panels in the app
  chose **opposite commit semantics** because the contract never codified it.

#### Inventory of real drifts (file:line verified)

| # | Drift | Evidence | Violates |
|---|-------|----------|----------|
| D1 | Scroll contract re-implemented: `contentClass="flex min-h-0 flex-col overflow-hidden p-0"` clips CONTENT; each tab re-declares `flex-1 overflow-y-auto p-4` (×2) | FiltersPanel:405, 442, 569 | sheets.md "CONTENT = THE ONLY SCROLLABLE REGION" — override buys nothing vs `contentClass="p-4"` |
| D2 | `{#snippet control()}` drops the `{ id }` arg — PrimeField contract says control MUST apply `id` for label wiring. Panel hardcodes `id="filter-{col.key}"` manually (TextInput, badge Button); `DateWheelPicker` gets NO id → label `for` points at nothing | FiltersPanel:445, 457, 521-526, 545 | prime-field.svelte:93-94 — two id sources that must agree, one missing |
| D3 | Advanced tab uses raw `<label class="text-xs font-normal …">` ×3 instead of PrimeField — second label chrome in one panel, `for=` targets ids that exist on no element (DropdownMenu Buttons have no `id`) → dead `for`, no tooltip surface, no icon slot | FiltersPanel:635, 695, 732 | One label anatomy (PrimeField) — this is also why "icon + tooltip on labels" can't reach advanced labels today |
| D4 | Four hand-rolled "select" anatomies (Button+ChevronDown+placeholder dimming+selected state ~40 lines each): badge multi (std), field, operator, badge value (adv). Zero uses of canonical `ComboSelect` (search/multi/badges/icons/allowCreate) | FiltersPanel:453-518, 638-686, 698-728, 737-776 | Duplicated anatomy ×4 — killed by tasks 7-10 |
| D5 | `renderFilterInput`/`getBadgeOptions` — the second control resolver (core finding of this plan) | FiltersPanel:226-264, 146-155 | already tasks 7-8 |
| D6 | Hardcoded entity fallback: `$t(value.label_key \|\| 'system.entities.customer.status.${key}')` — a CUSTOMER i18n path inside generic filtering; any non-customer badge resolves against customer keys | FiltersPanel:152, 601 | data-model rules: "MUST NOT add fallback string-literal defaults" + copy-paste provenance evidence |
| D7 | HEAD reset = live commit: `resetAllFilters` calls `onResetFilters?.()` — bypasses the draft→Apply boundary while everything else is draft | FiltersPanel:282 | FORM archetype: "draft + explicit commit on the footer CTA" |
| D8 | HEAD close chrome copy-pasted verbatim in FiltersPanel:416-422, ColumnsPanel:87-93, SearchInPanel:36-42, JsonViewerPanel:57-63, AiChatPanel:129-135 — every panel adding ONE extra action re-declares the ~12-class close button | 5+ files | sheets.md documents this as the pattern — the API itself (`actions` REPLACES default close) manufactures the duplication |
| D9 | `X` imported twice (line 17 `X as XIcon`, line 23 `X`); `data-testid` missing on field/operator/value/add/edit/remove controls (only `filters-mode-switch`, `filters-apply` have it); `column ?? {type:'text'}` fake-MetaColumn fabrications ×3 (lines 604-605, 605) | FiltersPanel:17, 23 | sheets.md "keep data-testid on interactive elements"; data-model fallback rule |

#### Why the drift happened (root causes)

1. **The contract is prose.** `sheets.md` encodes ~15 anatomy rules in English;
   the ONLY mechanically enforced rule today is `no-restricted-imports` on the
   sheet primitive (doc:8-12). Everything else = human/agent discipline.
2. **The layout API manufactures duplication.** `SheetPanelLayout.actions`
   REPLACES the default close instead of appending to it → every panel with
   one extra CTA must re-type the canonical close chrome → 5+ copies that can
   fork silently. `contentClass` accepts arbitrary Tailwind → panels redefine
   the scroll contract inside.
3. **PrimeField's `control({ id })` contract is comment-only** — a zero-arg
   `{#snippet control()}` compiles silently; broken `for`/`id` wiring is
   invisible until someone clicks a label.
4. **No canonical select surfaced for panels.** `@primebrick/ui` has no
   DropdownMenu at all (verified: not in `src/lib/components/`); the FE keeps
   a local `$lib/components/ui/dropdown-menu` kit (26+ consumers). Authors
   reach for the primitive and rebuild select anatomy by hand — ComboSelect
   existed but nothing steered panel code to it.
5. **Copy-paste provenance.** The `system.entities.customer.status.*`
   fallback and `renderFilterInput` shape indicate the panel was lifted from
   an entity-specific filter page and only partially generalized.

#### Prevention design (lint + architecture — "PER SEMPRE")

- **API fix (one move kills D8)**: `SheetPanelLayout.actions` becomes EXTRA
  actions — the layout always appends the standard close itself (keeping
  `onClose` for remote panels). Mechanical migration of the 5 panels.
- **check-standards / ESLint rules for `*/sheets/panels/*.svelte`** (AST via
  svelte-eslint where needed, grep rules suffice for most):
  1. file MUST contain `<SheetPanelLayout` (anatomy ownership)
  2. `contentClass` MUST NOT contain `overflow` (scroll ownership is the layout's)
  3. raw `<label` forbidden inside panel files → `PrimeField`/`FormLabel`
  4. `PrimeField` `control` snippet MUST destructure `{ id }` (AST rule)
  5. `$t(a || b)` i18n fallbacks forbidden in `entity-list/` shared code —
     kills D6-class entity leaks
  6. `data-testid` required on `Button`, `DropdownMenu.Trigger`, row-action
     `<button>` inside panels (doc rule finally enforced)
  7. `DropdownMenu.Trigger`→`Button` select-anatomy forbidden in panels once
     the dispatcher lands (tasks 7-10) — use the resolved control
- **Codify commit-close semantics**: FORM panels either always
  `closeSheet()` on commit or declare `keep_open` — one documented decision,
  not per-panel accident (decision needed: filters probably SHOULD keep open
  — the user wants to watch the table update behind the sheet).
- **PrimeField**: thread `id` structurally (context/let-typing) so a panel
  cannot drop it — or the AST lint above catches it.

### A.7 Pieces already verified reusable

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
   at enrollment with a pointer to `meta.columns`; `census.*` +
   `allow_create:true` fails likewise.
6. No ghost help icon anywhere `PrimeField` is used — a column without
   tooltip meta renders no `?` trigger (regression-guarded by a DOM test:
   `id`/`name` rows contain zero `[aria-label="Help"]` nodes).
7. Help icon on table headers sits right-most when `col.tooltip` +
   `show_list_tooltip`; same component, same content as form/filter labels
   (single truth — no third tooltip implementation).
8. `job_trigger.hints.event_subject` no longer promises free entry in any
   language; the combobox cannot create values anywhere (form OR filter).

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
