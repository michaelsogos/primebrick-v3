# Composable State Exposure Refactoring — Finalization Plan

**Date:** 2026-06-24
**Stack:** SvelteKit + Svelte 5 + TypeScript (`primebrick-fe-v3`)
**Branch:** `feature/various-fixes-on-users-pages`
**Refactoring commit:** `1cc6d77` — "Standardize composable state exposure pattern with DeepReadonly"
**Preceding plan:** `composable-state-exposure-pattern-plan.md`

---

## Translation policy

N/A — no UI label changes. No i18n keys affected.

---

## Empirical evidence summary (this session)

All findings below were verified empirically by running `pnpm run check`, `pnpm run build`, reading source files, and checking `git show 1cc6d77` diffs.

### Evidence 1: The refactoring commit exists and is applied

| Fact | Source |
|---|---|
| Commit `1cc6d77` on branch `feature/various-fixes-on-users-pages`, working tree clean | `git log`, `git status` |
| 34 files changed, 777 insertions, 975 deletions | `git show --stat 1cc6d77` |
| `DeepReadonly<T>` utility exists at `src/lib/types/deep-readonly.ts` (14 lines) | `read` tool |
| All 17 composables with `$state` have `get state(): DeepReadonly<typeof _state>` | `grep` for `get state(): DeepReadonly` — 17 files match |
| `useFilterPersistence` has no `$state` (only `$derived` + pure functions) — correctly has no `get state()` | `read` tool |
| `useKeyboardNavigation` has no `$state` (delegates to `previewPanel`) — correctly has no `get state()` | `read` tool |

### Evidence 2: `pnpm run check` — 29 errors, 27 warnings

| Category | Count | Source |
|---|---|---|
| **NEW errors from refactoring** | **1** | `TableBody.svelte:215` — see Evidence 3 |
| Pre-existing errors (files NOT touched by refactoring) | 28 | See Evidence 4 |
| `state_referenced_locally` warnings | ~20 | `EntityListTable.svelte` lines 248-926 — see Evidence 5 |
| Other warnings | ~7 | `color-picker.svelte`, etc. — pre-existing |

### Evidence 3: The ONE new type error introduced by the refactoring

**File:** `src/lib/components/entity-list-table/components/TableBody.svelte:215`

```
Error: Property 'onRowRangeMouseDown' does not exist on type
'{ state: { rowRangeMouseDown: boolean; rangeDragActive: boolean; }; }'. (ts)
```

**Root cause:** The refactoring changed the `rowRangeSelection` prop type from:
```ts
rowRangeSelection: {
  rowRangeMouseDown: boolean;
  rangeDragActive: boolean;
};
```
to:
```ts
rowRangeSelection: {
  state: { rowRangeMouseDown: boolean; rangeDragActive: boolean };
};
```

But line 215 still calls `rowRangeSelection.onRowRangeMouseDown(index, e)` — the `onRowRangeMouseDown` method was never added to the narrowed type. The same pattern is repeated in `EntityListTableTableView.svelte:196`.

**Verification that this is the only new error:** `git show 1cc6d77 --stat` confirms the refactoring did NOT touch `EntityListTableFooter.svelte`, `EntityListTableCardView.svelte`, `EntityListTableTableView.svelte`, `EntityListTableHeader.svelte`, `EntityListTableLoading.svelte`, `template-interpolate.ts`, `wheel-picker-group.svelte`, or `command-input.svelte` — all errors in those files are pre-existing.

### Evidence 4: Pre-existing errors (28, NOT from refactoring)

| File | Errors | Root cause | Touched by refactoring? |
|---|---|---|---|
| `template-interpolate.ts:8` | 3 | `.replace()` callback params are implicitly `any`; `reduce<unknown>` on untyped function call | ❌ No |
| `wheel-picker-group.svelte:106,260` | 2 | `snapTimeout` declared as `ReturnType<typeof setTimeout>` (not `| undefined`) but used in `clearTimeout` before assignment | ❌ No |
| `command-input.svelte:27` | 1 | `ref = $bindable(null)` typed as `HTMLElement \| null` but `InputGroup.Input` expects `HTMLInputElement \| null \| undefined` | ❌ No |
| `TableBody.svelte:210-225` (excl. 215) | ~12 | TRow generic variance — `TRow extends Record<string, unknown>` but Svelte's prop passing infers `Record<string, unknown>` at the call site, which is not assignable to the generic `TRow` | Partial (only type def changed, not the TRow generics) |
| `EntityListTableHeader.svelte:162` | 1 | `filterValues?: Record<string, any>` (optional) passed to `BulkActionsToolbar` which expects `Record<string, unknown>` (required) | ❌ No |
| `EntityListTableFooter.svelte:60,68` | 2 | `$bindable()` without type defaults to `T \| undefined`, but `TableFooter` expects `number` / `boolean` (required) | ❌ No |
| `EntityListTableLoading.svelte:19` | 1 | `metaLoadingView?: (() => void) \| null` but `{@render metaLoadingView()}` expects `Snippet` | ❌ No |
| `EntityListTableCardView.svelte:119,121,124` | 3 | `errorView`/`rowsLoadingView`/`emptyView` typed as `(() => void) \| null` but `CardViewRenderer` expects `Snippet \| undefined` | ❌ No |
| `EntityListTableCardView.svelte:135` | 1 | `onSortChange: (key: string, dir)` but `CardViewRenderer` expects `(key: string \| null, dir)` | ❌ No |
| `EntityListTableTableView.svelte:166,168,174` | 3 | Same Snippet type mismatches as CardView | ❌ No |
| `EntityListTableTableView.svelte:229` | 1 | `columns: any[] \| undefined` passed to `PreviewPanelWrapper` which expects `MetaColumn[]` (required) | ❌ No |

