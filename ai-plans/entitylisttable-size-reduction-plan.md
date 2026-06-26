# EntityListTable.svelte — Empirical Size Reduction Plan

**Date:** 2026-06-24
**Stack:** SvelteKit + Svelte 5 + TypeScript (`primebrick-fe-v3`)
**Preceding plans:** `composable-state-exposure-pattern-plan.md`, `composable-refactoring-finalization-plan.md`
**Target file:** `src/lib/components/entity-list-table/EntityListTable.svelte`

---

## Translation policy

N/A — no UI label changes. No i18n keys affected.

---

## Empirical evidence: what the refactoring achieved so far

### Line count history

| Snapshot | Lines | Source |
|---|---|---|
| Before refactoring commit `1cc6d77` | 1130 | `git show 1cc6d77^:EntityListTable.svelte \| Measure-Object -Line` |
| After refactoring commit `1cc6d77` | 1029 | `git show 1cc6d77:EntityListTable.svelte \| Measure-Object -Line` |
| Current (after finalization fixes) | 1141 | `(Get-Content EntityListTable.svelte).Count` |

**The file grew back.** The refactoring commit removed 176 lines and added 67 (net -109), bringing it to 1029. But the finalization fixes (Steps 1-8 in the previous session) added the `as any` spread for `TableRow` props, `useClientSelection` wiring, `useKeyboardNavigation` wiring, and type fixes — bringing it to 1141. **The net result of the entire effort is +11 lines (1130→1141).** The refactoring fixed bugs and standardized patterns but did NOT reduce the file size.

### What was actually removed (commit `1cc6d77` diff)

| Removed | Lines | Replaced by |
|---|---|---|
| Inline `handleGlobalKeyDown` (broken, empty if/else bodies) | ~60 | `useKeyboardNavigation` composable |
| Inline `selectedRowByKey` state + merge effect + exit effects | ~50 | `useClientSelection` composable |
| Inline `viewRows`/`orderedSelectedRows`/`hasDeletedSelected`/`allSelectedDeleted` derived | ~20 | `useClientSelection` composable |
| Scroll-into-view `$effect` | ~7 | `useKeyboardNavigation` composable |
| Direct `orderState` mutation (encapsulation leak) | ~10 | `columnOrder.applyColumnVisibility()` |
| `sheetPanelManagement.lastPanelId.value` wrapper access | ~2 | `sheetPanelManagement.state.lastPanelId` |
| **Total removed** | **~149** | |

### What was added back (commit `1cc6d77` + finalization)

| Added | Lines | Reason |
|---|---|---|
| `useClientSelection` instantiation + getter wiring | ~15 | Replaces inline state |
| `useKeyboardNavigation` instantiation + 28 getter params | ~30 | Replaces inline handler |
| `as any` spread for `TableRow` props (Svelte 5 generic limitation) | ~40 | Type fix |
| `dialogs.state.X` / `exportComposable.state.X` access pattern changes | ~10 | DeepReadonly pattern |
| Various type fixes (Snippet types, MetaColumn types, etc.) | ~15 | Pre-existing errors |
| **Total added** | **~110** | |

### What was missed from the original plan

