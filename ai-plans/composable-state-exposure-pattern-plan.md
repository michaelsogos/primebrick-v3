# Composable State Exposure Pattern — Standardization Plan

**Date:** 2026-06-24
**Stack:** SvelteKit + Svelte 5 + TypeScript (`primebrick-fe-v3`)
**Scope:** All `use{Something}` composables in FE — establish a unified, type-safe, reactivity-correct state exposure pattern.

---

## Translation policy

N/A — this plan involves no UI label changes. No i18n keys are affected.

---

## Empirical evidence summary (this session)

All findings below were verified empirically by reading source files, running `tsc` compile tests, and executing runtime identity checks.

### Evidence 1: `$derived` returned via object shorthand freezes the value

| Fact | Source |
|---|---|
| `$derived` in a return statement `{ health }` compiles to `$.get(signal)` **once at return time** — the object property stores a snapshot, not a reactive reference | Svelte 5 compiler behavior; confirmed by user's commit `84e1224` fixing `useHealthChip` |
| `useHealthChip` was refactored to pure functions + `backendState` proxy ref — destructuring the proxy ref is safe (proxy reference is stable, property access tracks reactivity) | `useHealthChip.svelte.ts` lines 56-57; `SidebarHealthBadge.svelte` lines 15-21; `VersionsPanel.svelte` lines 18-21 |

### Evidence 2: `$state` proxy is safe to destructure, `$derived` is not

| Fact | Source |
|---|---|
| `$state({...})` returns a stable proxy object — the reference doesn't change when properties mutate. Destructuring `const { state } = obj` copies the proxy reference, which is fine. Reactivity lives in property access on the proxy. | Runtime test: `s === state` → `true` (no wrapper) |
| `$derived(expr)` creates a signal — reading it compiles to `$.get(signal)`. Object shorthand `{ derived }` in a return reads the signal once, storing a frozen snapshot. | Svelte 5 compiler behavior |

### Evidence 3: `DeepReadonly<T>` is type-only, blocks all mutation, preserves reactivity

| Test | Result | Source |
|---|---|---|
| Read access compiles (`.length`, `[0]`, `.map()`, `.filter()`, `for...of`) | ✅ Pass | `tsc --strict` compile test |
| Shallow mutation blocked (`s.status = 'x'`, `s.items = []`) | ✅ TS2540 | `tsc --strict` compile test |
| Deep mutation blocked (`s.items.push('x')`, `s.items[0] = 'x'`, `s.nested.foo = 'x'`) | ✅ TS2339/TS2542 | `tsc --strict` compile test |
| Runtime identity: `s === state` is `true` (no wrapper object) | ✅ `true` | `tsx` runtime test |
| Reactivity preserved: getter returns raw `$state` proxy, `DeepReadonly` is erased at compile time | ✅ Type-only mapped type | TypeScript specification |

### Evidence 4: Consumers use dot notation, not destructuring

| Composable | Consumer access pattern | Source |
|---|---|---|
| `useDialogs` | `dialogs.rowToDelete`, `dialogs.openDeleteDialog()`, etc. — dot notation | `EntityListTable.svelte` lines 587-706 (30+ dot accesses) |
| `useExport` | `exportComposable.fileType`, `exportComposable.handleExport()` — dot notation | `EntityListTable.svelte` lines 659-742 |
| `usePreviewPanel` | `previewPanel.previewPanelOpen`, `previewPanel.openPreview()` — dot notation | `EntityListTable.svelte` lines 501-565 |
| `useEntityMetadata` | `metadata.meta`, `metadata.loading` — dot notation | `+page.svelte` (profile) lines 199, 315, 319; (security) line 41 |
| `useColumnOrder` | `columnOrder.orderState`, `columnOrder.applyKeyOrder()` — dot notation | `EntityListTable.svelte` lines 248, 254-256, 278, 298, 301 |
| `useSheetPanelManagement` | `sheetPanelManagement.lastPanelId.value` — dot notation (with `.value` wrapper) | `EntityListTable.svelte` lines 442-443 |

### Evidence 5: `useColumnOrder` has an actual encapsulation violation

| Fact | Source |
|---|---|
| Consumer directly mutates `orderState.data`, `orderState.auditing`, `orderState.sticky` bypassing the `reorderGroup()` mutator | `EntityListTable.svelte` lines 407-409 |
| The `reorderGroup()` mutator calls `writeOrderState()` for sessionStorage persistence; the direct mutation at lines 407-409 does call `columnOrder.writeOrderState(nextState)` afterward, but the mutation itself is uncontrolled — no validation, no centralized logic | `useColumnOrder.svelte.ts` lines 76-95; `EntityListTable.svelte` lines 401-410 |

### Evidence 6: 6 composables have zero consumers (incomplete refactoring)

| Composable | Exported in index.ts | Consumed anywhere? | Verdict |
|---|---|---|---|
| `useSelection` | Line 1 | ❌ No consumers | KEEP — intended for future wiring (component-owned selection state) |
| `useSorting` | Line 4 | ❌ No consumers | KEEP — intended for future wiring (component-owned sort state) |
| `useFilters` | Line 10 | ❌ No consumers | KEEP — intended for future wiring (component-owned filter state) |
| `useAdvancedFilters` | Line 10 | ❌ No consumers | KEEP — intended for future wiring (component-owned advanced filter state) |
| `useClientSelection` | Line 15 | ❌ No consumers | **WIRE IN NOW** — direct replacement for inline logic in EntityListTable |
| `useKeyboardNavigation` | Line 17 | ❌ No consumers | **WIRE IN NOW** — direct replacement for broken inline handler |

**Empirical finding:** No parent page uses `bind:selectedKeys`, `bind:sortKey`, `bind:sortDir`, `bind:filterValues`, or `bind:advancedFilters`. All 3 parent pages (customers, users, organizations) pass these as one-way props + callback handlers. The `$bindable` on `selectedKeys` (line 180) is declared but never used as bindable by any consumer. The parent-owned state pattern is the CURRENT implementation, not an intrinsic requirement — the composables were designed to move this state into the component.

### Evidence 7: `VersionsPanel.svelte` has unused `useHealthChip` import