### Evidence 5: `state_referenced_locally` warnings — CONFIRMED reactivity bugs

**File:** `EntityListTable.svelte` — ~20 warnings at lines 248, 317, 323-326, 878, 892, 904-916, 924-926

**Investigation of `createSortingHandlers` (`handlers/sorting.ts`):**

```ts
// Line 9: rowsLoading: boolean  — captured at init time
// Line 12: dataColumns: any     — captured at init time
// Line 13: auditingColumnsGroup: any — captured at init time
// Line 14: nonAuditingColumns: any   — captured at init time

// Line 44: function handleSortClick(col: MetaColumn) {
//   if (rowsLoading) return;  // ← STALE: uses init-time value, not current
// ...

// Line 32-41: function reorderGroup(...) {
//   columnOrder.reorderGroup(group, fromKey, toKey,
//     dataColumns,         // ← STALE: uses init-time value
//     auditingColumnsGroup, // ← STALE
//     nonAuditingColumns    // ← STALE
//   );
// }
```

**CONFIRMED BUG:** `handleSortClick` checks `rowsLoading` to prevent sorting while loading — but it uses the value captured at component initialization. If `rowsLoading` changes from `false` → `true` (e.g., during a data refresh), the handler won't know. Conversely, if it starts `true` and becomes `false`, the handler will forever block sorting.

**CONFIRMED BUG:** `reorderGroup` passes `dataColumns`/`auditingColumnsGroup`/`nonAuditingColumns` to `columnOrder.reorderGroup()`. If columns load asynchronously (metadata loads after component init), the handler will pass `undefined`/stale arrays.

**Investigation of `createClickHandlers` (`handlers/click-handlers.ts`):**

```ts
// Line 4: rowSelectionEnabled: boolean — captured at init time
// Line 5: rowsLoading: boolean         — captured at init time
// Line 6: error: string | null         — captured at init time

// Line 19: function onEntityRowClick(key: string, e: MouseEvent) {
//   if (!rowSelectionEnabled || rowsLoading || error) return;  // ← ALL STALE
// ...

// Line 38: function onEntityCardClick(key: string, e: MouseEvent) {
//   if (!rowSelectionEnabled || rowsLoading || error) return;  // ← ALL STALE
// }
```

**CONFIRMED BUG:** Both click handlers check `rowSelectionEnabled`, `rowsLoading`, and `error` — all captured at init time. If `rowsLoading` transitions from `true` → `false` after data loads, the click handlers will forever block row clicks (returning early because the init-time `rowsLoading` was `true`).

**Safe warnings (not bugs):**
- Lines 248, 317, 323-326: Storage keys and UID passed to composables — these never change at runtime. Safe.
- Lines 878, 892: Callback functions (`onSelectedKeysChange`, `onPageChange`) — callbacks don't need reactivity. Safe.

### Evidence 6: `as TRow` type-safety holes

**File:** `EntityListTable.svelte` — 3 locations (lines 525, 533, 618)

```ts
await rowActionsComposable.confirmDeleteRow(dialogs.state.rowToDelete as TRow);
await rowActionsComposable.confirmRestoreRow(dialogs.state.rowToRestore as TRow);
await rowActionsComposable.confirmDuplicateRow(dialogs.state.singleRowToDuplicate as TRow);
```

**Root cause:** `dialogs.state.rowToDelete` is `DeepReadonly<TRow> | null`. The mutators `confirmDeleteRow`/`confirmRestoreRow`/`confirmDuplicateRow` in `useRowActions.svelte.ts` accept `TRow` (mutable). `DeepReadonly<TRow>` is not assignable to `TRow`.

**Investigation of mutator internals:** The `confirmDeleteRowImpl`/`confirmRestoreRowImpl`/`confirmDuplicateRowImpl` functions (lines 102, 144, 186) only READ from the row object (accessing `row[uid]` to get the UUID for the API call). They do NOT mutate the row. So the cast is safe at runtime — but it's a type-safety hole.

**User decision:** Fix mutator signatures to accept `DeepReadonly<TRow>` (Option B).

### Evidence 7: `useClientSelection` duplicates `isRowDeleted`

**File:** `composables/useClientSelection.svelte.ts:58-61`