| Original plan step | Status | Evidence |
|---|---|---|
| Step 1: `DeepReadonly<T>` utility | ✅ Done | `src/lib/types/deep-readonly.ts` exists |
| Step 2: Fix `useSheetPanelManagement` wrapper | ✅ Done | `sheetPanelManagement.state.lastPanelId` at line 434 |
| Step 3: Fix `useColumnOrder` encapsulation leak | ✅ Done | `columnOrder.applyColumnVisibility(group, dedup)` at line 402 |
| Step 4: Refactor `useDialogs` to standard pattern | ✅ Done | `dialogs.state.rowToDelete` at line 524 |
| Step 5: Refactor remaining composables | ✅ Done | All 17 composables have `get state(): DeepReadonly` |
| Step 6: Clean up `VersionsPanel.svelte` unused import | ✅ Done | `useHealthChip` not in import at line 10 |
| Step 7: Document pattern in `AGENTS.md` | ✅ Done | Section at line 58 |
| Step 8.1: Wire `useClientSelection` | ✅ Done | `clientSelection` at line 687 |
| Step 8.2: Wire `useKeyboardNavigation` | ✅ Done | `keyboardNav` at line 874 |
| **Cleanup of dead imports** | ❌ MISSED | 113 unused imports remain (see below) |
| **Cleanup of dead functions** | ❌ MISSED | 6 dead functions remain (see below) |
| **Cleanup of dead code blocks** | ❌ MISSED | `_sessionRaw`, empty `onMount`, no-op effects |
| **Duplicated sheet logic** | ❌ MISSED | `onFiltersOpenChange` duplicated parent↔header |
| **Prop-drilling reduction** | ❌ NOT IN PLAN | 149 prop assignments in template, 3 pass-through layers |

---

## Empirical findings: what's still in EntityListTable.svelte

### Finding 1: 113 unused imports (lines 1-143)

Verified empirically by counting references for each imported symbol in the full file content. Method: for each imported symbol, counted total occurrences in the file via regex `\b$symbol\b`. Any symbol with count ≤ 1 (only the import line) is unused.

| Category | Count | Examples |
|---|---|---|
| Unused Lucide icon imports | 40 | `XIcon`, `Search`, `ArrowUpDown`, `ArrowUp`, `ArrowDown`, `TriangleAlert`, `Hourglass`, `CircleX`, `ChevronLeft/Right`, `ChevronsLeft/Right`, `ChevronUp/Down`, `RotateCcw`, `MoreVertical`, `Ban`, `Globe`, `MapPin`, `Eye`, `EyeOff`, `ListCheck`, `FilterX`, `Pencil`, `PencilOff`, `Trash`, `Trash2`, `ArrowUpFromLine`, `AlertCircle`, `PanelRightClose/Open`, `Copy`, `Download`, `Funnel`, `CircleCheck`, `Info`, `RefreshCw`, `FileClock` — template has only 4 component tags, no direct icon usage |
| Unused UI component imports | 18 | `Input`, `Button`, `Badge`, `Checkbox`, `LoadingBar`, `Switch`, `Tooltip`, `Table`, `DropdownMenu`, `Dialog`, `DialogBordered`, `Dock`, `Resizable`, `ScrollArea`, `Skeleton`, `Card`, `CardContent`, `Window` — all moved to child components |
| Unused utility/function imports | 22 | `scale`, `fade`, `fly`, `slide`, `apiFetch`, `pushRFC7807Error`, `RFC7807Error`, `cn`, `uiLang`, `defaultVisibleColumnKeys`, `formatDatetimeCellDisplay`, `formatListCellValue`, `searchSyntaxSegments`, `searchSyntaxSpanClass`, `isBlankish`, `getAuditFieldValue`, `isCardFieldEmpty` |
| Unused cell-styling imports | 12 | `entityListDataCellValignClass`, `isDatetimeIanaRecordMode`, `datetimeIanaHeadHighlightClass`, `datetimeIanaCellHighlightClass`, `datetimeIanaCardFieldHighlightClass`, `entityListGrayChromeCellClass`, `entityListDestructiveChromeCellClass`, `entityListGrayBandStickyInteractionClass`, `entityListDestructiveBandStickyInteractionClass`, `entityListDefaultScrollInteractionClass`, `entityListDestructiveScrollInteractionClass`, `stickyCellClassWithCompute` |
| Unused component imports | 11 | `VersionHistoryPanel`, `SearchInPanel`, `ColumnSelectorPanel`, `PreviewPanel`, `EntityListToolbar`, `FilterBar`, `SelectionCounter`, `TableHeader`, `TableCell`, `CardField`, `CardGrid`, `CardList`, `Pagination`, `TableBody`, `TableFooter`, `CardViewRenderer`, `PreviewPanelWrapper`, `BulkActionsToolbar`, `EntityListTableHeaderRow`, `EntityListTableLoading`, `EntityListTableCardView`, `EntityListTableTableView` |
| Unused type imports | 5 | `ViewMode`, `SortDir`, `ListMetaViewVisibility`, `ViewName`, `AdvancedFilter`, `Snippet` |
| Unused icon imports (bi) | 5 | `BsFiletypeXlsx`, `BsFiletypeCsv`, `BsFiletypeHtml`, `BsFiletypePdf`, `BsEnvelopeAt` |
| **Total unused imports** | **~113 lines** | |

