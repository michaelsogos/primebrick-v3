# EntityListTable `state_referenced_locally` Warnings — Fix Plan (v2, empirically verified)

**Date:** 2026-07-04 (revised after empirical verification)
**File:** `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Warnings:** 24 `state_referenced_locally` compiler warnings
**Stack:** Svelte 5.56.0 + SvelteKit + TypeScript

---

## What the warning means

> "This reference only captures the initial value of `%name%`. Did you mean to reference it
> inside a `%type%` instead?" — https://svelte.dev/e/state_referenced_locally

The compiler fires when a reactive prop is passed **directly** as an argument to a
function/composable. The function captures the **initial value** at call time (component init).
If the prop later changes, the function keeps using the stale initial value.

**Key insight:** The warning is about *potential* staleness. Whether it's a *real bug* depends on
whether the prop actually changes at runtime. This plan verifies each case empirically.

---

## Empirical evidence — what actually changes at runtime

### Prop value stability (verified against BE meta files + 3 parent pages)

| Prop | Parent assignment | Initial value | Value after meta load | Changes? | Source |
|---|---|---|---|---|---|
| `uid` | `uid={meta?.uid ?? 'uuid'}` | `'uuid'` | `'uuid'` (meta.uid is ALWAYS `"uuid"`) | **NO** | All 3 meta files: `uid: "uuid"` |
| `columnOrderStorageKey` | `columnOrderStorageKey={skColumnOrder}` | `'pb:users:list:columnOrder'` | same | **NO** | Constant string in all 3 pages |
| `viewModeStorageKey` | `$derived(columnOrderStorageKey ? ... : ...)` | `'pb:users:list:columnOrder:viewMode'` | same | **NO** | `columnOrderStorageKey` always set → `uid` fallback branch never taken |
| `defaultSort` | `defaultSort={meta?.list.defaultSort}` | `undefined` | `{ key: "created_at", dir: "desc" }` | **YES** | `meta = $state(null)`, loaded async via `loadMeta()` |
| `defaultSortDir` | `$derived(defaultSort?.dir ?? 'asc')` | `'asc'` | `'desc'` | **YES** | Derived from `defaultSort` |
| `deletionFilterModeProp` | `{deletionFilterMode}` or default | `'non_deleted'` | `'non_deleted'` (only changed via composable callback) | **NO** | Parent only changes it through `onDeletionFilterModeChange` which goes through the composable |

### Callback identity stability (verified in all 3 parent pages)

| Callback | How it's declared | Identity stable? | Source |
|---|---|---|---|
| `onPageChange` | `function onPageChange(p) {...}` | **YES** — function declaration, created once | users:414, orgs:672, customers:706 |
| `onSelectedKeysChange` | `function onSelectedKeysChange(keys) {...}` | **YES** | users:434, orgs:678, customers:712 |
| `onSortChange` | `function onSortChange(key, dir) {...}` | **YES** | users:406, orgs:666, customers:700 |
| `onVisibleKeysChange` | `function onVisibleKeysChange(keys) {...}` | **YES** | users:425, orgs:675, customers:709 |
| `onSearchInKeysChange` | `function onSearchInKeysChange(keys) {...}` | **YES** | users:397, orgs:663, customers:697 |
| `onResetColumnVisibility` | `function onResetColumnVisibility(view) {...}` | **YES** | users:430, orgs:658, customers:718 |
| `onFilterValuesChange` | `function onFilterValuesChange(values) {...}` | **YES** | users:438, orgs:680, customers:722 |
| `onResetFilters` | `function onResetFilters() {...}` | **YES** | users:451, orgs:693, customers:738 |
| `onAdvancedFiltersChange` | `function onAdvancedFiltersChange(filters, connector) {...}` | **YES** | users:444, orgs:686, customers:725 |
| `onDeletionFilterModeChange` | `function onDeletionFilterModeChange(mode) {...}` | **YES** | users:458, orgs:686, customers:747 |
| `onEditAction` | `onEditAction={openEditUser}` (named ref) | **YES** | users:571, orgs:726 |
| `onRefresh` | `onRefresh={() => void refreshRows()}` (inline arrow) | **YES** — `refreshRows` is `async function` (not reactive), so the template effect has no reactive deps and runs once | users:602, orgs:753, customers:816 |
| `customActionHandlers` | `customActionHandlers={{ changePassword: (row) => {...} }}` (inline object) | **YES** — object literal has no reactive reads in its expression; created once. Inner function captures `$state` proxies (stable refs) | users:564-569 only |

**Why inline arrows are stable here:** In Svelte 5, template attribute expressions are compiled
into effects. The effect for `onRefresh={() => void refreshRows()}` tracks reactive reads in the
expression. `refreshRows` is an `async function` declaration (not `$state`/`$derived`), so it's
NOT reactive. The effect has zero dependencies tracking, runs once, and the arrow identity is
stable for the component's lifetime.

### Composable/handler consumer scope (verified)

All 10 composables and 3 handler factories are used **ONLY** by `EntityListTable.svelte` — no
external consumers. Changing their signatures is safe.

**Source:** grep for `createSortingHandlers|createSelectionHandlers|createClickHandlers` and
`useColumnOrder|useViewMode|useDeletionFilter|...` — only matches in `EntityListTable.svelte`
and the `composables/index.ts` barrel + the composable/handler files themselves.

---

## Revised warning classification

### REAL BUGS — 2 warnings (MUST FIX)

| Line | Prop | Passed to | Bug |
|---|---|---|---|
| 487 | `defaultSort` | `createSortingHandlers` | Captured as `undefined` at init. After meta loads, becomes `{ key: "created_at", dir: "desc" }`. `resetColumnsAndSorting()` uses stale `undefined` → calls `onSortChange(null, 'asc')` instead of `onSortChange('created_at', 'desc')`. **Effect:** After clicking "reset columns/sorting", the sort indicator shows no active sort column (UI inconsistency — the API call still works because the parent falls back to `defaultSortKey`/`defaultSortDir` from meta when `sortKey === null`). |
| 488 | `defaultSortDir` | `createSortingHandlers` | Captured as `'asc'` at init. After meta loads, becomes `'desc'`. `handleSortClick()` third-click reset and `resetColumnsAndSorting()` use stale `'asc'` → `sortDir` state set to `'asc'` instead of `'desc'`. **Effect:** Sort direction indicator may show wrong direction after reset. |

**Bug severity:** LOW-MEDIUM. The API calls are correct (parent falls back to meta defaults when
`sortKey === null`). The visible effect is a UI inconsistency in the sort indicator after
clicking "reset columns/sorting" or the third click on a column header.

### FALSE POSITIVES — 22 warnings (value never changes or callback identity is stable)

#### Group FP-1: Value never changes (4 warnings)

| Line | Prop | Why it's stable |
|---|---|---|
| 116 | `columnOrderStorageKey` → `useColumnOrder` | Constant string in all 3 parent pages (`'pb:users:list:columnOrder'` etc.) |
| 185 | `viewModeStorageKey` → `useViewMode` | `$derived` from constant `columnOrderStorageKey`; the `uid` fallback branch is never taken |
| 191 | `uid` → `useDeletionFilter` | `meta.uid` is always `"uuid"` in all 3 BE meta files; AND the `uid` fallback branch is never taken (columnOrderStorageKey always set) |
| 192 | `columnOrderStorageKey` → `useDeletionFilter` | Constant string |

#### Group FP-2: Callback identity is stable (18 warnings)

| Line | Prop | Passed to | Why it's stable |
|---|---|---|---|
| 194 | `onDeletionFilterModeChange` | `useDeletionFilter` | `function` declaration in parent |
| 204 | `onSearchInKeysChange` | `useSheetPanels` | `function` declaration |
| 205 | `onVisibleKeysChange` | `useSheetPanels` | `function` declaration |
| 206 | `onResetColumnVisibility` | `useSheetPanels` | `function` declaration |
| 213 | `onFilterValuesChange` | `useSheetPanels` | `function` declaration |
| 214 | `onResetFilters` | `useSheetPanels` | `function` declaration |
| 216 | `onAdvancedFiltersChange` | `useSheetPanels` | `function` declaration |
| 384 | `onRefresh` | `usePreviewPanel` | Inline arrow wrapping `async function refreshRows` (non-reactive) |
| 404 | `onRefresh` | `useBulkActions` | Same |
| 424 | `onEditAction` | `useRowActions` | Named function ref (`openEditUser`) |
| 425 | `onRefresh` | `useRowActions` | Same as above |
| 433 | `customActionHandlers` | `useRowActions` | Inline object, no reactive deps in expression, created once |
| 451 | `onSelectedKeysChange` | `createSelectionHandlers` | `function` declaration |
| 461 | `onSelectedKeysChange` | `useKeyboardNavigation` | `function` declaration |
| 475 | `onPageChange` | `useKeyboardNavigation` | `function` declaration |
| 489 | `onResetColumnVisibility` | `createSortingHandlers` | `function` declaration |
| 490 | `onSortChange` | `createSortingHandlers` | `function` declaration |
| 497 | `onFilterValuesChange` | `createSortingHandlers` | `function` declaration |
| 498 | `onAdvancedFiltersChange` | `createSortingHandlers` | `function` declaration |
| 499 | `onResetFilters` | `createSortingHandlers` | `function` declaration |

---

## Fix options

### Option A — Fix only the 2 real bugs (RECOMMENDED)

**Scope:** 2 files, minimal change, fixes the actual bug.

**File 1:** `handlers/sorting.ts` — change `defaultSort` and `defaultSortDir` from raw values to
getters:

```ts
export function createSortingHandlers(
  columnOrder: any,
  defaultSort: () => { key: string; dir?: 'asc' | 'desc' } | undefined,  // was: raw value
  defaultSortDir: () => 'asc' | 'desc',                                   // was: raw value
  onResetColumnVisibility: (view: 'table' | 'cards' | 'cards_list') => void,
  onSortChange: (key: string | null, dir: 'asc' | 'desc') => void,
  rowsLoading: () => boolean,
  sortKey: () => string | null,
  sortDir: () => 'asc' | 'desc',
  dataColumns: () => any,
  auditingColumnsGroup: () => any,
  nonAuditingColumns: () => any,
  onFilterValuesChange?: (values: Record<string, any>) => void,
  onAdvancedFiltersChange?: (filters: any[], connector: 'AND' | 'OR') => void,
  onResetFilters?: () => void
)
```

Update `resetColumnsAndSorting()`:
```ts
function resetColumnsAndSorting() {
  onResetColumnVisibility('table');
  columnOrder.reset();
  const ds = defaultSort();
  const dsd = defaultSortDir();
  if (ds?.key) onSortChange(ds.key, ds.dir ?? dsd);
  else onSortChange(null, dsd);
}
```

Update `handleSortClick()`:
```ts
function handleSortClick(col: MetaColumn) {
  if (rowsLoading()) return;
  if (col.sortable === false) return;
  if (sortKey() !== col.key) {
    onSortChange(col.key, 'asc');
  } else if (sortDir() === 'asc') {
    onSortChange(col.key, 'desc');
  } else {
    onSortChange(null, defaultSortDir());
  }
}
```

**File 2:** `EntityListTable.svelte` — update call site (lines 485-500):

```ts
const sortingHandlers = createSortingHandlers(
  columnOrder,
  () => defaultSort,          // was: defaultSort
  () => defaultSortDir,       // was: defaultSortDir
  onResetColumnVisibility,
  onSortChange,
  () => rowsLoading,
  () => sortKey,
  () => sortDir,
  () => dataColumns,
  () => auditingColumnsGroup,
  () => nonAuditingColumns,
  onFilterValuesChange,
  onAdvancedFiltersChange,
  onResetFilters
);
```

**Suppress the remaining 22 false positives** with `// svelte-ignore state_referenced_locally`
comments at each warning line (matching the existing pattern at lines 326, 340-345).