```ts
function isRowDeleted(row: T): boolean {
  const r = row as Record<string, unknown>;
  return 'deleted_at' in r && r.deleted_at !== null && r.deleted_at !== undefined;
}
```

The shared utility `isRowDeleted` exists at `src/lib/components/entity-list-table/utils.ts:18` with identical logic. The composable duplicates it instead of importing.

### Evidence 8: `useKeyboardNavigation` type inconsistency

**File:** `composables/useKeyboardNavigation.svelte.ts:11`

```ts
focusedRowIndex: () => number;  // type says: number (never null)
```

But the handler checks `=== null || === undefined` at lines 56, 76, 94, 98.

**Source of truth:** `usePreviewPanel.svelte.ts:21` — `focusedRowIndex: 0` (type is `number`, never `null`).

**Impact:** The `=== null` checks are dead code. Not a runtime bug, but misleading. The behavior is: `focusedRowIndex` defaults to `0`, meaning row 0 is always "focused" by default.

### Evidence 9: `useSelection.allSelected` logic bug (latent, in "kept for future" composable)

**File:** `composables/useSelection.svelte.ts:53-54`

```ts
const allSelected = $derived(_state.selectedKeys.length > 0);
const someSelected = $derived(_state.selectedKeys.length > 0);
```

`allSelected` and `someSelected` are identical. `allSelected` should check if ALL rows are selected, not just if any selection exists.

### Evidence 10: `pnpm run build` fails — Tailwind CSS v4 environment issue

```
Error: [postcss] ENOENT: no such file or directory, open 'D:\git\primebrick\primebrick-fe-v3\tailwindcss'
```

**Not related to the refactoring.** 3802 modules transformed successfully. The error is in the PostCSS/Tailwind v4 pipeline.

**Investigation:**
- `postcss.config.js` uses `@tailwindcss/postcss` plugin (Tailwind v4 PostCSS plugin)
- `@tailwindcss/postcss@4.3.0` IS installed at `node_modules/@tailwindcss/postcss`
- `tailwindcss@4.3.0` IS installed at `node_modules/tailwindcss`
- `src/app.css` has `@import "tailwindcss";` which the PostCSS plugin tries to resolve
- The error suggests the plugin is looking for a `tailwindcss` binary/file at the project root instead of resolving the package
- `@tailwindcss/vite` is NOT installed (the Vite plugin alternative to PostCSS)
- `vite.config.ts` has no Tailwind-specific config
- `pnpm view @tailwindcss/vite version` → `4.3.1` (latest)

**Root cause hypothesis:** Tailwind v4's PostCSS plugin on Windows has a path resolution issue when resolving `@import "tailwindcss"` — it looks for a file named `tailwindcss` relative to the project root instead of resolving the npm package. The recommended approach for Tailwind v4 + Vite is to use `@tailwindcss/vite` instead of `@tailwindcss/postcss`.

**Fix:** Replace `@tailwindcss/postcss` with `@tailwindcss/vite` in the Vite config, remove `postcss.config.js`.

### Evidence 11: Dialog `bind:open` → `open` + `onOpenChange` conversion is correct

**File:** `components/EntityListTableDialogs.svelte`

All 8 dialogs correctly use `open={...}` + `onOpenChange={(open) => { if (!open) dialogs.closeXDialog(); }}`. No issues.

### Evidence 12: `useExport` import path inconsistency (pre-existing)

**File:** `EntityListTable.svelte:60-64` — imports use `.svelte.js` extension but files are `.svelte.ts`. Works via SvelteKit resolution but inconsistent. Pre-existing, not changed by refactoring.

---

## Objectives

1. **Fix the 1 new type error** introduced by the refactoring (`TableBody.svelte` + `EntityListTableTableView.svelte` `onRowRangeMouseDown` missing from type).
2. **Fix the `as TRow` type-safety holes** by changing mutator signatures in `useRowActions.svelte.ts` to accept `DeepReadonly<TRow>`.
3. **Fix `useClientSelection` `isRowDeleted` duplication** — import from shared utility.
4. **Fix `useKeyboardNavigation` type inconsistency** — align `focusedRowIndex` type with reality.
5. **Fix `useSelection.allSelected` latent bug** — change to function taking `allKeys`.
6. **Fix `createSortingHandlers` and `createClickHandlers` reactivity bugs** — convert to getter-function options.
7. **Fix all 28 pre-existing type errors** across 8 files.
8. **Fix Tailwind CSS v4 build** — switch from `@tailwindcss/postcss` to `@tailwindcss/vite`.
9. **Manual testing** of all features affected by the refactoring.

---

## Implementation Steps

### Step 1: Fix `TableBody.svelte` and `EntityListTableTableView.svelte` — add `onRowRangeMouseDown` to prop type

**Files:**
- `src/lib/components/entity-list-table/components/TableBody.svelte` (line 72-74)
- `src/lib/components/entity-list-table/components/EntityListTableTableView.svelte` (line 107 — `rowRangeSelection: any` — should also be typed)