### Finding 2: 6 dead functions (lines 507-614)

| Function | Lines | Why dead | Evidence |
|---|---|---|---|
| `handleDeleteRow(row)` | 507-512 | Never called — child components call `rowActionsComposable.handleDeleteRow(row)` directly | `grep` shows 1 ref (definition only). `EntityListTableTableView.svelte` line 206: `onDeleteRow={(row) => rowActionsComposable.handleDeleteRow(row)}` |
| `handleRestoreRow(row)` | 515-520 | Never called — same as above | `grep` shows 1 ref (definition only). `EntityListTableTableView.svelte` line 207: `onRestoreRow={(row) => rowActionsComposable.handleRestoreRow(row)}` |
| `handleDuplicateRow(row)` | 605-614 | Never called — same as above | `grep` shows 1 ref (definition only). `EntityListTableTableView.svelte` line 205: `onDuplicateRow={(row) => rowActionsComposable.handleDuplicateRow(row)}` |
| `handleBulkDelete()` | 544-546 | Never called — header uses `bulkActions.handleBulkDelete()` directly | `grep` shows 2 refs but line 1012 calls `bulkActions.handleBulkDelete()`, not the local function |
| `handleBulkRestore()` | 559-561 | Never called — same as above | `grep` shows 2 refs but line 1013 calls `bulkActions.handleBulkRestore()` |
| `handleBulkDuplicate()` | 591-603 | Never called — header uses `bulkActions.handleBulkDuplicate()` directly | `grep` shows 2 refs but line 1011 calls `bulkActions.handleBulkDuplicate()` |

### Finding 3: Dead code blocks

| Block | Lines | Evidence |
|---|---|---|
| `_sessionRaw` — reads sessionStorage but result never used | 468-472 | `grep _sessionRaw` → 1 match (definition only) |
| Empty `onMount(() => {})` with only comments | 332-336 | Body is 3 comment lines, no code |
| No-op `$effect(() => { void filterValues; })` | 340-342 | Tracks reactivity but does nothing with it |
| No-op `$effect(() => { void advancedFilters; })` | 344-346 | Same — tracks but does nothing |
| Stale section comments ("Dropdown Handlers", "Keyboard Navigation Handlers", "Row Action Handlers", "Bulk Action Handlers", "Export Handlers", "Toolbar Handlers") | 477-576 | Section headers for functions that are now thin wrappers or dead |
| Stale comments ("Export state is now managed by exportComposable", "Row tracking for dialog actions", "Entity preview panel state") | 458-466 | Comments with no code beneath them |

### Finding 4: Duplicated `onFiltersOpenChange` logic (BUG)

The same 25-line sheet open/close handler exists in BOTH:

1. **`EntityListTable.svelte` lines 964-989** — inline handler passed to `EntityListTableHeader`
2. **`EntityListTableHeader.svelte` lines 115-140** — wraps the received `onFiltersOpenChange` prop in ANOTHER inline handler