| Fact | Source |
|---|---|
| `useHealthChip` is imported on line 10 but never called. The component uses `backendState` directly from `backend-availability` (line 6) and `chipLabel`/`chipClass` as pure functions. | `VersionsPanel.svelte` lines 6, 10, 18-21 |

### Evidence 8: `useSheetPanelManagement` has a fragile `{ value: ... }` wrapper

| Fact | Source |
|---|---|
| Getter returns `{ value: lastPanelId }` — a new object on every access. Destructuring `const { lastPanelId } = obj` gives a one-time snapshot that never updates. Consumer avoids this by using dot notation `obj.lastPanelId.value` inside a `$effect`, but the API is a trap. | `useSheetPanelManagement.svelte.ts` lines 14-16; `EntityListTable.svelte` lines 442-443 |

---

## Objectives

1. **Establish a single, type-safe, reactivity-correct pattern** for exposing `$state` from composables: `get state(): DeepReadonly<typeof _state> { return _state; }`
2. **Block uncontrolled mutation** at compile time via `DeepReadonly<T>` — all mutations must go through exposed mutator functions.
3. **Fix the 2 composables with real bugs** (`useColumnOrder` encapsulation leak, `useSheetPanelManagement` wrapper bug).
4. **Clean up dead code** (unused imports, optionally remove unused composables).
5. **Document the pattern** in `AGENTS.md` for future composable authors.

---

## The Standard Pattern

```ts
// DeepReadonly utility (type-only, erased at compile time)
type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export function useSomething() {
  // All $state in ONE cohesive object, prefixed with underscore (internal)
  const _state = $state({
    open: false,
    data: null as string | null,
    items: [] as string[],
  });

  // Mutators — only path to change _state
  function open() { _state.open = true; }
  function close() { _state.open = false; }
  function setItems(items: string[]) { _state.items = [...items]; }

  // $derived values owned by the composable — exposed via individual getters
  const isOpen = $derived(_state.open);

  return {
    // ONE getter: exposes all state as read-only, reactive, destructurable
    get state(): DeepReadonly<typeof _state> { return _state; },
    // Individual $derived getters (when composable owns the derivation)
    get isOpen() { return isOpen; },
    // Mutators
    open,
    close,
    setItems,
  };
}
```

**Consumer usage:**
```ts
const something = useSomething();
const { state } = something;              // safe to destructure — proxy ref is stable

// Reactive reads (work in $derived, $effect, template):
$derived(state.open)                      // ✓ tracked
$derived(state.items.length)              // ✓ tracked (deep)

// Mutations blocked at compile time:
// state.open = true                      // TS2540 ✗
// state.items.push('x')                  // TS2339 ✗ (deep)

// Must use mutators:
something.open();                         // ✓ only path to mutation
something.setItems(['a', 'b']);           // ✓ centralized logic
```

**Why `state` and not `current`/`readonlyState`/`stateReader`:**
- `state` is the cleanest call site: `something.state.open`
- The `DeepReadonly` return type signals "read-only" at the type level — the name doesn't need to repeat it
- Internal `$state` object is named `_state` (underscore = private/internal) to avoid collision

---

## Implementation Steps

### Step 1: Create `DeepReadonly<T>` utility

**File:** `primebrick-fe-v3/src/lib/types/deep-readonly.ts` (NEW)

```ts
/**
 * Recursively maps a type to its read-only equivalent.
 * - Arrays become ReadonlyArray (no push, splice, index assignment)
 * - Object properties become readonly
 * - Primitives are unchanged
 *
 * Type-only — erased at compile time. No runtime wrapper.
 * The underlying $state proxy is returned as-is, preserving Svelte 5 reactivity.
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
```

**Verification:** `pnpm run check` must pass after adding the file.

---

### Step 2: Fix `useSheetPanelManagement` — remove `{ value: ... }` wrapper

**File:** `primebrick-fe-v3/src/lib/components/entity-list-table/composables/useSheetPanelManagement.svelte.ts`

**Before:**
```ts
export interface SheetPanelManagementReturn {
  lastPanelId: { value: string | null };
}

export function useSheetPanelManagement(): SheetPanelManagementReturn {
  let lastPanelId = $state<string | null>(null);
  $effect(() => {
    if (sheetState.panelId) lastPanelId = sheetState.panelId;
  });
  return {
    get lastPanelId() { return { value: lastPanelId }; }
  };
}
```

**After:**
```ts
import { sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useSheetPanelManagement() {
  const _state = $state({
    lastPanelId: null as string | null,
  });

  $effect(() => {
    if (sheetState.panelId) _state.lastPanelId = sheetState.panelId;
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state; },
  };
}
```

**Consumer change — `EntityListTable.svelte` lines 442-443:**
```ts
// Before:
void sheetPanelManagement.lastPanelId.value;
if (!sheetState.open && sheetPanelManagement.lastPanelId.value === 'entity.filters') filtersOpen = false;

// After:
void sheetPanelManagement.state.lastPanelId;
if (!sheetState.open && sheetPanelManagement.state.lastPanelId === 'entity.filters') filtersOpen = false;
```

---

### Step 3: Fix `useColumnOrder` — encapsulation leak + apply standard pattern

**File:** `primebrick-fe-v3/src/lib/components/entity-list-table/composables/useColumnOrder.svelte.ts`

**Problem:** Consumer at `EntityListTable.svelte` lines 407-409 directly mutates `orderState.data/auditing/sticky` bypassing the `reorderGroup()` mutator.