**Fix in `TableBody.svelte`:**
```ts
// Before (line 72-74):
rowRangeSelection: {
  state: { rowRangeMouseDown: boolean; rangeDragActive: boolean };
};

// After:
rowRangeSelection: {
  state: { rowRangeMouseDown: boolean; rangeDragActive: boolean };
  onRowRangeMouseDown: (index: number, e: MouseEvent) => void;
};
```

**Verification:** `pnpm run check` — the `TableBody.svelte:215` error disappears. Error count drops from 29 to 28.

---

### Step 2: Fix `as TRow` casts — change mutator signatures to accept `DeepReadonly<TRow>`

**File:** `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts`

**Changes:**
1. Import `DeepReadonly`:
```ts
import type { DeepReadonly } from '$lib/types/deep-readonly';
```

2. Change the public mutator signatures (lines 276, 280, 284):
```ts
// Before:
async function confirmDeleteRow(row: TRow) { ... }
async function confirmRestoreRow(row: TRow) { ... }
async function confirmDuplicateRow(row: TRow) { ... }

// After:
async function confirmDeleteRow(row: DeepReadonly<TRow>) { ... }
async function confirmRestoreRow(row: DeepReadonly<TRow>) { ... }
async function confirmDuplicateRow(row: DeepReadonly<TRow>) { ... }
```

3. Change the internal impl signatures (lines 102, 144, 186):
```ts
// Before:
async function confirmDeleteRowImpl(row: TRow) { ... }
async function confirmRestoreRowImpl(row: TRow) { ... }
async function confirmDuplicateRowImpl(row: TRow) { ... }

// After:
async function confirmDeleteRowImpl(row: DeepReadonly<TRow>) { ... }
async function confirmRestoreRowImpl(row: DeepReadonly<TRow>) { ... }
async function confirmDuplicateRowImpl(row: DeepReadonly<TRow>) { ... }
```

4. Inside the impl functions, the `row[uid]` access (lines 108, 150, 192) will need a cast since `DeepReadonly<TRow>` makes index access readonly (which is fine for reading):
```ts
const uuidValue = row[uid as keyof DeepReadonly<TRow>] as string;
```
This already works because `DeepReadonly` preserves index access for reads.

**File:** `src/lib/components/entity-list-table/EntityListTable.svelte` (lines 525, 533, 618)

Remove the `as TRow` casts:
```ts
// Before:
await rowActionsComposable.confirmDeleteRow(dialogs.state.rowToDelete as TRow);
// After:
await rowActionsComposable.confirmDeleteRow(dialogs.state.rowToDelete!);
```
(The `!` non-null assertion is needed because `state.rowToDelete` is `DeepReadonly<TRow> | null` and we already checked `if (!dialogs.state.rowToDelete) return;` above.)

**Verification:** `pnpm run check` — no new errors. The 3 `as TRow` casts are gone.

---

### Step 3: Fix `useClientSelection` — import shared `isRowDeleted`

**File:** `src/lib/components/entity-list-table/composables/useClientSelection.svelte.ts`

**Changes:**
1. Add import at top:
```ts
import { isRowDeleted as isRowDeletedUtil } from '../utils';
```

2. Remove the local `isRowDeleted` function (lines 58-61).

3. Update usages (lines 64, 68):
```ts
// Before:
const hasDeletedSelected = $derived(orderedSelectedRows.some(r => isRowDeleted(r)));
const allSelectedDeleted = $derived(orderedSelectedRows.length > 0 && orderedSelectedRows.every(r => isRowDeleted(r)));

// After:
const hasDeletedSelected = $derived(orderedSelectedRows.some(r => isRowDeletedUtil(r)));
const allSelectedDeleted = $derived(orderedSelectedRows.length > 0 && orderedSelectedRows.every(r => isRowDeletedUtil(r)));
```

**Note:** The shared `isRowDeleted<T extends Record<string, unknown>>(row: T)` requires `T` to extend `Record<string, unknown>`. The composable's `T` has no constraint. Add constraint: `export function useClientSelection<T extends Record<string, unknown>>(...)`.

**Verification:** `pnpm run check` — no new errors.

---

### Step 4: Fix `useKeyboardNavigation` — align `focusedRowIndex` type

**File:** `src/lib/components/entity-list-table/composables/useKeyboardNavigation.svelte.ts`

**Fix:** Change the type to `number | null` (line 11):
```ts
// Before:
focusedRowIndex: () => number;

// After:
focusedRowIndex: () => number | null;
```

Keep the `=== null || === undefined` checks — they're now meaningful.

**Verification:** `pnpm run check` — no new errors.

---

### Step 5: Fix `useSelection.allSelected` latent bug

**File:** `src/lib/components/entity-list-table/composables/useSelection.svelte.ts`

**Fix:** Replace the `allSelected` derived with a function (lines 53, 62):
```ts
// Before:
const allSelected = $derived(_state.selectedKeys.length > 0);
// ...
get allSelected() { return allSelected; },

// After:
function allSelected(allKeys: string[]): boolean {
  return allKeys.length > 0 && _state.selectedKeys.length === allKeys.length
    && allKeys.every(k => _state.selectedKeys.includes(k));
}
// ...
allSelected,  // now a function, not a getter
```