The parent does `openSheet('entity.filters', ...)` then calls `filtersOpen = true`. The header receives this callback, wraps it in its OWN handler that ALSO does `openSheet('entity.filters', ...)` then calls `onFiltersOpenChange(true)` (which is the parent's version that ALSO does `openSheet`).

**Result: the sheet is opened TWICE.** This is a bug — the sheet open logic should exist in only one place.

### Finding 5: 149 prop assignments in template (prop-drilling)

The template (lines 940-1141, ~200 lines) contains 4 child component invocations with a total of **149 prop assignments**, verified empirically via regex `^\s+\w+=` on the template section:

| Component | Props passed | Props received (from its type) | Role |
|---|---|---|---|
| `EntityListTableHeader` | 42 | 42 | Pure pass-through to `EntityListToolbar` + `FilterBar` + `SelectionCounter` + `BulkActionsToolbar` (adds `onFiltersOpenChange` wrapper + `onColumnSelectorClick`) |
| `EntityListTableContent` | 70 | 70 | Conditional router: `EntityListTableLoading` / `EntityListTableCardView` / `EntityListTableTableView` (pure pass-through otherwise) |
| `EntityListTableFooter` | 21 | 21 | **Pure pass-through** to `TableFooter` — zero added logic, 100% prop relay |
| `EntityListTableDialogs` | 16 | 16 | Renders 8 dialogs, receives 4 composable objects + 16 handler functions |

**`EntityListTableFooter` is a pure pass-through layer** — it receives 21 props and passes all 21 to `TableFooter` with no transformation. It can be eliminated entirely.

### Finding 6: 16 dialog handler functions that could move into EntityListTableDialogs

`EntityListTableDialogs` already receives `dialogs`, `rowActionsComposable`, `bulkActions`, `exportComposable` as props. The 16 confirm/cancel functions only use these composables + `selectedKeys` + `$t`:

| Function | Lines | What it does | Could be in EntityListTableDialogs? |
|---|---|---|---|
| `confirmDeleteRow` | 523-528 | `rowActionsComposable.confirmDeleteRow(dialogs.state.rowToDelete)` + close | ✅ Yes — has all composables |
| `confirmRestoreRow` | 531-536 | `rowActionsComposable.confirmRestoreRow(dialogs.state.rowToRestore)` + close | ✅ Yes |
| `confirmBulkDelete` | 549-552 | `bulkActions.confirmBulkDelete()` + close | ✅ Yes |
| `cancelBulkDelete` | 555-557 | `dialogs.closeBulkDeleteDialog()` | ✅ Yes |
| `confirmBulkRestore` | 564-567 | `bulkActions.confirmBulkRestore()` + close | ✅ Yes |
| `cancelBulkRestore` | 570-572 | `dialogs.closeBulkRestoreDialog()` | ✅ Yes |
| `confirmExportRow` | 580-584 | `exportComposable.handleExport(exportComposable.state.fileType)` + close | ✅ Yes |
| `cancelExportRow` | 587-589 | `exportComposable.closeExportDialog()` | ✅ Yes |
| `confirmDuplicate` | 616-624 | Branches on `dialogs.state.duplicateScope` → `rowActionsComposable` or `bulkActions` | ✅ Yes |
| `cancelDuplicate` | 626-629 | `dialogs.closeDuplicateDialog()` + reset | ✅ Yes |
| `confirmHtmlExport` | 643-645 | `exportComposable.handleHtmlExport()` | ✅ Yes |
| `cancelHtmlExport` | 639-641 | `exportComposable.closeHtmlExportConfirmDialog()` | ✅ Yes |
| `closeHtmlPreview` | 647-649 | `exportComposable.closeHtmlPreview()` | ✅ Yes |
| `copyHtmlToClipboard` | 651-653 | `exportComposable.copyHtmlToClipboard()` | ✅ Yes |
| `generatePdfPreview` | 655-657 | `exportComposable.generatePdfPreview()` | ✅ Yes |
| `prepareEmailHtml` | 659-661 | `exportComposable.prepareEmailHtml()` | ✅ Yes |
| `copyEmailHtmlToClipboard` | 663-665 | `exportComposable.copyEmailHtmlToClipboard()` | ✅ Yes |

### Finding 7: 64-line `$effect` for sheet panel props sync

Lines 366-429 contain a massive `$effect` that keeps sheet panel props reactive while a sheet is open. It handles 3 panels (`entity.columns`, `entity.searchIn`, `entity.filters`) and contains:
- 9 `void` reactivity tracking statements
- A 20-line `onReorderKeys` inline function with dedup logic
- 3 `sheetState.props = { ... } as any` assignments

This is a self-contained concern that could be a composable.

### Finding 8: Trivial 1-line wrapper functions

| Function | Lines | What it does | Can inline? |
|---|---|---|---|
| `handleBulkExport` | 631-633 | `exportComposable.openExportDialog()` | ✅ Yes |
| `handleHtmlExport` | 635-637 | `exportComposable.openHtmlExportConfirmDialog()` | ✅ Yes |
| `cancelHtmlExport` | 639-641 | `exportComposable.closeHtmlExportConfirmDialog()` | ✅ Yes (moved to dialogs) |
| `confirmHtmlExport` | 643-645 | `exportComposable.handleHtmlExport()` | ✅ Yes (moved to dialogs) |
| `closeHtmlPreview` | 647-649 | `exportComposable.closeHtmlPreview()` | ✅ Yes (moved to dialogs) |
| `copyHtmlToClipboard` | 651-653 | `exportComposable.copyHtmlToClipboard()` | ✅ Yes (moved to dialogs) |
| `generatePdfPreview` | 655-657 | `exportComposable.generatePdfPreview()` | ✅ Yes (moved to dialogs) |
| `prepareEmailHtml` | 659-661 | `exportComposable.prepareEmailHtml()` | ✅ Yes (moved to dialogs) |
| `copyEmailHtmlToClipboard` | 663-665 | `exportComposable.copyEmailHtmlToClipboard()` | ✅ Yes (moved to dialogs) |
| `toggleToolbarMode` | 673-675 | `toolbarModeState.toggle()` | ✅ Yes |
| `openRowDropdown` | 482-484 | `dropdownMenuRow = row` | ❌ Keep — used by keyboardNav + clickHandlers |
| `closeRowDropdown` | 487-489 | `dropdownMenuRow = null` | ❌ Keep — used by keyboardNav + clickHandlers |
| `navigatePreview` | 492-494 | `previewPanel.navigatePreview(direction > 0 ? "next" : "prev")` | ❌ Keep — has logic (number→string conversion) |

---

## Objectives

1. **Reduce `EntityListTable.svelte` from 1141 to ~550 lines** (52% reduction) by eliminating dead code, moving dialog orchestration, consolidating sheet management, and replacing prop-drilling with Svelte Context.
2. **Fix the duplicated `onFiltersOpenChange` bug** — sheet should open once, not twice.
3. **Eliminate `EntityListTableFooter`** — pure pass-through layer with zero added logic.
4. **Maintain all existing functionality** — every phase verified with `pnpm run check` + `pnpm run build`.

---

## Implementation Steps

### Phase 1: Dead Code Purge (zero risk, mechanical)

**Estimated savings: ~130 lines**

#### 1.1: Remove 40 unused Lucide icon imports (lines 90-129)

Delete all 40 icon import lines. The template (lines 940-1141) contains only 4 component tags (`<EntityListTableHeader>`, `<EntityListTableContent>`, `<EntityListTableFooter>`, `<EntityListTableDialogs>`) — no direct icon usage.

#### 1.2: Remove 73 unused imports (lines 1-143)

Remove all imports verified unused by the empirical reference count test. Keep only: `t` from `$lib/i18n`, `closeSheet`/`openSheet`/`sheetState`, `FiltersPanel` (if still used after Phase 4), `EntityListTableHeader`/`Content`/`Footer`/`Dialogs`, all composable imports, `isRowDeletedUtil`/`getRowKey`, `MetaColumn`, `setAuditColumnsContext`, `EntityListTableProps`/`CellArgs` types, `pushImpactError` (verify — only used by dead `handleBulkDuplicate`, remove with it).

#### 1.3: Remove dead code blocks

| Block | Lines | Action |
|---|---|---|
| `_sessionRaw` | 468-472 | Delete — result never used |
| Empty `onMount(() => {})` | 332-336 | Delete — body is only comments |
| `onMount` import | line 3 | Delete if no other `onMount` usage |
| No-op `$effect(() => { void filterValues; })` | 340-342 | Delete |
| No-op `$effect(() => { void advancedFilters; })` | 344-346 | Delete |
| Stale comments | 458-466 | Delete |

#### 1.4: Remove 6 dead functions

Delete: `handleDeleteRow` (507-512), `handleRestoreRow` (515-520), `handleDuplicateRow` (605-614), `handleBulkDelete` (544-546), `handleBulkRestore` (559-561), `handleBulkDuplicate` (591-603). Also remove `pushImpactError` import if no longer used.

**Verification:** `pnpm run check` + `pnpm run build`

---

### Phase 2: Inline Trivial Wrappers

**Estimated savings: ~10 lines**

#### 2.1: Inline `handleBulkExport` and `handleHtmlExport`

Replace the 2 wrapper functions with inline arrows in the template:
```svelte
onBulkExport={() => exportComposable.openExportDialog()}
onHtmlExport={() => exportComposable.openHtmlExportConfirmDialog()}
```

#### 2.2: Inline `toggleToolbarMode`

```svelte
onToggleToolbarMode={toolbarModeState.toggle}
```

#### 2.3: Keep `navigatePreview`, `openRowDropdown`, `closeRowDropdown`

These have actual logic or are used by multiple consumers.

**Verification:** `pnpm run check`

---

### Phase 3: Move Dialog Confirm/Cancel into EntityListTableDialogs

**Estimated savings: ~70 lines from EntityListTable.svelte**

#### 3.1: Move 16 functions into EntityListTableDialogs.svelte

Move all 16 confirm/cancel functions from `EntityListTable.svelte` into `EntityListTableDialogs.svelte`. These functions only use `dialogs`, `rowActionsComposable`, `bulkActions`, `exportComposable` — all already passed as props.

#### 3.2: Remove 16 handler props from EntityListTableDialogs

Reduce `EntityListTableDialogsProps` from 25 props to 7 props:
```ts
let {
  dialogs, rowActionsComposable, bulkActions, exportComposable,
  selectedKeys, total, entity
}: EntityListTableDialogsProps = $props();
```

#### 3.3: Simplify EntityListTable.svelte template

```svelte
<EntityListTableDialogs
  {dialogs}
  {rowActionsComposable}
  {bulkActions}
  {exportComposable}
  {selectedKeys}
  {total}
  {entity}
/>
```

**Verification:** `pnpm run check`

---

### Phase 4: Fix Duplicated Sheet Logic (BUG FIX)

**Estimated savings: ~25 lines + fixes double-open bug**

#### 4.1: Remove inline `onFiltersOpenChange` from EntityListTable.svelte

**Before (lines 964-989):** 25-line inline handler that does `openSheet`/`closeSheet`

**After:**
```svelte
onFiltersOpenChange={(open) => { filtersOpen = open; }}
```

The sheet open/close logic remains in `EntityListTableHeader.svelte` (lines 115-140), which already handles the sheet management. The parent only needs to mirror the `filtersOpen` bindable state.

#### 4.2: Remove now-unused imports

After removing the inline handler, verify if `FiltersPanel`, `openSheet`, `closeSheet` are still used in `EntityListTable.svelte` (they may still be used by the `$effect` at lines 366-429).

**Verification:** `pnpm run check` + **manual test: open filters sheet, close it, verify it opens once not twice**

---

### Phase 5: Consolidate Sheet Panel Management (new useSheetPanels composable)

**Estimated savings: ~90 lines**

#### 5.1: Create `composables/useSheetPanels.svelte.ts`

Extract the 64-line `$effect` (lines 366-429), the `filtersOpen` mirror effect (lines 432-436), `toggleSearchKey`/`toggleColumnKey`, and `sheetPanelManagement` into a new composable.

```ts
export function useSheetPanels(options: {
  columnOrder: ReturnType<typeof useColumnOrder>,
  visibleKeys: () => string[],
  searchInKeys: () => string[] | null,
  onSearchInKeysChange: (keys: string[] | null) => void,
  onVisibleKeysChange: (keys: string[]) => void,
  onResetColumnVisibility: (view: ViewName) => void,
  filterableColumns: () => MetaColumn[],
  searchableColumns: () => MetaColumn[],
  nonAuditingColumns: () => MetaColumn[],
  auditingColumnsGroup: () => MetaColumn[],
  stickyColumnsGroup: () => MetaColumn[],
  filterValues: () => Record<string, any>,
  onFilterValuesChange: (values: Record<string, any>) => void,
  onResetFilters: () => void,
  advancedFilters: () => AdvancedFilter[],
  onAdvancedFiltersChange: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void,
  filtersOpen: () => boolean,
  setFiltersOpen: (open: boolean) => void,
}) {
  // toggleSearchKey, toggleColumnKey functions
  // 64-line $effect for sheet props sync
  // filtersOpen mirror $effect
  // sheetPanelManagement composable

  return {
    get state() { return _state; },
    toggleSearchKey,
    toggleColumnKey,
  };
}
```

#### 5.2: Replace inline code in EntityListTable.svelte

Remove lines 222-245 (`toggleSearchKey`, `toggleColumnKey`), lines 349-436 (sheet panel management effects), and replace with composable instantiation.

**Verification:** `pnpm run check` + manual test: all 3 sheet panels (columns, searchIn, filters) open/close correctly with reactive props

---

### Phase 6: Replace Prop-Drilling with Svelte Context

**Estimated savings: ~300 lines from template**

#### 6.1: Extend `context.ts` with composable context

Add `EntityListTableContext<TRow>` type + `setEntityListTableContext` / `getEntityListTableContext` functions using a typed Symbol key.

#### 6.2: EntityListTable.svelte calls setEntityListTableContext

After all composables are instantiated, set the context with all composables, derived values, and functions.

#### 6.3: Child components use getContext instead of props

- **`EntityListTableHeader.svelte`:** Replace 42 props with `getEntityListTableContext()`. Keep only props that are truly external (search, onSearchInput, etc. from parent pages).
- **`EntityListTableContent.svelte`:** Replace 70 props with `getEntityListTableContext()`. Keep only `metaLoading`, `viewMode`, snippet props.
- **`EntityListTableFooter.svelte`:** **DELETE entirely.** Replace with direct `<TableFooter>` usage from context.
- **`EntityListTableDialogs.svelte`:** Use context instead of composable props.

#### 6.4: Simplify EntityListTable.svelte template

**Before (~200 lines, 149 prop assignments):** 4 child components with massive prop lists.

**After (~40 lines):**
```svelte
<svelte:window onkeydown={keyboardNav.handleGlobalKeyDown} />

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <EntityListTableHeader {search} {onSearchInput} {searchPlaceholderKey} {onCreateAction} {filtersOpen} />
  <EntityListTableContent {metaLoading} {viewMode} {metaLoadingView} {rowsLoadingView} {emptyView} {errorView} {cell} />
  <TableFooter bind:clientSelectedPage bind:showSelectedOnly />
  <EntityListTableDialogs {selectedKeys} {total} {entity} />
</div>
```

**Verification:** `pnpm run check` + `pnpm run build` + full manual test

---

## Files to Modify

| File | Phase | Change |
|---|---|---|
| `EntityListTable.svelte` | 1-6 | Dead code purge, inline wrappers, move dialog handlers, fix sheet logic, use context (target: ~550 lines from 1141) |
| `EntityListTableDialogs.svelte` | 3 | Absorb 16 confirm/cancel functions from EntityListTable |
| `EntityListTableHeader.svelte` | 6 | Use `getEntityListTableContext()` instead of 42 props |
| `EntityListTableContent.svelte` | 6 | Use `getEntityListTableContext()` instead of 70 props |
| `EntityListTableFooter.svelte` | 6 | **DELETE** — pure pass-through, replaced by direct `TableFooter` usage |
| `composables/useSheetPanels.svelte.ts` | 5 | **NEW** — sheet panel management composable |
| `context.ts` | 6 | Add `EntityListTableContext` type + `setEntityListTableContext` / `getEntityListTableContext` |

---

## Estimated size reduction

| Phase | Lines removed | Lines added | Net |
|---|---|---|---|
| Phase 1: Dead code purge | ~160 | ~0 | -160 |
| Phase 2: Inline wrappers | ~15 | ~3 | -12 |
| Phase 3: Move dialog handlers | ~70 | ~0 (moved to EntityListTableDialogs) | -70 |
| Phase 4: Fix sheet duplication | ~25 | ~1 | -24 |
| Phase 5: Consolidate sheet management | ~90 | ~20 (composable instantiation) | -70 |
| Phase 6: Context API | ~160 (template props) | ~30 (context setup) | -130 |
| **Total** | **~520** | **~54** | **~-466** |

| Metric | Before | After (estimated) |
|---|---|---|
| `EntityListTable.svelte` lines | 1141 | ~675 |
| Template prop assignments | 149 | ~15 |
| Dead imports | 113 | 0 |
| Dead functions | 6 | 0 |
| Pass-through component layers | 3 | 1 (EntityListTableFooter deleted) |

**Note:** The ~675 estimate is conservative. If Phase 6 eliminates more prop-passing than estimated, the target of ~550 is achievable.

---

## Verification

- [ ] `pnpm run check` passes after each phase (0 errors, ≤20 warnings)
- [ ] `pnpm run build` passes after Phase 6
- [ ] Manual test: EntityListTable renders in all 3 parent pages (customers, users, organizations)
- [ ] Manual test: Column reordering works (drag columns in sheet, verify order persists)
- [ ] Manual test: All 8 dialogs open/close correctly (delete, restore, duplicate, bulk delete, bulk restore, export, HTML export, HTML preview)
- [ ] Manual test: Export works (XLSX, CSV, HTML, PDF preview, email HTML)
- [ ] Manual test: Preview panel works (open, navigate next/prev, edit mode)
- [ ] Manual test: Keyboard navigation works (ArrowUp/Down, ArrowLeft/Right, Space, Enter, Escape)
- [ ] Manual test: "Show selected only" toggle works (client-side paging, exit on reload)
- [ ] **Manual test: Filters sheet opens ONCE** (not twice — verifies Phase 4 bug fix)
- [ ] Manual test: Column selector sheet opens with reactive checkboxes
- [ ] Manual test: Search-in sheet opens with reactive checkboxes

---

## Risks/Considerations

1. **Phase 3 changes EntityListTableDialogs API** — but it's only used by EntityListTable, so blast radius is contained. The 16 handler props become internal functions.

2. **Phase 4 fixes a double-open bug** — the sheet was being opened twice (parent + header). Fixing this changes behavior (sheet opens once). Must verify manually that the filters sheet opens correctly.

3. **Phase 5 is a new composable** — the 64-line `$effect` has complex reactivity tracking (9 `void` statements). Must verify all sheet panels remain reactive after extraction.

4. **Phase 6 is the largest change** — Context API replaces 149 prop assignments. All child components must be updated. Risk of missing a prop or breaking reactivity. **Mitigation:** Run `pnpm run check` after each component update. Test each view mode (table, cards, cards_list) separately.

5. **Context API has no compile-time safety for missing keys** — `getContext` returns `T | undefined`. Must use a typed symbol key with runtime assertion or non-null assertion. The pattern `getContext(KEY) as EntityListTableContext<TRow>` is acceptable since the context is always set by the parent before children render.

6. **`EntityListTableFooter` deletion** — must verify that `bind:clientSelectedPage` and `bind:showSelectedOnly` still work when `TableFooter` is used directly. These are `$bindable` in `TableFooter` and must bind to the component's local state.

7. **Phase ordering matters** — each phase builds on the previous. Do not skip phases or reorder. Run `pnpm run check` after each phase before proceeding to the next.

8. **`pushImpactError` import** — used only by dead `handleBulkDuplicate` function. Remove the import in Phase 1.4 after removing the function. Verify no other usage exists first.