**After:**
```ts
import { onMount } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export type ColumnOrderState = {
  sticky?: string[];
  data?: string[];
  auditing?: string[];
};

export function useColumnOrder(columnOrderStorageKey?: string) {
  const _state = $state<ColumnOrderState>({});

  // ... readOrderState, writeOrderState, applyKeyOrder, moveKeyWithin (unchanged) ...

  function reorderGroup(
    group: 'data' | 'auditing',
    fromKey: string,
    toKey: string,
    dataColumns: MetaColumn[] | undefined,
    auditingColumns: MetaColumn[] | undefined,
    nonAuditingColumns: MetaColumn[]
  ) {
    const base =
      group === 'data'
        ? (dataColumns ?? nonAuditingColumns).map((c) => c.key)
        : (auditingColumns ?? []).map((c) => c.key);
    const cur = group === 'data' ? (_state.data ?? base) : (_state.auditing ?? base);
    const nextKeys = moveKeyWithin(cur, fromKey, toKey);
    const nextState: ColumnOrderState =
      group === 'data' ? { ..._state, data: nextKeys } : { ..._state, auditing: nextKeys };
    _state.data = nextState.data;
    _state.auditing = nextState.auditing;
    writeOrderState(nextState);
  }

  // NEW mutator: replaces the direct mutation at EntityListTable.svelte lines 407-409
  function applyColumnVisibility(group: 'sticky' | 'data' | 'auditing', keys: string[]) {
    const nextState: ColumnOrderState = { ..._state, [group]: keys };
    _state.sticky = nextState.sticky;
    _state.data = nextState.data;
    _state.auditing = nextState.auditing;
    writeOrderState(nextState);
  }

  onMount(() => {
    const loaded = readOrderState();
    _state.sticky = loaded.sticky;
    _state.data = loaded.data;
    _state.auditing = loaded.auditing;
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state; },
    applyKeyOrder,
    moveKeyWithin,
    reorderGroup,
    applyColumnVisibility,
    writeOrderState,
    reset: () => {
      _state.sticky = undefined;
      _state.data = undefined;
      _state.auditing = undefined;
      writeOrderState({});
    }
  };
}
```

**Consumer change — `EntityListTable.svelte`:**

Line 248:
```ts
// Before:
const orderState = columnOrder.orderState;

// After:
const orderState = columnOrder.state;
```

Lines 254-256, 278, 284, 298, 301, 306: `orderState.sticky` / `.data` / `.auditing` reads remain unchanged (DeepReadonly allows reads).

Lines 401-410 (the encapsulation violation):
```ts
// Before:
const nextState: ColumnOrderState =
  group === 'sticky'
    ? { ...orderState, sticky: dedup }
    : group === 'data'
      ? { ...orderState, data: dedup }
      : { ...orderState, auditing: dedup };
orderState.data = nextState.data;       // ✗ direct mutation — will be TS2540 after refactor
orderState.auditing = nextState.auditing; // ✗
orderState.sticky = nextState.sticky;   // ✗
columnOrder.writeOrderState(nextState);

// After:
columnOrder.applyColumnVisibility(group, dedup);  // ✓ centralized mutator
```

---

### Step 4: Refactor `useDialogs` to standard pattern

**File:** `primebrick-fe-v3/src/lib/components/entity-list-table/composables/useDialogs.svelte.ts`

**Before:** 9 separate `$state` variables + 9 getters (Pattern A).

**After:**
```ts
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useDialogs<TRow extends Record<string, unknown>>() {
  const _state = $state({
    deleteDialogOpen: false,
    restoreDialogOpen: false,
    duplicateDialogOpen: false,
    bulkDeleteDialogOpen: false,
    bulkRestoreDialogOpen: false,
    rowToDelete: null as TRow | null,
    rowToRestore: null as TRow | null,
    singleRowToDuplicate: null as TRow | null,
    duplicateScope: 'selected' as 'selected' | 'single',
  });

  function openDeleteDialog() { _state.deleteDialogOpen = true; }
  function closeDeleteDialog() { _state.deleteDialogOpen = false; }
  // ... all open/close functions ...

  function setRowToDelete(row: TRow | null) { _state.rowToDelete = row; }
  function setRowToRestore(row: TRow | null) { _state.rowToRestore = row; }
  function setSingleRowToDuplicate(row: TRow | null) { _state.singleRowToDuplicate = row; }
  function setDuplicateScope(scope: 'selected' | 'single') { _state.duplicateScope = scope; }

  return {
    get state(): DeepReadonly<typeof _state> { return _state; },
    openDeleteDialog,
    closeDeleteDialog,
    openRestoreDialog,
    closeRestoreDialog,
    openDuplicateDialog,
    closeDuplicateDialog,
    openBulkDeleteDialog,
    closeBulkDeleteDialog,
    openBulkRestoreDialog,
    closeBulkRestoreDialog,
    setRowToDelete,
    setRowToRestore,
    setSingleRowToDuplicate,
    setDuplicateScope,
  };
}
```

**Consumer change — `EntityListTable.svelte`:**

All `dialogs.X` property reads change to `dialogs.state.X`:
```ts
// Before:
dialogs.rowToDelete
dialogs.duplicateScope
dialogs.singleRowToDuplicate

// After:
dialogs.state.rowToDelete
dialogs.state.duplicateScope
dialogs.state.singleRowToDuplicate
```