**Verification:** `pnpm run check` — no new errors (composable has zero consumers).

---

### Step 6: Fix `createSortingHandlers` reactivity bugs

**File:** `src/lib/components/entity-list-table/handlers/sorting.ts`

**Fix:** Convert reactive value parameters to getter functions:

```ts
// Before:
export function createSortingHandlers(
  columnOrder: any,
  defaultSort: { key: string; dir?: 'asc' | 'desc' } | undefined,
  defaultSortDir: 'asc' | 'desc',
  onResetColumnVisibility: (view: 'table' | 'cards' | 'cards_list') => void,
  onSortChange: (key: string | null, dir: 'asc' | 'desc') => void,
  rowsLoading: boolean,                    // ← STALE
  sortKey: () => string | null,
  sortDir: () => 'asc' | 'desc',
  dataColumns: any,                        // ← STALE
  auditingColumnsGroup: any,               // ← STALE
  nonAuditingColumns: any,                 // ← STALE
  onFilterValuesChange?: ...,
  onAdvancedFiltersChange?: ...,
  onResetFilters?: () => void
)

// After:
export function createSortingHandlers(
  columnOrder: any,
  defaultSort: { key: string; dir?: 'asc' | 'desc' } | undefined,
  defaultSortDir: 'asc' | 'desc',
  onResetColumnVisibility: (view: 'table' | 'cards' | 'cards_list') => void,
  onSortChange: (key: string | null, dir: 'asc' | 'desc') => void,
  rowsLoading: () => boolean,              // ← getter
  sortKey: () => string | null,
  sortDir: () => 'asc' | 'desc',
  dataColumns: () => any,                  // ← getter
  auditingColumnsGroup: () => any,         // ← getter
  nonAuditingColumns: () => any,           // ← getter
  onFilterValuesChange?: ...,
  onAdvancedFiltersChange?: ...,
  onResetFilters?: () => void
)
```

Update internal usages:
```ts
// Line 37-39 (reorderGroup):
columnOrder.reorderGroup(group, fromKey, toKey,
  dataColumns(),         // ← call getter
  auditingColumnsGroup(), // ← call getter
  nonAuditingColumns()    // ← call getter
);

// Line 44 (handleSortClick):
if (rowsLoading()) return;  // ← call getter
```

**File:** `src/lib/components/entity-list-table/EntityListTable.svelte` (lines 902-917)

Update the call site to pass getters:
```ts
// Before:
const sortingHandlers = createSortingHandlers(
  columnOrder,
  defaultSort,
  defaultSortDir,
  onResetColumnVisibility,
  onSortChange,
  rowsLoading,              // ← raw value
  () => sortKey,
  () => sortDir,
  dataColumns,              // ← raw value
  auditingColumnsGroup,     // ← raw value
  nonAuditingColumns,       // ← raw value
  ...
);

// After:
const sortingHandlers = createSortingHandlers(
  columnOrder,
  defaultSort,
  defaultSortDir,
  onResetColumnVisibility,
  onSortChange,
  () => rowsLoading,        // ← getter
  () => sortKey,
  () => sortDir,
  () => dataColumns,        // ← getter
  () => auditingColumnsGroup, // ← getter
  () => nonAuditingColumns,   // ← getter
  ...
);
```

**Verification:** `pnpm run check` — the `state_referenced_locally` warnings at lines 908, 911, 912, 913 should disappear.

---

### Step 7: Fix `createClickHandlers` reactivity bugs

**File:** `src/lib/components/entity-list-table/handlers/click-handlers.ts`

**Fix:** Convert reactive value parameters to getter functions:

```ts
// Before:
export function createClickHandlers<TRow extends Record<string, unknown>>(
  rowActionsComposable: any,
  previewPanel: any,
  rowSelectionEnabled: boolean,    // ← STALE
  rowsLoading: boolean,            // ← STALE
  error: string | null,            // ← STALE
  rowRangeSelection: any,
  toggleRowSelect: (key: string) => void
)

// After:
export function createClickHandlers<TRow extends Record<string, unknown>>(
  rowActionsComposable: any,
  previewPanel: any,
  rowSelectionEnabled: () => boolean,  // ← getter
  rowsLoading: () => boolean,          // ← getter
  error: () => string | null,          // ← getter
  rowRangeSelection: any,
  toggleRowSelect: (key: string) => void
)
```

Update internal usages:
```ts
// Line 19 (onEntityRowClick):
if (!rowSelectionEnabled() || rowsLoading() || error()) return;

// Line 38 (onEntityCardClick):
if (!rowSelectionEnabled() || rowsLoading() || error()) return;
```

**File:** `src/lib/components/entity-list-table/EntityListTable.svelte` (lines 921-929)

