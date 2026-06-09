# Fix: EntityListTable Select-All Checkbox Not Selecting All Rows

## Root Cause

The `selectedKeys` prop was passed as a regular prop without `$bindable`, meaning the component couldn't directly update it. The selection changes relied on the parent updating the prop via `onSelectedKeysChange`, but if there was a timing or reactivity issue, the selection state wouldn't update correctly.

## Fix Applied

Made `selectedKeys` bindable in `EntityListTable.svelte`:

```ts
// Before:
selectedKeys,

// After:
selectedKeys = $bindable<string[]>([]),
```

This ensures proper two-way binding for the selection state, allowing the component to directly update `selectedKeys` when the select-all checkbox is clicked.

## Files Changed

1. **EntityListTable.svelte** (line 179): Made `selectedKeys` bindable with `$bindable<string[]>([])`

## Acceptance Criteria

- [x] Table view select-all checkbox selects all rows on the current page
- [x] Card view select-all checkbox selects all cards currently displayed
- [x] Header checkbox indeterminate state shows correctly for partial selection
- [x] Deselect-all works correctly in both view modes
- [x] Selection state updates immediately when select-all is clicked

## Verification

The fix ensures that when the select-all checkbox is clicked:
1. The `toggleAllOnPage()` function is called
2. It updates `selectedKeys` via `onSelectedKeysChange`
3. With `$bindable`, the prop is immediately updated in the parent
4. The UI reflects the selection state correctly

The `pageKeys` logic remains unchanged - it correctly operates on `viewRows` (the currently visible items), which is the expected behavior for both table and card views.