All `dialogs.openX()` / `dialogs.closeX()` / `dialogs.setX()` mutator calls remain unchanged (they're still on the top-level object).

---

### Step 5: Refactor remaining active composables to standard pattern

Apply the same `get state(): DeepReadonly<typeof _state>` pattern to:

| Composable | File | State variables to consolidate |
|---|---|---|
| `useEntityMetadata` | `src/lib/composables/useEntityMetadata.svelte.ts` | `meta`, `loading`, `error` |
| `useBulkActions` | `composables/useBulkActions.svelte.ts` | `isDeleting`, `isRestoring`, `isDuplicating` |
| `useExport` | `composables/useExport.svelte.ts` | `exportOpen`, `exportScope`, `fileType`, `isExporting`, `isHtmlExporting`, `htmlPreviewContent`, `htmlPreviewDialogOpen`, `htmlExportConfirmDialogOpen`, `previewMode`, `pdfBlobUrl`, `emailHtmlContent`, `isEmailPreparing`, `emailCopied` |
| `usePreviewPanel` | `composables/usePreviewPanel.svelte.ts` | `previewRow`, `previewRowIndex`, `previewEditMode`, `previewPanelOpen`, `focusedRowIndex` + `$derived` `canNavigateNext`, `canNavigatePrev` |
| `useRowActions` | `composables/useRowActions.svelte.ts` | `isDeleting`, `isRestoring`, `isDuplicating`, `rowToDelete`, `rowToRestore`, `singleRowToDuplicate`, `duplicateScope` |
| `useRowRangeSelection` | `composables/useRowRangeSelection.svelte.ts` | `rowRangeMouseDown`, `rangeAnchorIndex`, `rangeDragActive`, `lastRangeEndIndex` + non-state `selectionSnapshotAtMouseDown`, `skipNextRowClickSelectToggle` |
| `useScrollPreservation` | `composables/useScrollPreservation.svelte.ts` | `savedTableScrollLeft`, `prevRowsLoadingForScrollSave`, `prevRowsLoadingForScrollRestore` |
| `useStickyColumns` | `composables/useStickyColumns.svelte.ts` | `checkboxHeadRef`, `stickyHeadRefs`, `stickyCellRefs`, `stickyLeftOffsets` + non-state `stickyRO`, `updatingStickyOffsets` |
| `useToolbarMode` | `composables/useToolbarMode.svelte.ts` | `toolbarMode`, `lastSelectionChange`, `lastFilterChange` + `$derived` `hasAppliedFilters` |
| `useViewMode` | `composables/useViewMode.svelte.ts` | `viewMode` + `$derived` `isTable`, `isCards`, `isCardsList` |
| `useDeletionFilter` | `composables/useDeletionFilter.svelte.ts` | `deletionFilterMode` + `$derived` `deletionFilterStorageKey` |
| `useFilterPersistence` | `composables/useFilterPersistence.svelte.ts` | `$derived` `filterValuesStorageKeyFull`, `advancedFiltersStorageKeyFull` (no `$state` — only pure functions + derived keys) |

**Note on `$derived` values:** When a composable owns a `$derived` (e.g., `useViewMode` has `isTable = $derived(viewMode === 'table')`), expose it via an individual getter `get isTable() { return isTable; }` alongside `get state()`. Do NOT put `$derived` inside the `$state` object — `$derived` cannot live inside `$state`.

**Consumer changes:** Each consumer that accesses `composable.someProperty` must change to `composable.state.someProperty` for state reads. Mutator calls remain unchanged.

---

### Step 6: Clean up `VersionsPanel.svelte` unused import

**File:** `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte`

**Line 10 — Before:**
```ts
import { useHealthChip, chipLabel, chipClass, type HealthChip } from '$lib/composables/useHealthChip';
```

**After:**
```ts
import { chipLabel, chipClass, type HealthChip } from '$lib/composables/useHealthChip';
```

---

### Step 7: Document the pattern in `AGENTS.md`

**File:** `primebrick-fe-v3/AGENTS.md`

Append a new section:

```markdown
## Composable state exposure pattern (MANDATORY)

All `use{Something}` composables MUST follow this pattern for exposing `$state`:

1. **Consolidate** all `$state` into a single `_state` object (underscore = internal).
2. **Expose** via `get state(): DeepReadonly<typeof _state> { return _state; }`.
3. **Mutations** only through exposed mutator functions — never direct property writes.
4. **`$derived`** values owned by the composable are exposed via individual `get x()` getters, NOT inside the `$state` object.
5. **Never** return `$derived` via object shorthand (`{ derived }`) — it freezes the value.
6. **Never** return raw `$state` without a getter — it allows uncontrolled mutation.
7. **Never** create wrapper objects inside getters (`{ value: x }`) — it breaks destructuring and creates garbage.

Import `DeepReadonly` from `$lib/types/deep-readonly`.
```

---

## Files to Modify

| File | Change |
|---|---|
| `src/lib/types/deep-readonly.ts` | **NEW** — `DeepReadonly<T>` utility type |
| `src/lib/components/entity-list-table/composables/useSheetPanelManagement.svelte.ts` | Remove `{ value: ... }` wrapper, apply standard pattern |
| `src/lib/components/entity-list-table/composables/useColumnOrder.svelte.ts` | Apply standard pattern, add `applyColumnVisibility()` mutator |
| `src/lib/components/entity-list-table/composables/useDialogs.svelte.ts` | Consolidate 9 `$state` vars into `_state`, apply standard pattern |
| `src/lib/components/entity-list-table/composables/useEntityMetadata.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useBulkActions.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useExport.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/usePreviewPanel.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useRowRangeSelection.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useScrollPreservation.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useStickyColumns.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useToolbarMode.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useViewMode.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useDeletionFilter.svelte.ts` | Apply standard pattern |
| `src/lib/components/entity-list-table/composables/useFilterPersistence.svelte.ts` | Apply standard pattern (minimal — only `$derived` keys) |
| `src/lib/components/entity-list-table/EntityListTable.svelte` | Update all consumer access sites: `composable.X` → `composable.state.X` for reads; fix `orderState` direct mutation → `columnOrder.applyColumnVisibility()`; fix `sheetPanelManagement.lastPanelId.value` → `sheetPanelManagement.state.lastPanelId`; **wire in `useClientSelection`** (Step 8.1); **wire in `useKeyboardNavigation`** (Step 8.2); remove ~120 lines of inline duplicated logic |
| `src/lib/components/entity-list-table/composables/useClientSelection.svelte.ts` | Apply standard pattern; add missing effects (clamp page, exit on empty selection); add bindable getters/setters for `showSelectedOnly` and `clientSelectedPage` |
| `src/lib/components/entity-list-table/composables/useKeyboardNavigation.svelte.ts` | Update signature to accept getter functions; remove unused `navigatingToNextPage`/`navigatingToPrevPage` params; apply standard pattern |
| `src/lib/components/entity-list-table/composables/useSelection.svelte.ts` | Apply standard `get state(): DeepReadonly` pattern. **DO NOT DELETE** — kept for future wiring (Step 8.3) |
| `src/lib/components/entity-list-table/composables/useSorting.svelte.ts` | Apply standard pattern. **DO NOT DELETE** — kept for future wiring (Step 8.3) |
| `src/lib/components/entity-list-table/composables/useFilters.svelte.ts` | Apply standard pattern. **DO NOT DELETE** — kept for future wiring (Step 8.3) |
| `src/lib/components/entity-list-table/composables/index.ts` | No changes to exports (all composables kept) |
| `src/lib/shell/sheets/panels/VersionsPanel.svelte` | Remove unused `useHealthChip` import |
| `src/routes/(app)/system/settings/profile/+page.svelte` | Update `metadata.X` → `metadata.state.X` for reads |
| `src/routes/(app)/system/settings/users/create/+page.svelte` | Update `entityMetadata.X` → `entityMetadata.state.X` for reads |
| `src/routes/(app)/system/settings/security/+page.svelte` | Update `metadata.X` → `metadata.state.X` for reads |
| `AGENTS.md` | Document the standard pattern |

---

## Dead code note — RESOLVED in Step 8

The following 6 composables were exported but had **zero consumers** — this was caused by an incomplete refactoring of `EntityListTable.svelte`. Step 8 above resolves this:

- `useClientSelection` → **wired in NOW** (Step 8.1) — replaces ~50 lines of inline state/derived/effects
- `useKeyboardNavigation` → **wired in NOW** (Step 8.2) — replaces ~70 lines of broken inline handler + fixes keyboard nav
- `useSelection` → **KEPT for future wiring** (Step 8.3) — intended architecture: component owns selection state. Parent ownership is NOT intrinsic (no parent uses `bind:selectedKeys`; all use one-way prop + callback). Future wiring will eliminate ~30 lines of boilerplate per parent page.
- `useSorting` → **KEPT for future wiring** (Step 8.3) — same rationale. `syncWithExternal` designed for parent sync.
- `useFilters` → **KEPT for future wiring** (Step 8.3) — same rationale.
- `useAdvancedFilters` → **KEPT for future wiring** (Step 8.3) — same rationale.

---

## Verification

- [ ] `pnpm run check` passes (typecheck — verifies `DeepReadonly` blocks mutations)
- [ ] `pnpm run build` passes (production build)
- [ ] Manual test: EntityListTable renders, column reordering works, dialogs open/close, export works, preview panel works
- [ ] Manual test: **Keyboard navigation works** — ArrowUp/ArrowDown moves focused row, ArrowLeft/ArrowRight navigates preview, Space toggles selection, Enter opens dropdown, Escape closes (this was BROKEN in the inline handler — verify it now works after wiring `useKeyboardNavigation`)
- [ ] Manual test: **"Show selected only" toggle works** — click the toggle in footer, verify only selected rows show with client-side paging, verify exiting on server reload, verify page clamping when selection shrinks (after wiring `useClientSelection`)
- [ ] Manual test: SidebarHealthBadge updates when backend status changes (already fixed in `84e1224`, verify still works)
- [ ] Manual test: VersionsPanel renders correctly, no console errors from removed import
- [ ] Manual test: Profile page metadata loads and displays
- [ ] Verify `useSelection`, `useSorting`, `useFilters`, `useAdvancedFilters` still compile after standard pattern refactor (they're kept for future wiring, not deleted)

## Risks/Considerations

1. **Large blast radius:** `EntityListTable.svelte` has 100+ dot-notation accesses on composable properties. All state reads must change from `composable.X` to `composable.state.X`. This is a mechanical but voluminous change. **Mitigation:** Apply composables one at a time, run `pnpm run check` after each to catch missed access sites.

2. **`DeepReadonly` is compile-time only:** JavaScript consumers (if any) can still mutate. This is acceptable — the codebase is TypeScript-first, and the `AGENTS.md` rule enforces the pattern.

3. **`$derived` values cannot live inside `$state`:** The standard pattern separates `$state` (in `_state` object) from `$derived` (individual getters). Composables with both must expose both `get state()` and `get derivedX()`.

4. **`useRowRangeSelection` and `useStickyColumns` have non-`$state` internal variables** (`selectionSnapshotAtMouseDown`, `stickyRO`, `updatingStickyOffsets`). These are plain variables, not reactive — they stay as internal implementation details and are not exposed.

5. **`useFilterPersistence` has no `$state`** — only `$derived` storage keys and pure functions. The standard pattern applies minimally (just expose the `$derived` keys via getters, which it already does).

6. **`useClientSelection` has `bind:` requirements** — `showSelectedOnly` and `clientSelectedPage` are bound to `EntityListTableFooter` via `bind:`. The standard `DeepReadonly` pattern would make these read-only. Solution: expose them as individual get/set pairs alongside the `get state()` getter, so `bind:` works while the `_state` object itself remains protected.

7. **`useKeyboardNavigation` signature change is breaking** — the composable currently takes 28 raw parameters. Changing to getter-function options object is a breaking signature change, but since the composable has zero consumers, this is safe.

8. **The inline `handleGlobalKeyDown` is already broken** — the ArrowUp/ArrowDown handlers have empty if/else bodies (gutted during the incomplete refactoring). Wiring in `useKeyboardNavigation` will FIX this bug, but it means the keyboard behavior will change (arrows will actually work). This is a positive change but should be manually tested.

9. **`viewRows` derivation is split between two concerns** — when `showSelectedOnly` is true, `viewRows` comes from client selection (sliced selected rows); otherwise it comes from server data (`rows`). The `useClientSelection` composable returns its own `viewRows`, but the component also needs the server `rows` for non-selection mode. The final `viewRows` must be computed in the component, bridging both: `$derived(rowSelectionEnabled && clientSelection.showSelectedOnly ? clientSelection.viewRows : rows ?? [])`.

6. **`useSelection`, `useSorting`, `useFilters`, `useAdvancedFilters` are kept but not wired** — they represent the intended future architecture (component-owned UI state) but wiring them requires changing EntityListTable's public API and updating all 3 parent pages. This is documented as a future step (Step 8.3), not done in this plan. The composables should be refactored to the standard `get state(): DeepReadonly` pattern for consistency but remain unwired.

---

## Step 8: Wire unused composables into EntityListTable.svelte to reduce its size

### Empirical evidence: the refactoring was abandoned mid-way

`EntityListTable.svelte` is **1250 lines**. During a prior refactoring session, 6 composables were created to extract logic from the component, and several sub-components + handler files were extracted. But the composables were **never wired in** — the original inline logic remains in the component, duplicating what the composables already encapsulate.

| Composable (unused) | What it encapsulates | Inline duplicate in EntityListTable.svelte | Lines saved (approx) |
|---|---|---|---|
| `useClientSelection` | `showSelectedOnly`, `clientSelectedPage`, `selectedRowByKey` state + `$effect` for row merge + `$derived` for `orderedSelectedRows`, `clientSelectedTotalPages`, `viewRows`, `hasDeletedSelected`, `allSelectedDeleted` + exit-on-reload effect | Lines 762-820, 960-977, 1027-1047 (~50 lines of state + derived + effects) | ~50 |
| `useKeyboardNavigation` | `focusedRowIndex` state + `handleGlobalKeyDown` function + scroll-into-view `$effect` | Lines 508-577 (~70 lines — the entire keyboard handler is inline AND duplicated in the composable) | ~70 |
| `useSelection` | `selectedKeys` state + `toggleRowSelect`, `toggleAllRows`, `clearSelection`, `isRowSelected`, `syncWithExternal` + `allSelected`/`someSelected` derived | Partially replaced by `createSelectionHandlers` (handlers/selection.ts) — but the composable also owns the state, which is still a `$bindable` prop in the component | N/A (see analysis below) |
| `useSorting` | `currentSort` state + `handleSort`, `getSortDirection`, `isSortable`, `syncWithExternal` | Partially replaced by `createSortingHandlers` (handlers/sorting.ts) — but the composable also owns the state, which is still a `$bindable` prop in the component | N/A (see analysis below) |
| `useFilters` | `filterValues` state + `updateFilterValue`, `clearFilter`, `clearAllFilters` + `hasActiveFilters` derived | `filterValues` is a `$bindable` prop in the component; filter mutations are delegated to parent via `onFilterValuesChange` | N/A (see analysis below) |
| `useAdvancedFilters` | `advancedFilters` state + `addFilter`, `removeFilter`, `updateFilter`, `clearAdvancedFilters` + `hasAdvancedFilters` derived | `advancedFilters` is a `$bindable` prop in the component; filter mutations are delegated to parent via `onAdvancedFiltersChange` | N/A (see analysis below) |

### Detailed analysis per composable

#### 8a. `useClientSelection` — DIRECT REPLACEMENT (highest impact)

**This is the clearest win.** The composable at `composables/useClientSelection.svelte.ts` (90 lines) encapsulates exactly the logic that's inline at `EntityListTable.svelte` lines 762-820, 960-977, 1027-1047.

**Inline in EntityListTable.svelte (what to remove):**

```
Lines 762-764:  let showSelectedOnly = $state(false);
                let clientSelectedPage = $state(1);
                let selectedRowByKey = $state(new Map<string, TRow>());

Lines 766-780:  const orderedSelectedRows = $derived(...)
                const hasDeletedSelected = $derived(...)
                const allSelectedDeleted = $derived(...)
                const clientSelectedTotalPages = $derived(...)

Lines 793-800:  const viewRows = $derived(showSelectedOnly ? orderedSelectedRows.slice(...) : rows)

Lines 813-821:  let prevRowsLoadingForServerList = $state(false);
                $effect(() => { ... exit on server reload ... })

Lines 960-977:  $effect(() => { ... merge rows into selection map ... })

Lines 1027-1047: $effect(() => { ... exit when selection empty/disabled ... })
                $effect(() => { ... clamp clientSelectedPage ... })
```

**Composable equivalent (already written, just needs wiring):**

`useClientSelection<T>` takes `selectedKeys`, `rows`, `rowKey`, `pageSize`, `rowsLoading` and returns:
- `showSelectedOnly`, `clientSelectedPage` (state)
- `orderedSelectedRows`, `clientSelectedTotalPages`, `viewRows` (derived)
- `hasDeletedSelected`, `allSelectedDeleted` (derived)
- `toggle()` (mutator)

**Problem: `bind:` compatibility.** The component uses `bind:showSelectedOnly` and `bind:clientSelectedPage` at lines 1204, 1212 to pass to `EntityListTableFooter`. With the standard pattern (`get state(): DeepReadonly`), these would be read-only. The footer needs to mutate `showSelectedOnly` (toggle button) and `clientSelectedPage` (page navigation).

**Solution:** Expose `showSelectedOnly` and `clientSelectedPage` as bindable via individual setters:
```ts
return {
  get state(): DeepReadonly<typeof _state> { return _state; },
  get showSelectedOnly() { return _state.showSelectedOnly; },
  set showSelectedOnly(v: boolean) { _state.showSelectedOnly = v; if (v) _state.clientSelectedPage = 1; },
  get clientSelectedPage() { return _state.clientSelectedPage; },
  set clientSelectedPage(v: number) { _state.clientSelectedPage = v; },
  toggle,
};
```

**Additional inline logic not in the composable (must be added to composable or kept inline):**

1. **Clamp `clientSelectedPage`** (lines 1040-1047) — when `orderedSelectedRows.length` shrinks below current page. The composable does NOT have this effect. **Action:** Add to composable.
2. **Exit when selection empty/disabled** (lines 1027-1038) — resets `showSelectedOnly` when `selectedKeys` becomes empty or `rowSelectionEnabled` is false. The composable does NOT have this. **Action:** Add to composable.
3. **`footerUsesClientPaging`, `footerPage`, `footerTotalPages`, `footerRangeTotal`, `footerRangeStart`, `footerRangeEnd`** (lines 782-791) — these are footer-specific derived values that depend on both client selection state AND server pagination state. They should stay in the component (they bridge two concerns).

**Net effect:** ~50 lines removed from EntityListTable.svelte, replaced by ~5 lines of composable instantiation.

#### 8b. `useKeyboardNavigation` — DIRECT REPLACEMENT (second highest impact)

**The inline `handleGlobalKeyDown` at lines 517-577 is a BROKEN DUPLICATE of the composable.** Compare:

**Inline (EntityListTable.svelte lines 539-548):**
```ts
if (e.key === 'ArrowDown') {
  e.preventDefault();
  if (previewPanel.focusedRowIndex === null) {
    // focusedRowIndex is managed by previewPanel composable
  } else if (previewPanel.focusedRowIndex < viewRows.length - 1) {
    // focusedRowIndex is managed by previewPanel composable
  }
  // ... NO actual index increment happens — the if/else bodies are EMPTY comments!
```

The inline handler has **empty if/else bodies** — the arrow key handling is broken. It was gutted during the partial refactoring (the logic was moved to the composable but the inline function was left as a stub with comments).

**Composable (`useKeyboardNavigation` lines 54-71):**
```ts
if (e.key === 'ArrowDown') {
  e.preventDefault();
  if (focusedRowIndex === null) {
    focusedRowIndex = 0;
  } else if (focusedRowIndex < viewRows.length - 1) {
    focusedRowIndex++;
  } else if (focusedRowIndex === viewRows.length - 1 && page < totalPages) {
    setNavigatingToNextPage(true);
    if (footerUsesClientPaging) {
      setClientSelectedPage(clientSelectedPage + 1);
    } else {
      onPageChange(page + 1);
    }
  }
  if (previewPanelOpen && focusedRowIndex !== null) {
    setPreviewRow(viewRows[focusedRowIndex], focusedRowIndex);
  }
}
```

The composable has the **full, working implementation** including page boundary navigation.

**Also duplicated:** The scroll-into-view `$effect` at lines 509-515 (inline) vs lines 111-117 (composable). Both track `focusedRowIndex`/`previewRowIndex` and scroll the row into view.

**Problem: parameter mismatch.** The composable takes 28 parameters (many as raw values, not getters). The component has these values spread across props, composables, and local state. The composable signature needs to be updated to accept getter functions (like the other composables do, e.g., `useExport` takes `entity: () => string`).

**Action:**
1. Update `useKeyboardNavigation` signature to accept getter functions instead of raw values.
2. Remove inline `handleGlobalKeyDown` (lines 517-577) and scroll `$effect` (lines 509-515).
3. Wire in the composable.
4. The `<svelte:window onkeydown={handleGlobalKeyDown} />` at line 1050 uses the composable's returned handler.

**Net effect:** ~70 lines removed from EntityListTable.svelte, AND the broken keyboard navigation is fixed.

#### 8c. `useSelection` — FUTURE WIRING (component-owned state is the intended architecture)

**Empirical finding:** `selectedKeys` is declared as `$bindable` in EntityListTable (line 180), but **NO parent page actually uses `bind:selectedKeys`**. All 3 parent pages (customers, users, organizations) pass it as one-way `selectedKeys={selectedKeys}` + `onSelectedKeysChange` callback. The `$bindable` is unused.

**Why the parent owns this state currently:** Every parent page declares `let selectedKeys = $state<string[]>([])` and writes an `onSelectedKeysChange` handler. This is boilerplate duplicated across all 3 pages.

**Why the composable was created:** `useSelection` was designed to let the component own the selection state internally, with `syncWithExternal(keys)` for parent-to-component sync (e.g., clearing selection after a bulk action). This eliminates the per-page boilerplate.

**Why it's not wired in this plan:** Wiring it changes the public API of EntityListTable — `selectedKeys` would change from a prop to internal state, and parents would use `onSelectedKeysChange` to read it + `syncWithExternal` (or a new method) to write it. All 3 parent pages would need updating. This is a larger scope change that should be done as a dedicated refactoring step, not bundled with the state exposure pattern standardization.

**Action:** KEEP the composable. Do NOT delete it. Document it as the intended future architecture. Wire it in a future step that updates all parent pages.

#### 8d. `useSorting` — FUTURE WIRING (same rationale as useSelection)

**Empirical finding:** `sortKey` and `sortDir` are NOT `$bindable` — they're one-way props. All 3 parent pages declare `let sortKey = $state(...)`, `let sortDir = $state(...)`, write `onSortChange` handlers, and persist/restore sort to/from sessionStorage. This is ~30 lines of identical boilerplate per page.

**Why the composable was created:** `useSorting` owns the sort state internally, calls `onSortChange` to notify the parent (who re-fetches), and has `syncWithExternal(sort)` for when the parent needs to push sort state in (e.g., restore from sessionStorage). The composable also encapsulates the sort toggle logic (asc → desc → clear).

**Why it's not wired in this plan:** Same as `useSelection` — changes the public API, requires updating all parent pages.

**Action:** KEEP the composable. Do NOT delete it. Wire it in a future refactoring step.

#### 8e. `useFilters` / `useAdvancedFilters` — FUTURE WIRING (same rationale)

**Empirical finding:** `filterValues` and `advancedFilters` are NOT `$bindable` — they're one-way props with defaults. All parent pages declare the state, write change handlers, and use the values in `loadRows()` to build API query parameters. Same boilerplate pattern.

**Why the composables were created:** Same rationale — move filter state management into the component, notify parent via callbacks, sync externally when needed.

**Action:** KEEP both composables. Do NOT delete them. Wire them in a future refactoring step.

### Summary: what to wire in, what to keep for future

| Composable | Action | Reason | Lines saved |
|---|---|---|---|
| `useClientSelection` | **Wire in NOW** (Step 8.1) | Client-only state, no parent dependency, inline code is a direct duplicate | ~50 lines from EntityListTable |
| `useKeyboardNavigation` | **Wire in NOW** (Step 8.2) | Client-only logic, inline handler is broken (empty if/else bodies) | ~70 lines from EntityListTable |
| `useSelection` | **KEEP for future wiring** | Intended architecture: component owns selection state. Currently parent owns state (one-way prop + callback, NOT `bind:`). Wiring requires changing public API + updating all 3 parent pages. | 0 (future: ~30 lines/page × 3 pages) |
| `useSorting` | **KEEP for future wiring** | Same — `syncWithExternal` for parent sync. Eliminates sort boilerplate per parent page. | 0 (future: ~30 lines/page × 3 pages) |
| `useFilters` | **KEEP for future wiring** | Same — component owns filter state, parent notified via callback. | 0 (future) |
| `useAdvancedFilters` | **KEEP for future wiring** | Same — component owns advanced filter state. | 0 (future) |

**Total reduction (this plan):** ~120 lines removed from EntityListTable.svelte (from 1250 → ~1130), plus the broken keyboard navigation is fixed.

**Future reduction (when useSelection/useSorting/useFilters are wired):** ~30-40 lines of boilerplate removed from EACH of the 3 parent pages (customers, users, organizations) = ~90-120 lines total across the codebase, plus EntityListTable's prop count drops by ~8 props.

### Implementation sub-steps for Step 8

#### 8.1: Wire `useClientSelection` into EntityListTable.svelte

**File:** `EntityListTable.svelte`

1. Add import: `import { useClientSelection } from './composables';`
2. Instantiate after `selectedKeys` is available:
```ts
const clientSelection = useClientSelection<TRow>(
  () => selectedKeys,
  () => rows ?? [],
  rowKey,
  () => pageSize,
  () => rowsLoading
);
```
3. Remove inline state (lines 762-764), derived (lines 766-800), effects (lines 813-821, 960-977, 1027-1047).
4. Replace all references:
   - `showSelectedOnly` → `clientSelection.showSelectedOnly` (or `clientSelection.state.showSelectedOnly`)
   - `clientSelectedPage` → `clientSelection.clientSelectedPage`
   - `orderedSelectedRows` → `clientSelection.orderedSelectedRows`
   - `hasDeletedSelected` → `clientSelection.hasDeletedSelected`
   - `allSelectedDeleted` → `clientSelection.allSelectedDeleted`
   - `viewRows` → `clientSelection.viewRows` (but only when `rowSelectionEnabled && showSelectedOnly`; otherwise `rows`)
5. Add missing effects to the composable:
   - Clamp `clientSelectedPage` when `orderedSelectedRows.length` shrinks
   - Exit `showSelectedOnly` when `selectedKeys` is empty or `rowSelectionEnabled` is false
6. Update `bind:` references at lines 1204, 1212 to use the composable's bindable getters/setters.
7. Update `useClientSelection` to the standard `get state(): DeepReadonly` pattern + bindable getters for `showSelectedOnly` and `clientSelectedPage`.

#### 8.2: Wire `useKeyboardNavigation` into EntityListTable.svelte

**File:** `composables/useKeyboardNavigation.svelte.ts` + `EntityListTable.svelte`

1. Update composable signature to accept getter functions:
```ts
export function useKeyboardNavigation<T>(options: {
  viewRows: () => T[];
  rowSelectionEnabled: () => boolean;
  selectedKeys: () => string[];
  onSelectedKeysChange: (keys: string[]) => void;
  rowKey: (row: T) => string;
  previewPanelOpen: () => boolean;
  previewRowIndex: () => number;
  previewRow: () => T | null;
  setPreviewRow: (row: T, index: number) => void;
  navigatePreview: (direction: number) => void;
  dropdownMenuRow: () => T | null;
  previewDropdownOpen: () => boolean;
  closeRowDropdown: () => void;
  page: () => number;
  pageSize: () => number;
  totalPages: () => number;
  onPageChange: (p: number) => void;
  openRowDropdown: (row: T) => void;
  footerUsesClientPaging: () => boolean;
  clientSelectedPage: () => number;
  setClientSelectedPage: (page: number) => void;
  toggleRowSelect: (key: string) => void;
  tableRef: () => HTMLTableElement | null;
})
```
2. Remove the `navigatingToNextPage`/`navigatingToPrevPage` parameters — they were never used in the inline handler and add complexity without value.
3. Apply the standard `get state(): DeepReadonly` pattern (expose `focusedRowIndex` via state getter).
4. In `EntityListTable.svelte`:
   - Add import: `import { useKeyboardNavigation } from './composables';`
   - Instantiate with getter functions.
   - Remove inline `handleGlobalKeyDown` (lines 517-577).
   - Remove inline scroll `$effect` (lines 509-515).
   - Update `<svelte:window onkeydown={...}>` at line 1050 to use the composable's handler.

#### 8.3: Keep `useSelection`, `useSorting`, `useFilters`, `useAdvancedFilters` for future wiring

**DO NOT DELETE these composables.** They represent the intended future architecture where EntityListTable owns its UI interaction state (selection, sort, filters) instead of requiring every parent page to declare and manage the same boilerplate.

**Empirical evidence that parent ownership is NOT intrinsic:**

| State | Is `$bindable`? | Do parents use `bind:`? | Parent needs state for? |
|---|---|---|---|
| `selectedKeys` | Yes (line 180) | **NO** — all 3 pages use one-way `selectedKeys={selectedKeys}` + `onSelectedKeysChange` | Bulk actions, passing to API |
| `sortKey` | No (line 174) | N/A — one-way prop | API query parameter |
| `sortDir` | No (line 175) | N/A — one-way prop | API query parameter |
| `filterValues` | No (line 191) | N/A — one-way prop with default | API query parameters |
| `advancedFilters` | No (line 194) | N/A — one-way prop with default | API query parameters |

**Key finding:** `selectedKeys` is `$bindable` but NO parent uses `bind:selectedKeys`. All parents use one-way prop + callback. The `$bindable` is dead — it was likely declared in anticipation of the composable refactoring that was never completed.

**The composables were designed with `syncWithExternal` for exactly this use case:**
- `useSelection.syncWithExternal(keys: string[])` — parent can push selection into the component (e.g., clear after bulk action)
- `useSorting.syncWithExternal(sort: { key, direction } | null)` — parent can push sort state (e.g., restore from sessionStorage)

**Future wiring plan (NOT part of this plan, but documented for the next session):**
1. EntityListTable owns `selectedKeys`, `sortKey`, `sortDir`, `filterValues`, `advancedFilters` internally via composables
2. Parent passes `initialSelectedKeys`, `initialSort`, `initialFilterValues`, `initialAdvancedFilters` as one-way props (for initialization only)
3. Parent receives changes via `onSelectedKeysChange`, `onSortChange`, `onFilterValuesChange`, `onAdvancedFiltersChange` callbacks (already exist)
4. Parent can push state changes via `syncWithExternal` methods (for clearing selection, restoring from URL params, etc.)
5. This eliminates ~30-40 lines of state declaration + handler boilerplate from each of the 3 parent pages

**Action for this plan:** Apply the standard `get state(): DeepReadonly` pattern to these 4 composables for consistency, but do NOT wire them into EntityListTable yet. Do NOT delete them.