Update the call site:
```ts
// Before:
const clickHandlers = createClickHandlers(
  rowActionsComposable,
  previewPanel,
  rowSelectionEnabled,    // ← raw
  rowsLoading,            // ← raw
  error,                  // ← raw
  rowRangeSelection,
  toggleRowSelect
);

// After:
const clickHandlers = createClickHandlers(
  rowActionsComposable,
  previewPanel,
  () => rowSelectionEnabled,  // ← getter
  () => rowsLoading,          // ← getter
  () => error,                // ← getter
  rowRangeSelection,
  toggleRowSelect
);
```

**Verification:** `pnpm run check` — the `state_referenced_locally` warnings at lines 924, 925, 926 should disappear.

---

### Step 8: Fix pre-existing type errors (28 errors across 8 files)

#### 8a: `template-interpolate.ts` (3 errors)

**File:** `src/lib/template-interpolate.ts`

**Fix:** Type the `.replace()` callback parameters:
```ts
// Before (line 7-8):
return template.replace(/\$\{([\w.]+)\}/g, (match, path) => {
  const value = path.split('.').reduce<unknown>((acc, key) => {

// After:
return template.replace(/\$\{([\w.]+)\}/g, (match: string, path: string) => {
  const value = path.split('.').reduce<unknown>((acc: unknown, key: string) => {
```

#### 8b: `wheel-picker-group.svelte` (2 errors)

**File:** `src/lib/components/ui/wheel-picker/wheel-picker-group.svelte`

**Fix:** Declare `snapTimeout` as possibly undefined:
```ts
// Before (line 34):
let snapTimeout: ReturnType<typeof setTimeout>;

// After:
let snapTimeout: ReturnType<typeof setTimeout> | undefined;
```

#### 8c: `command-input.svelte` (1 error)

**File:** `src/lib/components/ui/command/command-input.svelte`

**Fix:** Type `ref` as `HTMLInputElement | null`:
```ts
// Before (line 8):
ref = $bindable(null),

// After:
ref = $bindable(null as HTMLInputElement | null),
```
Or check what `InputGroup.Input` expects and align the type. May need to check the `InputGroup.Input` component's `ref` prop type.

#### 8d: `TableBody.svelte` TRow generic variance (~12 errors)

**File:** `src/lib/components/entity-list-table/components/TableBody.svelte`

**Root cause:** `TableBody` is generic `<TRow extends Record<string, unknown>>` but when `EntityListTableTableView` passes props to it, Svelte infers the generic as `Record<string, unknown>` (the constraint), not the actual `TRow` of the parent. This is a known Svelte 5 limitation with generic component prop passing.

**Fix options:**
- **Option 1:** Make `TableBody` non-generic — use `Record<string, unknown>` directly. Simplest but loses type safety.
- **Option 2:** Use `Snippet` type parameters correctly — ensure the `cell` and `rowActions` snippets use `TRow` consistently.
- **Option 3:** Cast at the call site in `EntityListTableTableView.svelte` — `<TableBody {...props as any}>` (escape hatch).

**Recommendation:** Option 1 for `TableBody` — it's a leaf component that renders rows. The type safety loss is minimal since `TableRow` (which it calls) is also generic and will enforce types. If Option 1 doesn't work cleanly, use Option 3.

#### 8e: `EntityListTableHeader.svelte` (1 error)

**File:** `src/lib/components/entity-list-table/components/EntityListTableHeader.svelte:162`

**Fix:** Make `filterValues` required or provide a default:
```ts
// Before (line 81):
filterValues?: Record<string, any>;

// After:
filterValues: Record<string, any>;
```
And ensure the caller always passes it (check `EntityListTable.svelte` — it passes `filterValues={filterValues}` which is a prop with a default).

#### 8f: `EntityListTableFooter.svelte` (2 errors)

**File:** `src/lib/components/entity-list-table/components/EntityListTableFooter.svelte:60,68`

**Fix:** Type the `$bindable()` defaults:
```ts
// Before (line 11):
clientSelectedPage = $bindable(),
// Before (line 19):
showSelectedOnly = $bindable(),

// After:
clientSelectedPage = $bindable(1),
showSelectedOnly = $bindable(false),
```
Or change the type to include `undefined`:
```ts
clientSelectedPage?: number;
showSelectedOnly?: boolean;
```
And update `TableFooter.svelte` to handle `undefined`.

#### 8g: `EntityListTableLoading.svelte` (1 error)

**File:** `src/lib/components/entity-list-table/components/EntityListTableLoading.svelte`

**Fix:** Change `metaLoadingView` type to `Snippet`:
```ts
// Before (line 12):
metaLoadingView?: (() => void) | null;

// After:
import type { Snippet } from 'svelte';
// ...
metaLoadingView?: Snippet;
```

#### 8h: `EntityListTableCardView.svelte` (4 errors)

**File:** `src/lib/components/entity-list-table/components/EntityListTableCardView.svelte`

**Fixes:**
1. Change `errorView`, `rowsLoadingView`, `emptyView` types (lines 69, 71, 74):
```ts
// Before:
errorView?: (() => void) | null;
rowsLoadingView?: (() => void) | null;
emptyView?: (() => void) | null;

// After:
import type { Snippet } from 'svelte';
errorView?: Snippet;
rowsLoadingView?: Snippet;
emptyView?: Snippet;
```

