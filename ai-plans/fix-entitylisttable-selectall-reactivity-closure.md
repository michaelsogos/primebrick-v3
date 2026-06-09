# Fix: EntityListTable Select-All Reactivity / Closure Bug

## Problem Statement

The select-all checkbox in the header (both table view and card view) does not select or unselect all visible rows. The `onCheckedChange` event fires, `toggleAllOnPage()` is called, but the selection state does not change.

---

## Root Cause Analysis

### The Closure Trap in `createSelectionHandlers`

In `EntityListTable.svelte` line 965:

```ts
const selectionHandlers = createSelectionHandlers(
  selectedKeys,           // <-- captured at mount time
  onSelectedKeysChange,
  pageKeys,               // <-- captured at mount time
  allOnPageSelected       // <-- captured at mount time
);
const { toggleRowSelect, toggleAllOnPage } = selectionHandlers;
```

`createSelectionHandlers` in `handlers/selection.ts` receives these as **value parameters**:

```ts
export function createSelectionHandlers(
  selectedKeys: string[],      // array reference at mount time
  onSelectedKeysChange: (keys: string[]) => void,
  pageKeys: string[],          // array reference at mount time
  allOnPageSelected: boolean   // boolean value at mount time
) {
  function toggleAllOnPage() {
    // BUG: These are the values from when createSelectionHandlers was CALLED,
    // not the current reactive values
    if (allOnPageSelected) {  // <-- stale boolean!
      const remove = new Set(pageKeys);  // <-- stale array!
      onSelectedKeysChange(selectedKeys.filter((k) => !remove.has(k)));
      return;
    }
    const next = new Set(selectedKeys);  // <-- stale array!
    for (const k of pageKeys) next.add(k);
    onSelectedKeysChange([...next]);
  }
}
```

### Why This Breaks

**Scenario: Component mounts before data loads**

1. `EntityListTable` mounts with `rows = []` (data not yet loaded)
2. `viewRows = []`, so `pageKeys = []`
3. `selectedKeys = []` (parent has no selections)
4. `allOnPageSelected = false` (0 selected out of 0 rows = false)
5. `createSelectionHandlers` is called with these **empty** values
6. `toggleAllOnPage` closes over `pageKeys = []`, `selectedKeys = []`, `allOnPageSelected = false`
7. Data loads: `rows` populates with 10 items
8. `viewRows` updates to 10 rows, `pageKeys` recomputes to 10 keys
9. User clicks select-all checkbox
10. `toggleAllOnPage()` runs with the **stale closure values**:
    - `pageKeys = []` (from step 5) → adds nothing to selection
    - `allOnPageSelected = false` (from step 5) → takes the "select all" branch
    - Result: `onSelectedKeysChange([...new Set([]).add(...)])` but pageKeys is empty
    - **Nothing is selected. The checkbox appears broken.**

### Why Individual Row Checkboxes Seem to Work (Partially)

```ts
function toggleRowSelect(key: string) {
  if (selectedKeys.includes(key)) {  // stale [] from mount
    onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
  } else {
    onSelectedKeysChange([...selectedKeys, key]);  // adds key to stale []
  }
}
```

- **First click**: `selectedKeys` is stale `[]`, `includes(key)` is `false`, adds key → works
- **Second click**: `selectedKeys` is still stale `[]`, `includes(key)` is still `false`, tries to add again → **broken** (should remove)

The closure bug affects ALL selection operations, but the select-all is the most obvious failure.

### Evidence: The Codebase Already Uses the Getter Pattern

**`useRowRangeSelection.svelte.ts`** (composable) already correctly uses getters:
```ts
export function useRowRangeSelection<T>(options: {
  rowSelectionEnabled: () => boolean;
  selectedKeys: () => string[];   // <-- getter!
  pageKeys: () => string[];       // <-- getter!
  viewRows: () => T[];
  // ...
}) {
  function applyRowRangeBrush(anchor: number, end: number) {
    const rangeKeys = options.viewRows().slice(...).map(...);
    const pageKeySet = new Set(options.pageKeys());  // <-- calls getter!
    // ...
  }
}
```

