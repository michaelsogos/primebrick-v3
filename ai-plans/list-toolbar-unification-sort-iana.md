# List toolbar unification — select-all, sort builder, IANA sheet, dict filters

> Continuation of `translation-editor-sheet-redesign.md` — dict toolbar is
> already the two-level ELT anatomy (BulkActionsToolbar moved to `toolbar/`,
> shared). This plan rebalances BOTH levels across ELT card/card_list views
> and dict pages.

## Status: ✅ DONE — Plan date: 2026-12-20 · verified 2026-11-13

> Implementation landed earlier in fe `693e62a` ("canonical
> pagination/sort/search anatomy + dict-page batch") — the plan stayed ⚪
> as doc drift. Empirical re-verification 2026-11-13: every piece exists;
> the only true gap was the card-view E2E pin, added this session.

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Extract `SortBuilder.svelte` from CardViewRenderer's inline sort UI → `toolbar/` + barrel export | ✅ done | 693e62a | verified: `toolbar/SortBuilder.svelte` + index export |
| 2 | Extend `BulkActionsToolbar` with `selectAll` + `sort` + `ianaToggle` leading zones (absent = no chrome change) | ✅ done | 693e62a | verified: 3 optional typed zones + dict "no sort" comment verbatim |
| 3 | New sheet `entity.datetimeIana` + `DatetimeIanaPanel.svelte` (per-field label+hint+switch rows) | ✅ done | 693e62a | verified: panel + `SHEET_PANEL_IDS` + SheetHost map |
| 4 | ELT: plumb selectAll/sort/iana through `EntityListTableHeader` (populated only when viewMode is cards/cards_list) | ✅ done | 693e62a | verified: zones `$derived` on `isSpecialView = viewMode !== 'table'` → table passes undefined |
| 5 | `CardViewRenderer`: delete its sticky sub-bar entirely (select-all/sort/IANA move to L2) — reclaim the row | ✅ done | 693e62a | verified: zero sub-bar/Sort/Switch residue |
| 6 | Dict L1: remove SelectableToolbar+divider → search-left / CTAs-right only; add Funnel CTA → `entity.filters` sheet | ✅ done | 693e62a | verified: Funnel + entity.filters wiring; spec pins pass |
| 7 | Dict L2: selectAll zone only (NO sort — order_field has value, comment for posterity) | ✅ done | 693e62a | verified: comment preserved verbatim in EntityDictPage |
| 8 | BE patch: i18n keys for IANA CTA + panel title (`system.entities.list.datetime_iana.*`) | ✅ done | migration | verified: `fields_cta`/`title`/`mode_*` in seed translations ×5 langs (`migration-datetime-iana-sheet`) |
| 9 | E2E: dict spec pins (sort builder, L2 select-all, filter CTA); ELT card-view spec coverage; regression run | ✅ done | 2026-11-13 | dict spec 4/4 live; **added** missing card-view pin — `elt-view-mode-*` testid + `/crm/customers` spec: zones absent in table → present ×1 in cards → IANA sheet opens `iana-field-onboarding_at` → gone back in table. ELT spec 1/1 |

---

## A. Verified anatomy (research)

### Card view / cards_list — today has THREE bars

`CardViewRenderer.svelte:186-274` mounts its own sticky sub-bar:

```
L1 EntityListToolbar: [SearchBar] | [view | deletion | presets | columns | filters | refresh | | create]
L2 BulkActionsToolbar: [toggle] | [FilterBar | bulk CTAs]
L3 CardViewRenderer sub-bar: [☑ select-all label] | [Sort by <col>▾ <⇅>▾] | [<col> Switch]×N
```

The L3 bar duplicates select-all + sort + **one inline divider+label+Switch per IANA column** — the
unbounded horizontal growth the user flagged.

### Table view — already canonical

select-all in `thead`, sort in column headers, IANA switch **inside its own `th`** (already
bounded — TableHeader.svelte:129+). L2 = BulkActionsToolbar only. **Unchanged.**

### Contracts already on `list` (useEntityList) — all consumers free

- `sortKey` / `sortDir` / `onSortChange(key, dir)` → `sort_key`/`sort_dir` params, page reset
- `searchInKeys` / `onSearchInKeysChange` / `toggleSearchKey` (shared `nextSearchScopeKeys`)
- `filterValues` / `advancedFilters` / `onFilterValuesChange` / `onAdvancedFiltersChange` / `onResetFilters`
- `deletionFilterMode` / `onDeletionFilterModeChange`
- `datetimeIanaModeByKey` is a `$bindable` host map on EntityListTable; `toggleDatetimeIana(col)`
  flips `browser`↔`record` (EntityListTable.svelte:266)

### Sheet registry

`lib/shell/sheets/sheet-manager.svelte.ts`: `SHEET_PANEL_IDS` + `SheetPanelPropsMap`; SheetHost maps
`entity.searchIn|columns|filters` → `lib/entity-list/sheets/panels/*.svelte`. New panel follows the
same path (`entity.datetimeIana` → `DatetimeIanaPanel.svelte`).

### i18n reality check

Only `datetime_iana.hint_browser` / `datetime_iana.hint_record` exist (BE-owned). A CTA label +
panel title need **new keys → db-meta patch** (FE fallback covers `app.*` only).

---

## B. Design decisions (please confirm — anomalies/decisions needing your call)

### 1. Line-1 / Line-2 contract (all view modes)

- **L1** = search left + CTAs right — identical for table/cards/dict. Select-all LEAVES L1
  (dict drops `SelectableToolbar` from L1; cards never had it there).
- **L2** = `BulkActionsToolbar`, now with three OPTIONAL leading zones, rendered
  `SELECT ALL | SORT BUILDER | IANA CTA | [existing toggle | FilterBar|bulk]`:
  - `selectAll?: { checked, indeterminate, onToggle, test_id }` — same checkbox+label anatomy
    CardViewRenderer uses today
  - `sort?: { allColumns, sortableColumns, sortKey, sortDir, onSortChange }` — the extracted
    SortBuilder (two dropdowns, `xs` ghost CTAs)
  - `ianaToggle?: { columns, modeByKey, onToggle, disabled }` — ONE bounded CTA
    (`CalendarClock` icon + label + count) → `openSheet('entity.datetimeIana', …)`
  - All three optional: table view passes none → identical chrome to today.
- Parent decides population: EntityListTable passes them only when `viewMode !== 'table'`;
  dict always passes selectAll+sort, `ianaToggle` only if `datetimeIanaToggleColumns.length > 0`
  (dict rows are FormFieldDispatcher inputs, not IANA display cells → expect zero today; prop
  keeps the contract honest for the future).

### 2. IANA → sheet panel (chosen over dropdown)

Sheet wins because: (a) `entity.*` family already owns per-column checklists
(`entity.columns`, `entity.searchIn`, `entity.filters`) — same user mental model; (b) rows
have room for the `hint_browser`/`hint_record` explanation text; (c) the bar CTA is bounded
deterministically. Table-view per-`th` switch stays untouched (already bounded in its cell).

`DatetimeIanaPanel` rows: `{label} {hint text for current mode} [Switch browser↔record]` —
same semantics as the deleted inline control, just relocated.

### 3. Dict sort ↔ order_field collision — RULE

Dict `displayRows` re-sorts client-side by `order_field` (EntityDictPage:286) because chevron
reorder only makes sense in canonical order. With a user-driven `sortKey`:

- `sortKey == null || sortKey === orderField` → displayRows re-sorts by order_field; chevrons ENABLED
- `sortKey` set to any other column → displayRows = `list.rows` order (BE-sorted); chevrons
  DISABLED (`orderable` prop false + row chevrons hidden/disabled — semantics: you cannot
  reorder a view that is not in canonical order)
- Selecting `orderField` itself in the sort builder returns to canonical order and re-enables.

### 4. Dict filter panel — same sheet as ELT

L1 right cluster gains the Funnel CTA (identical chrome to ELT's filters button), gated
`filterableColumns.length > 0`, wiring identical to `EntityListTableHeader:131-157`
(`openSheet('entity.filters', {filterableColumns, filterValues, onFilterValuesChange,
onResetFilters, advancedFilters, onAdvancedFiltersChange})`, `filtersOpen` local bool synced
with `sheetState` so the CTA reflects panel state). FilterBar in L2 already renders applied
badges — the loop closes: panel applies → badges show → toggle flips to filters mode.

### 5. Dict L2 select-all — SelectableToolbar is dropped from dict

The bar's `selectAll` zone owns the checkbox+label anatomy; `SelectableToolbar` import goes away
(`SelectableFieldset` stays for groups). `dict-toolbar-select-all` testid preserved via
`select_all.test_id` — same `…-select-all` suffix convention the component already uses.

### 6. ELT header plumbing

`EntityListTableHeader` gains `selectAll?`, `sort?`, `ianaToggle?` pass-through props →
`BulkActionsToolbar`. `EntityListTable` populates only when `viewMode !== 'table'`
(cards/cards_list) from existing state: `allOnPageSelected`, `headerIndeterminate`,
`toggleAllOnPage`, `allColumns`, `sortableColumns`, `effectiveSortKey`, `sortDir`,
`onSortChange`, `datetimeIanaToggleColumns`, `datetimeIanaModeByKey`, `toggleDatetimeIana`,
`rowsLoading`.

### 7. CardViewRenderer cleanup (breaking, internal)

Remove its sub-bar block + the now-unneeded props: `toggleAllOnPage`, `allOnPageSelected`,
`headerIndeterminate`, `sortableColumns`, `effectiveSortKey`, `sortDir`, `onSortChange`,
`datetimeIanaToggleColumns`, `toggleDatetimeIana`, `allColumns` (keep what cells still use),
`Checkbox`/`Switch`/`DropdownMenu` imports, `checkboxInteractiveClass`. Callers:
`EntityListTableContent` + `EntityListTable` prop chains simplified to match.

---

## C. File touch list

**FE — new:**
- `src/lib/components/entity-list-table/toolbar/SortBuilder.svelte`
- `src/lib/entity-list/sheets/panels/DatetimeIanaPanel.svelte`

**FE — edited:**
- `toolbar/BulkActionsToolbar.svelte` — `selectAll`/`sort`/`ianaToggle` zones + dividers
- `toolbar/index.ts` — `SortBuilder` export
- `components/EntityListTableHeader.svelte` — prop pass-through
- `EntityListTable.svelte` — viewMode-gated wiring
- `components/CardViewRenderer.svelte` + `EntityListTableContent.svelte` — sub-bar removal
- `shell/sheets/sheet-manager.svelte.ts` + `SheetHost.svelte` — `entity.datetimeIana`
- `entity-dict-page/EntityDictPage.svelte` — L1 (no select-all, +Funnel CTA), L2 (selectAll+sort), filter-sheet wiring
- `e2e/entity-dict-page.spec.ts` — updated pins
- i18n: new keys land via BE patch (`system.entities.list.datetime_iana.cta`,
  `datetime_iana.panel_title`, `datetime_iana.field_hint` if needed)

**BE — new:** `db-meta/patches/<ts>_datetime_iana_panel_keys.sql`

**UI lib:** none (Switch/Button/Sheet atoms already exist).

## D. Verification

- `pnpm run check` (0/0)
- `bun ../primebrick-v3-sdk/tools/check-standards.ts src --profile=fe`
- `pnpm test:e2e src/e2e/entity-dict-page.spec.ts`
- `pnpm test:e2e src/e2e/entity-list-table-interactions.spec.ts src/e2e/job-triggers-deletion-filter.spec.ts src/e2e/elt-filters-parity.spec.ts --workers=1` (sequential — shared-session rule)
- Card-view screenshot check on an ELT page toggled to cards/cards_list (visual: L3 gone, L2 has select-all+sort+IANA CTA)

## E. Open questions — RESOLVED (user, 2026-12-20)

1. **IANA CTA label** = "IANA Fields" / "Campi IANA" → `system.entities.list.datetime_iana.fields_cta` + `.title` (BE patch). Panel mirrors `SearchInPanel` (SheetPanelLayout + icon/title/actions + per-row Switch+hint) — it IS the standardization target.
2. **Dict gets NO sort zone** — `order_field` canonical order has value (chevron reorder); a user sort would corrupt that semantics. Leave a comment for posterity in the consuming toolbar explaining why `sort` is intentionally not passed.
3. **Card views: sort zone always rendered** when `sort` prop present (no count gate — even 1 visible sortable column is meaningful; hidden columns stay sortable and every page has a meta default_sort anyway).
4. **Select-all keeps its label** — checkbox + "Select all/Deselect all" text, same as today.
5. **E2E must verify** the `search_in` CTA actually opens the `entity.searchIn` sheet on dict (NOTA: observed possibly not opening — pin `search-in-{key}` rows in spec).