2. Fix `onSortChange` signature (line 85):
```ts
// Before:
onSortChange: (key: string, dir: 'asc' | 'desc') => void;

// After:
onSortChange: (key: string | null, dir: 'asc' | 'desc') => void;
```

#### 8i: `EntityListTableTableView.svelte` (4 errors)

**File:** `src/lib/components/entity-list-table/components/EntityListTableTableView.svelte`

**Fixes:**
1. Change `errorView`, `rowsLoadingView`, `emptyView` types (lines 97, 98, 102) — same as 8h.

2. Fix `columns` type (line 127):
```ts
// Before:
columns: any[] | undefined;

// After:
columns: MetaColumn[];
```
And ensure the caller always passes a non-undefined value (add a default or make it required). Check what `EntityListTable.svelte` passes — if it can be undefined, add a default `columns = []` in the destructuring.

**Verification:** `pnpm run check` — all 28 pre-existing errors should be resolved. Error count should be 0 (or close to 0).

---

### Step 9: Fix Tailwind CSS v4 build — switch to `@tailwindcss/vite`

**Files:**
- `package.json` — add `@tailwindcss/vite`, remove `@tailwindcss/postcss`
- `vite.config.ts` — add TailwindVite plugin
- `postcss.config.js` — delete (no longer needed)

**Changes:**

1. Install the Vite plugin:
```bash
pnpm add -D @tailwindcss/vite@4.3.1
pnpm remove @tailwindcss/postcss
```

2. Update `vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiOrigin = (env.API_ORIGIN || 'http://localhost:3001').replace(/\/+$/, '');

  return {
    plugins: [
      tailwindcss(),
      sveltekit(),
      Icons({
        compiler: 'svelte',
        autoInstall: true
      })
    ],
    // ... rest unchanged
  };
});
```

3. Delete `postcss.config.js`:
```bash
rm postcss.config.js
```

4. `src/app.css` stays the same — `@import "tailwindcss";` works with both PostCSS and Vite plugins.

**Verification:** `pnpm run build` — should pass without the ENOENT error.

---

### Step 10: Manual testing

After fixing all code issues, manually test:

| Test | What to verify | How |
|---|---|---|
| EntityListTable renders | Table loads with data, columns display correctly | Navigate to any entity list page (customers, users, organizations) |
| Column reordering | Drag column headers to reorder, verify order persists in sessionStorage | Use the column reorder UI |
| Column visibility | Toggle column visibility via the sheet menu, verify `applyColumnVisibility` works | Open column visibility sheet |
| Dialogs open/close | Delete, restore, duplicate, bulk delete/restore, export dialogs all open and close correctly | Trigger each dialog |
| Export works | Export to xlsx/csv, HTML export, PDF preview, email HTML | Use the export toolbar button |
| Preview panel works | Click a row to open preview, navigate next/prev, edit mode toggle | Click any row |
| **Keyboard navigation** | ArrowUp/ArrowDown moves focused row, ArrowLeft/ArrowRight navigates preview, Space toggles selection, Enter opens dropdown, Escape closes | Focus the table, use keyboard |
| **"Show selected only" toggle** | Select rows, click "show selected only" in footer, verify only selected rows show with client-side paging, verify exiting on server reload, verify page clamping | Select rows, toggle, navigate pages |
| **Sort while loading** | Click a sortable column header while data is loading — should be blocked. After loading completes, sorting should work. | Trigger a data refresh, try sorting |
| **Row click while loading** | Click a row while data is loading — should be blocked. After loading, row clicks should toggle selection. | Trigger a data refresh, try clicking |
| SidebarHealthBadge | Badge updates when backend status changes | Check sidebar health badge |
| VersionsPanel | Renders correctly, no console errors from removed import | Open versions panel |
| Profile page metadata | Metadata loads and displays correctly | Navigate to profile settings |
| **Build** | `pnpm run build` passes | Run build command |

**Critical tests** (bolded) are the ones most affected by the refactoring and this finalization:
- Keyboard navigation was BROKEN before (empty if/else bodies) and is now FIXED — verify it works.
- "Show selected only" was inline and is now via `useClientSelection` — verify toggle, paging, exit-on-reload, page clamping.
- Sort/click handlers had stale-value bugs — verify they now respond to current state correctly.

---

## Files to Modify

