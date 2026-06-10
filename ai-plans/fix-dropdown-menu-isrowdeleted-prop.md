# Fix Dropdown Menu isRowDeleted Prop Missing

## Issue
The dropdown menu on table rows fails to appear with error:
```
Uncaught TypeError: $$props.isRowDeleted is not a function
```

Error occurs at `TableRow.svelte:250:34` when trying to call `isRowDeleted(row)`.

## Root Cause
`TableRow.svelte` defines `isRowDeleted` as a required prop (line 66, 110) with type `(row: TRow) => boolean`, but `TableBody.svelte` does not pass this prop when rendering the `TableRow` component (lines 193-227).

The `TableRow` component uses `isRowDeleted(row)` in multiple places:
- Line 253: `if (isRowDeleted(row)) return;` (edit action)
- Line 254: `class={isRowDeleted(row) ? ...}` (edit action styling)
- Line 264: `if (isRowDeleted(row)) return;` (duplicate action)
- Line 265: `class={isRowDeleted(row) ? ...}` (duplicate action styling)
- Line 291: `{#if isRowDeleted(row)}` (delete/restore conditional)

Since `isRowDeleted` is not passed from `TableBody.svelte`, it's undefined, causing the runtime error when the dropdown menu attempts to render.

## Impacted Files
- `d:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\components\TableBody.svelte`
- `d:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\components\TableRow.svelte`

## Solution
Add the missing `isRowDeleted` prop to the `TableRow` component invocation in `TableBody.svelte`.

### Code Change
In `TableBody.svelte` at line 193-227, add `{isRowDeleted}` to the `TableRow` component props:

```svelte
<TableRow
  {i}
  row={r}
  rowKey={rk}
  rowSelected={rowSelected}
  rowDeleted={rowDeleted}
  {shownColumns}
  {extraCols}
  {rowSelectionEnabled}
  {selectedKeys}
  {rowRangeSelection}
  {datetimeIanaRenderTick}
  {previewPanel}
  {actionsEnabled}
  {rowChromeH}
  {stickyColumnsGroup}
  {stickyColumnsState}
  {datetimeIanaModeByKey}
  {cell}
  {rowActions}
  {entityRowActions}
  {dropdownMenuRow}
  {isRowDeleted}  // <-- ADD THIS LINE
  onRowRangeMouseDown={(index: number, e: MouseEvent) => rowRangeSelection.onRowRangeMouseDown(index, e)}
  onEntityRowClick={onEntityRowClick}
  onPreviewRow={onPreviewRow}
  onToggleRowSelect={onToggleRowSelect}
  onOpenRowDropdown={onOpenRowDropdown}
  onCloseRowDropdown={onCloseRowDropdown}
  onEditRow={onEditRow}
  onLoadVersionHistory={onLoadVersionHistory}
  onDuplicateRow={onDuplicateRow}
  onDeleteRow={onDeleteRow}
  onRestoreRow={onRestoreRow}
  {stickyCellClass}
/>
```

## Acceptance Criteria
1. Dropdown menu on table rows opens without errors
2. Edit, duplicate, and delete/restore actions correctly check row deletion status
3. Actions are properly disabled/styled for deleted rows
4. No console errors related to `isRowDeleted`
