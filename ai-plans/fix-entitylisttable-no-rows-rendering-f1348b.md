# Fix: EntityListTable Rows Not Rendering

Diagnose and fix why EntityListTable receives data from the backend but fails to render rows, using an empirical approach with concrete code verification.

---

## Empirical Diagnostic Steps

### Step 1: Verify Props Reaching TableBody (Immediate Check)

In `TableBody.svelte`, add temporary debug logging to see which branch is taken:

```svelte
<!-- Add at line 111, before <Table.Body> -->
<script context="module">
  // Temporary debug - remove after fix
  $effect(() => {
    console.log('TableBody debug:', {
      error: error ?? null,
      rowsLoading,
      rowsLength: rows?.length ?? 'undefined',
      viewRowsLength: viewRows?.length ?? 'undefined',
      shownColumnsLength: shownColumns?.length ?? 'undefined'
    });
  });
</script>
```

**Expected result:** If `rowsLength` is `undefined`, the `rows` prop is not reaching TableBody. If `rowsLength` is `0`, the backend returns empty data. If `rowsLoading` is `true`, the parent never sets it to `false`.

---

### Step 2: Verify Rows Prop Chain (Trace from Parent)

Check if `rows` flows correctly through the component hierarchy:

| Component | Prop Name | Line |
|---|---|---|
| `EntityListTable.svelte` (parent consumer) | `rows` | prop declaration |
| `EntityListTable.svelte` → `EntityListTableContent` | `rows={rows}` | line 1120 |
| `EntityListTableContent.svelte` → `EntityListTableTableView` | `rows={rows}` | line 230 |
| `EntityListTableTableView.svelte` → `TableBody` | `rows={rows}` | line 178 |

**Empirical check:** Verify each of these 4 lines still passes `rows` correctly after the refactoring.

---

### Step 3: Check for Silent Rendering Blockers

The rendering chain in `TableBody.svelte` (lines 114-231):

```
error?          → render errorView
rowsLoading?    → render loading spinner  
rows.length==0? → render empty state
viewRows.length==0? → render "no selected rows"
else            → {#each viewRows} → render actual rows
```

**Empirical checks to perform:**

1. **Is `rowsLoading` stuck true?** Check the parent page/component that calls `EntityListTable` — verify it sets `rowsLoading={false}` after `apiFetch` completes.

2. **Is `metaLoading` stuck true?** `EntityListTableContent.svelte` line 157 wraps all content in `{#if !metaLoading}`. If `metaLoading` never becomes `false`, nothing renders.

3. **Is `error` populated?** Even a transient error would show the error branch.

4. **Is `shownColumns` empty?** If `visibleKeys` contains no valid column keys, `shownColumns` is empty (but rows should still render with 0 columns).

---

## Most Likely Root Causes (Based on Code Review)

### Hypothesis A: `rowsLoading` or `metaLoading` Never Set to `false`

The parent page using `EntityListTable` may have a bug in its loading state management. After the refactoring, the prop names or binding may have changed.

**Fix approach:** Verify the parent component correctly sets both flags:
```svelte
<EntityListTable
  rows={data}
  rowsLoading={isLoading}   <!-- must become false after fetch -->
  metaLoading={isMetaLoading} <!-- must become false after columns load -->
/>
```

### Hypothesis B: `rows` Prop Is Actually `undefined` at Runtime

The TypeScript type says `rows: TRow[]` but at runtime it could be `undefined` if the parent doesn't initialize it.

**Fix approach:** Add runtime guard in `TableBody.svelte`:
```svelte
{:else if !rows || rows.length === 0}
```
And in `EntityListTable.svelte`, ensure `viewRows` handles undefined:
```svelte
const viewRows = $derived(
  rowSelectionEnabled && showSelectedOnly
    ? orderedSelectedRows.slice(...)
    : (rows ?? [])
);
```

### Hypothesis C: `shownColumns` Filtering Is Too Aggressive

In `EntityListTable.svelte` line 269:
```svelte
const shownColumns = $derived(allColumns.filter((c) => visibleKeys.includes(c.key)));
```

If `visibleKeys` is empty or doesn't match any column keys, `shownColumns` is empty. The `extraCols` calculation (line 799) uses `shownColumns.length`, which would be 0, making `colspan={0}` on error/loading/empty rows — but the actual data rows should still render (they use `{#each viewRows}`).

**Fix approach:** Verify `visibleKeys` is populated. Check `defaultVisibleColumnKeys` import and usage.

### Hypothesis D: The `stickyColumnsState.stickyRef` Action Crashes During Row Rendering

`TableRow.svelte` line 163:
```svelte
<div use:stickyColumnsState.stickyRef={{ key: col.key, isHead: false }}>
```

If `stickyColumnsState.stickyRef` throws (e.g., the action function returns invalid), Svelte may silently fail to render that row or all subsequent rows.

**Fix approach:** Verify the `stickyRef` action returns valid `{ update, destroy }` object.

---

## Concrete Fix: Add Defensive Guards and Debug Logging

### Fix 1: Guard Against `undefined` rows in TableBody

```svelte
<!-- TableBody.svelte -->
{:else if !rows || rows.length === 0}
```

### Fix 2: Guard viewRows in the {#each} block

```svelte
<!-- TableBody.svelte line 188 -->
{#if viewRows?.length > 0}
  {#key datetimeIanaRenderTick}
    {#each viewRows as r, i (rowKey(r))}
```

### Fix 3: Ensure shownColumns has at least colspan=1

```svelte
<!-- TableBody.svelte -->
{@const colSpan = Math.max(1, shownColumns.length + extraCols)}
```
Replace all `shownColumns.length + extraCols` with `colSpan`.

### Fix 4: Debug logging in EntityListTableContent

Add temporary `$effect` logging to verify props reach the component:

```svelte
<!-- EntityListTableContent.svelte -->
$effect(() => {
  console.log('Content props:', {
    metaLoading, viewMode, viewRowsLength: viewRows?.length,
    rowsLength: rows?.length, error, rowsLoading
  });
});
```

---

## Verification Steps After Fix

1. Open browser DevTools → Console
2. Look for debug logs showing actual row counts
3. Confirm `viewRows.length > 0` and `shownColumns.length > 0`
4. Verify no new ReferenceError or TypeError in console
5. Confirm rows render in both `table` and `cards` view modes
6. Confirm row selection, sorting, and actions still work

---

## Acceptance Criteria

- [ ] `TableBody` renders `{#each viewRows}` when data is present
- [ ] No `undefined` prop errors in console
- [ ] Empty state shows only when `rows.length === 0`
- [ ] Loading state shows only when `rowsLoading === true`
- [ ] Error state shows only when `error` is truthy
- [ ] `metaLoading` does not block rendering indefinitely