**Pros:**
- Minimal change (2 files + suppressions in 1 file)
- Fixes the actual bug
- No risk of introducing regressions in composables
- Follows existing `// svelte-ignore` pattern already in the file

**Cons:**
- 22 `// svelte-ignore` comments added to `EntityListTable.svelte`
- If a parent page later makes `uid` or a callback dynamic, the suppression would hide a real bug

### Option B — Fix all 24 defensively (original v1 plan)

**Scope:** 11 files — wrap all 24 props in `() => prop` getters, change all composable/handler
signatures to accept getters.

See the v1 plan (sections "Step 1" through "Step 10") for the full change list.

**Pros:**
- Eliminates all 24 warnings without suppressions
- Future-proof — if any prop becomes dynamic later, the composable will read the current value
- Consistent with the `() => prop` pattern already used for data props in the file

**Cons:**
- 11 files changed (higher regression risk)
- Changes 10 composable/handler signatures
- Most changes (22 of 24) fix false positives — no behavioral change

### Option C — Hybrid (fix bugs + wrap only the 2 buggy props)

Same as Option A but instead of suppressing the 22 false positives, also wrap them in `() => prop`
getters **without** changing composable signatures (the composables would still receive raw
values, but the wrapping silences the compiler warning).

**Not viable** — wrapping in `() => prop` without changing the composable signature means the
composable receives a function instead of a value, which breaks the composable. The composable
signature MUST change to accept getters.