**`createSortingHandlers`** (handler) already uses getters for reactive values:
```ts
export function createSortingHandlers(
  // ...
  sortKey: () => string | null,     // <-- getter!
  sortDir: () => 'asc' | 'desc',   // <-- getter!
  // ...
) {
  function handleSortClick(col: MetaColumn) {
    if (sortKey() !== col.key) {     // <-- calls getter!
      onSortChange(col.key, 'asc');
    }
  }
}
```

**Conclusion**: `createSelectionHandlers` is the ONLY handler that does NOT follow the getter pattern. This is a clear bug / inconsistency.

---

## Fix Strategy

### Approach: Pass Getter Functions Instead of Values

Change `createSelectionHandlers` to accept getter functions that return the **current** reactive values:

```ts
export function createSelectionHandlers(
  getSelectedKeys: () => string[],
  onSelectedKeysChange: (keys: string[]) => void,
  getPageKeys: () => string[],
  getAllOnPageSelected: () => boolean
) {
  function toggleRowSelect(key: string) {
    const selectedKeys = getSelectedKeys();  // always current
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }

  function toggleAllOnPage() {
    const selectedKeys = getSelectedKeys();  // always current
    const pageKeys = getPageKeys();          // always current
    const allOnPageSelected = getAllOnPageSelected();  // always current

    if (allOnPageSelected) {
      const remove = new Set(pageKeys);
      onSelectedKeysChange(selectedKeys.filter((k) => !remove.has(k)));
      return;
    }
    const next = new Set(selectedKeys);
    for (const k of pageKeys) next.add(k);
    onSelectedKeysChange([...next]);
  }

  return { toggleRowSelect, toggleAllOnPage };
}
```

And update the call site:

```ts
const selectionHandlers = createSelectionHandlers(
  () => selectedKeys,
  onSelectedKeysChange,
  () => pageKeys,
  () => allOnPageSelected
);
```

---

## Files to Change

| File | Change | Lines |
|---|---|---|
| `handlers/selection.ts` | Change parameters from values to getter functions | 1-31 |
| `EntityListTable.svelte` | Update call site to pass arrow functions | ~965 |

---

## Additional Fixes Needed

### 1. Revert `onclick` back to `onCheckedChange`

The previous `onclick` changes in these files should be reverted. `onCheckedChange` is the correct event for a checkbox component:

- `EntityListTableHeaderRow.svelte`
- `CardViewRenderer.svelte`
- `TableHeader.svelte`

### 2. Check `TableRow.svelte` for Similar Issues

`TableRow.svelte` receives `onToggleRowSelect` from the parent. This is `toggleRowSelect` from `selectionHandlers`, which will also be fixed by the getter approach.

---

## Verification Steps

1. Load a page with EntityListTable where data loads asynchronously
2. Wait for data to fully load (10+ rows visible)
3. Click the header select-all checkbox
4. **Expected**: All visible rows become selected, checkbox shows checked
5. Click the header select-all checkbox again
6. **Expected**: All visible rows become deselected, checkbox shows unchecked
7. Select 2 individual rows
8. **Expected**: Header checkbox shows indeterminate state
9. Click the header checkbox while indeterminate
10. **Expected**: All visible rows become selected
11. Switch to card view
12. Repeat steps 3-10 in card view
13. **Expected**: Same behavior in card view

---

## Acceptance Criteria

- [ ] `createSelectionHandlers` uses getter functions for all reactive values
- [ ] `toggleAllOnPage` always uses current `pageKeys`, `selectedKeys`, `allOnPageSelected`
- [ ] `toggleRowSelect` always uses current `selectedKeys`
- [ ] Select-all works after async data load in table view
- [ ] Select-all works after async data load in card view
- [ ] Deselect-all works correctly
- [ ] Indeterminate state transitions correctly
- [ ] Individual row checkbox toggle works correctly (select then deselect)
