# Composables Reactivity Fix Plan — EntityListTable Refactoring

## Date
2026-06-03

## Context
During the `EntityListTable` refactoring, several `.svelte.ts` composables were extracted. They all trigger the Svelte 5 compiler warning:

> This reference only captures the initial value of `X`. Did you mean to reference it inside a closure instead?  
> https://svelte.dev/e/state_referenced_locally

## Root Cause
In `.svelte.ts` files, returning `$state` or `$derived` variables directly in a plain object causes the consumer to capture the **initial value only**, breaking reactivity.

```ts
// BROKEN — consumer sees only initial value
let viewMode = $state<ViewMode>('table');
return { viewMode };
```

## Solution (confirmed by Svelte official documentation via MCP)
Use **getters** (and **setters** where two-way binding is needed) in the returned object.

From Svelte docs (MCP `get-documentation` on `$state` → "Passing state across modules"):
> Since the compiler only operates on one file at a time, if another file imports `count` Svelte doesn't know that it needs to wrap each reference in `$.get` and `$.set`.
>
> This leaves you with two options for sharing state between modules — either don't reassign it... or don't directly export it.
>
> Note that 'functions' is broad — it encompasses properties of proxies and `get`/`set` properties.

Confirmed patterns in this repo:
- `src/lib/hooks/use-clipboard.svelte.ts` — class with getters exposing `#copiedStatus = $state()`
- `src/lib/user-profile-store.svelte.ts` — plain object with `get current() { return ... }` / `set current(v) { ... }`
- `src/lib/components/entity-list-table/composables/useStickyColumns.svelte.ts` — `get stickyLeftOffsets() { return stickyLeftOffsets; }` (the only composable WITHOUT the warning)

```ts
// CORRECT — consumer always sees live value
return {
  get viewMode() { return viewMode; },
  get isTable() { return isTable; },
  setViewMode
};
```

For `bind:ref` two-way binding:
```ts
return {
  get checkboxHeadRef() { return checkboxHeadRef; },
  set checkboxHeadRef(v) { checkboxHeadRef = v; }
};
```

## Files to Modify

| File | Properties to wrap in getters |
|------|------------------------------|
| `useViewMode.svelte.ts` | `viewMode`, `isTable`, `isCards`, `isCardsList` |
| `useClientSelection.svelte.ts` | `showSelectedOnly`, `clientSelectedPage`, `orderedSelectedRows`, `clientSelectedTotalPages`, `viewRows`, `hasDeletedSelected`, `allSelectedDeleted` |
| `useFilterPersistence.svelte.ts` | `filterValuesStorageKeyFull`, `advancedFiltersStorageKeyFull` |
| `useSelection.svelte.ts` | `selectedKeys`, `allSelected`, `someSelected` |
| `useKeyboardNavigation.svelte.ts` | `focusedRowIndex` |
| `useDeletionFilter.svelte.ts` | `deletionFilterMode` |
| `useScrollPreservation.svelte.ts` | `savedTableScrollLeft` |
| `usePreviewPanel.svelte.ts` | `previewPanelOpen`, `previewRow`, `previewRowIndex`, `previewEditMode`, `previewPanelWidth`, `isResizing`, `focusedRowIndex` |
| `useSorting.svelte.ts` | `currentSort` |
| `useFilters.svelte.ts` | `filterValues`, `hasActiveFilters` (useFilters); `advancedFilters`, `globalConnector`, `hasAdvancedFilters` (useAdvancedFilters) |
| `useStickyColumns.svelte.ts` | `checkboxHeadRef` (+ setter for `bind:ref`), `stickyHeadRefs`, `stickyCellRefs` |

## Special Case: `checkboxHeadRef` + `bind:ref`

In `EntityListTable.svelte`:
```svelte
<<Table.Head bind:ref={stickyColumnsState.checkboxHeadRef} ... />
```

`bind:ref` requires a writable binding. Add getter + setter to `useStickyColumns` return.

If `bind:ref` against an object property setter does not work:
1. Add `let localCheckboxRef = $state<<HTMLElement | null>(null);` in `EntityListTable.svelte`
2. Use `bind:ref={localCheckboxRef}`
3. Sync via `$effect`: `stickyColumnsState.checkboxHeadRef = localCheckboxRef`

## Impact Assessment
- Most composables are **not yet imported** by any `.svelte` component (only `useStickyColumns`, `useScrollPreservation`, `useFilterPersistence` are used in `EntityListTable.svelte`).
- The change is **internal to return object structure**; public method signatures remain identical.
- Risk of breaking change is **low** because unused composables have no consumers, and used ones already rely on the values (which currently don't update reactively anyway).

## Verification Steps
1. `pnpm run check` — TypeScript + Svelte type check
2. `pnpm run dev` — confirm warnings are gone in browser console
3. Interactive tests:
   - View mode toggle
   - Row selection (checkboxes, select-all)
   - Sticky columns horizontal scroll
   - Preview panel open/close/navigation
   - Keyboard navigation (arrow keys, Enter, Space, Escape)
   - Filter persistence across reloads

## Notes
- Apply this pattern to **all future composables** in `.svelte.ts` files that return reactive state.
- Methods that do not return reactive values (e.g. `handleSort`, `toggleRowSelect`) do **not** need getters.
- This fix is based on Svelte 5 official documentation retrieved via MCP server `svelte` → tool `get-documentation` on section `$state`.