---

## Recommendation

**Option A** — fix the 2 real bugs in `createSortingHandlers`, suppress the 22 false positives
with `// svelte-ignore state_referenced_locally`.

**Rationale:**
1. The 22 false positives are empirically verified to be stable (see evidence above).
2. Option B changes 11 files for zero behavioral improvement on 22 of 24 warnings.
3. The existing file already uses `// svelte-ignore state_referenced_locally` for the same
   pattern (lines 326, 340-345), so suppression is consistent with codebase conventions.
4. If a parent page later makes a prop dynamic, the `// svelte-ignore` can be removed and the
   composable updated at that time.

---

## Acceptance criteria (Option A)

1. `pnpm run check` (svelte-check) passes with zero `state_referenced_locally` warnings for
   `EntityListTable.svelte`.
2. `pnpm run build` succeeds.
3. Manual verification: load `/system/settings/users`, wait for meta to load, click "reset
   columns/sorting" → the sort indicator shows `created_at desc` (not empty / not `asc`).
4. Manual verification: click a column header 3 times (asc → desc → reset) → the sort
   direction resets to `desc` (not `asc`).
5. No behavioral regression in any other functionality.

---

## Files impacted (Option A)

| File | Changes |
|---|---|
| `handlers/sorting.ts` | `defaultSort` and `defaultSortDir` params changed from raw values to getters; 2 internal call sites updated |
| `EntityListTable.svelte` | Call site updated (2 props wrapped in `() =>`); 22 `// svelte-ignore state_referenced_locally` comments added at warning lines |

**Total:** 2 files

---

## Out of scope

- The existing `// svelte-ignore state_referenced_locally` comments at lines 326, 340-345
  (`useRowRangeSelection`, `useFilterPersistence`) — those composables are not in the warning list.
- `useFilterPersistence`, `useRowRangeSelection`, `useClientSelection`, `useStickyColumns`,
  `useScrollPreservation`, `useToolbarMode`, `useExport` — not in the warning list.
- `click-handlers.ts` — receives composables (not raw props), not in the warning list.
- BE meta files — `uid: "uuid"` is correct and will not change.