| File | Change | Step |
|---|---|---|
| `src/lib/components/entity-list-table/components/TableBody.svelte` | Add `onRowRangeMouseDown` to prop type; fix TRow generic variance | 1, 8d |
| `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts` | Change mutator signatures to accept `DeepReadonly<TRow>` | 2 |
| `src/lib/components/entity-list-table/EntityListTable.svelte` | Remove `as TRow` casts; update handler call sites to pass getters | 2, 6, 7 |
| `src/lib/components/entity-list-table/composables/useClientSelection.svelte.ts` | Import shared `isRowDeleted`, remove local duplicate, add T constraint | 3 |
| `src/lib/components/entity-list-table/composables/useKeyboardNavigation.svelte.ts` | Change `focusedRowIndex` type to `number \| null` | 4 |
| `src/lib/components/entity-list-table/composables/useSelection.svelte.ts` | Fix `allSelected` to be a function taking `allKeys` | 5 |
| `src/lib/components/entity-list-table/handlers/sorting.ts` | Convert reactive params to getter functions | 6 |
| `src/lib/components/entity-list-table/handlers/click-handlers.ts` | Convert reactive params to getter functions | 7 |
| `src/lib/template-interpolate.ts` | Type the `.replace()` callback parameters | 8a |
| `src/lib/components/ui/wheel-picker/wheel-picker-group.svelte` | Declare `snapTimeout` as possibly undefined | 8b |
| `src/lib/components/ui/command/command-input.svelte` | Fix `ref` type to `HTMLInputElement \| null` | 8c |
| `src/lib/components/entity-list-table/components/EntityListTableHeader.svelte` | Make `filterValues` required or provide default | 8e |
| `src/lib/components/entity-list-table/components/EntityListTableFooter.svelte` | Type `$bindable()` defaults | 8f |
| `src/lib/components/entity-list-table/components/EntityListTableLoading.svelte` | Change `metaLoadingView` to `Snippet` | 8g |
| `src/lib/components/entity-list-table/components/EntityListTableCardView.svelte` | Fix Snippet types, `onSortChange` signature | 8h |
| `src/lib/components/entity-list-table/components/EntityListTableTableView.svelte` | Fix Snippet types, `columns` type | 8i |
| `package.json` | Add `@tailwindcss/vite`, remove `@tailwindcss/postcss` | 9 |
| `vite.config.ts` | Add `tailwindcss()` plugin | 9 |
| `postcss.config.js` | Delete | 9 |

---

## Verification

- [ ] `pnpm run check` — 0 errors (down from 29)
- [ ] `pnpm run build` — passes (Tailwind fix)
- [ ] No `state_referenced_locally` warnings for reactive values (only safe ones for storage keys/callbacks remain)
- [ ] No `as TRow` casts in `EntityListTable.svelte`
- [ ] Manual test: EntityListTable renders, column reordering/visibility works
- [ ] Manual test: All dialogs open/close correctly
- [ ] Manual test: Export works (xlsx, csv, HTML, PDF, email)
- [ ] Manual test: Preview panel works (open, navigate, edit mode)
- [ ] **Manual test: Keyboard navigation works** (ArrowUp/Down/Left/Right, Space, Enter, Escape)
- [ ] **Manual test: "Show selected only" toggle works** (toggle, client paging, exit on reload, page clamping)
- [ ] **Manual test: Sort while loading is blocked, sort after loading works** (reactivity fix)
- [ ] **Manual test: Row click while loading is blocked, row click after loading works** (reactivity fix)
- [ ] Manual test: SidebarHealthBadge updates on backend status change
- [ ] Manual test: VersionsPanel renders, no console errors
- [ ] Manual test: Profile page metadata loads
- [ ] Verify `useSelection`, `useSorting`, `useFilters`, `useAdvancedFilters` still compile (kept for future)

---

## Risks/Considerations

1. **Step 8d (TRow generic variance) is the hardest fix** — Svelte 5's generic component prop passing has known limitations. The fix may require making leaf components non-generic or using `any` casts. This is a Svelte compiler limitation, not a code bug. If the fix proves too complex, defer these specific errors and focus on the others.

2. **Step 9 (Tailwind) changes the build tooling** — switching from PostCSS to Vite plugin is a standard Tailwind v4 migration path, but verify no custom PostCSS plugins are used. The current `postcss.config.js` only has `@tailwindcss/postcss`, so the migration is clean.

3. **Step 6/7 (handler reactivity) changes handler factory signatures** — this is a breaking change to the handler factory APIs. Since they're only called from `EntityListTable.svelte`, the blast radius is limited. But verify no other files import `createSortingHandlers` or `createClickHandlers`.

4. **Step 2 (DeepReadonly mutator signatures) may cascade** — changing `confirmDeleteRow` to accept `DeepReadonly<TRow>` means the internal `_state.rowToDelete` (which is `TRow`) is assignable to `DeepReadonly<TRow>` (widening is safe). But the `confirmDeleteRowWrapper` at line 235 calls `confirmDeleteRowImpl(_state.rowToDelete)` — this should still work since `TRow` is assignable to `DeepReadonly<TRow>`.

5. **The `useSelection.allSelected` fix changes the API** — from a getter to a function. Since the composable has zero consumers, this is safe. Document as a breaking change for future wiring.

6. **Pre-existing errors in UI components (8b, 8c) may be shadcn-svelte generated code** — if these are auto-generated, fixing them manually may be overwritten on the next shadcn-svelte update. Check if these files have a "do not edit" header.

7. **Atomic commits** — per the code-guardrails rule, apply changes iteratively and run `pnpm run check` after each step. Do NOT batch all changes and run check once at the end.