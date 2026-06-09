# Phase 5: Extract Main Content Component - Detailed Execution Plan

## Objective
Extract the main content section (lines 1097-1217) from `EntityListTable.svelte` into a new `EntityListTableContent.svelte` component. This component will manage the conditional rendering between loading state, card view, and table view.

## Risk Assessment
- **Risk Level:** VERY HIGH
- **Complexity:** ~60+ props, complex conditional rendering, view mode management
- **Expected Reduction:** ~120 lines
- **Previous Attempts:** None (this is the final extraction phase)

## Root Cause Analysis
The main content section is the central rendering logic that:
1. Shows loading state when metaLoading is true
2. Conditionally renders card view or table view based on viewMode
3. Manages all the props passing to child components
4. Contains the wrapper div with overflow handling

## Detailed Execution Plan

### Step 1: Analyze Content Section (READ-ONLY)
**Action:** Read and document the exact structure of lines 1097-1217
- Identify the wrapper div structure
- Identify conditional rendering logic
- Document all props passed to EntityListTableLoading
- Document all props passed to EntityListTableCardView
- Document all props passed to EntityListTableTableView

**Expected Structure:**
```svelte
<div class="min-h-0 flex-1 overflow-hidden">
  <EntityListTableLoading {...props} />
  {#if !metaLoading}
    <EntityListTableCardView {...props} />
    {#if viewMode === 'table'}
      <EntityListTableTableView {...props} />
    {/if}
  {/if}
</div>
```

**Verification:** No code changes, just analysis

### Step 2: Create Type-Safe Component Stub
**Action:** Create `EntityListTableContent.svelte` with minimal props
- Start with only 5-10 critical props
- Use `any` type initially for complex props
- Add basic structure without implementation

**Props to include initially:**
- metaLoading (boolean)
- viewMode (string)
- metaLoadingView (any)
- loadingText (string)

**Code Example - Initial Stub:**
```svelte
<!-- File: src/lib/components/entity-list-table/components/EntityListTableContent.svelte -->
<script lang="ts" generics="TRow extends Record<string, unknown>">
  import EntityListTableLoading from './EntityListTableLoading.svelte';
  import EntityListTableCardView from './EntityListTableCardView.svelte';
  import EntityListTableTableView from './EntityListTableTableView.svelte';

  let {
    metaLoading,
    viewMode,
    metaLoadingView,
    loadingText
  }: EntityListTableContentProps = $props();

  type EntityListTableContentProps = {
    metaLoading: boolean;
    viewMode: 'table' | 'cards' | 'cards_list';
    metaLoadingView?: (() => void) | null;
    loadingText: string;
  };
</script>

<div class="min-h-0 flex-1 overflow-hidden">
  <EntityListTableLoading
    metaLoading={metaLoading}
    metaLoadingView={metaLoadingView}
    loadingText={loadingText}
  />
  {#if !metaLoading}
    <div>Content placeholder</div>
  {/if}
</div>
```

**Verification:** `pnpm run check` - should pass

### Step 3: Incrementally Add Props - Group 1: Card View Props
**Action:** Add EntityListTableCardView-related props
- Add: viewMode, viewRows, shownColumns, rowSelectionEnabled
- Add: selectedKeys, rowKey, isRowDeleted, previewPanel
- Add: actionsEnabled, rowActions, entityRowActions, dropdownMenuRow
- Add: datetimeIanaModeByKey, datetimeIanaRenderTick, cell
- Add: stickyColumnsGroup, error, errorView, rowsLoading, rowsLoadingView
- Add: loadingText, rows, emptyView, emptyText, showSelectedOnly
- Add: selectionCount, orderedSelectedRows, allOnPageSelected, headerIndeterminate
- Add: toggleAllOnPage, allColumns, effectiveSortKey, sortDir
- Add: onSortChange, sortableColumns, datetimeIanaToggleColumns, toggleDatetimeIana
- Add: onEntityRowClick, onToggleRowSelect, onOpenRowDropdown, onCloseRowDropdown
- Add: onEditRow, rowActionsComposable, onPreviewRow

**Type Strategy:** Use `any` for complex objects initially

**Code Example - After Group 1:**
```svelte
<script lang="ts" generics="TRow extends Record<string, unknown>">
  let {
    // ... previous props ...
    viewMode,
    viewRows,
    shownColumns,
    rowSelectionEnabled,
    selectedKeys,
    rowKey,
    isRowDeleted,
    previewPanel,
    actionsEnabled,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    cell,
    stickyColumnsGroup,
    error,
    errorView,
    rowsLoading,
    rowsLoadingView,
    loadingText,
    rows,
    emptyView,
    emptyText,
    showSelectedOnly,
    selectionCount,
    orderedSelectedRows,
    allOnPageSelected,
    headerIndeterminate,
    toggleAllOnPage,
    allColumns,
    effectiveSortKey,
    sortDir,
    onSortChange,
    sortableColumns,
    datetimeIanaToggleColumns,
    toggleDatetimeIana,
    onEntityRowClick,
    onToggleRowSelect,
    onOpenRowDropdown,
    onCloseRowDropdown,
    onEditRow,
    rowActionsComposable,
    onPreviewRow
  }: EntityListTableContentProps = $props();

  type EntityListTableContentProps = {
    // ... previous types ...
    viewMode: 'table' | 'cards' | 'cards_list';
    viewRows: TRow[];
    shownColumns: any[];
    rowSelectionEnabled: boolean;
    selectedKeys: string[];
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    previewPanel: any;
    actionsEnabled: boolean;
    rowActions: any;
    entityRowActions: any;
    dropdownMenuRow: TRow | null;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cell: any;
    stickyColumnsGroup: any[];
    error: string | null;
    errorView?: (() => void) | null;
    rowsLoading: boolean;
    rowsLoadingView?: (() => void) | null;
    loadingText: string;
    rows: TRow[];
    emptyView?: (() => void) | null;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: TRow[];
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    allColumns: any[];
    effectiveSortKey: string | null;
    sortDir: 'asc' | 'desc';
    onSortChange: (key: string | null, dir: 'asc' | 'desc') => void;
    sortableColumns: any[];
    datetimeIanaToggleColumns: any[];
    toggleDatetimeIana: (col: any) => void;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: TRow) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: TRow) => void;
    rowActionsComposable: any;
    onPreviewRow: (row: TRow) => void;
  };
</script>
```

**Verification:** `pnpm run check` after each prop group

### Step 4: Incrementally Add Props - Group 2: Table View Props
**Action:** Add EntityListTableTableView-related props
- Add: tableRef, tableDensityClass, rowSelectionEnabled, stickyColumnsState
- Add: rowChromeH, checkboxInteractiveClass, allOnPageSelected, headerIndeterminate
- Add: toggleAllOnPage, shownColumns, stickyColumnsGroup, visibleKeys
- Add: sortKey, sortDir, rowsLoading, handleSortClick
- Add: datetimeIanaModeByKey, toggleDatetimeIana, actionsEnabled, previewPanel
- Add: viewRows, error, errorView, rowsLoadingView, loadingText
- Add: rows, extraCols, emptyView, emptyText, showSelectedOnly
- Add: selectionCount, orderedSelectedRows, rowRangeSelection, datetimeIanaRenderTick
- Add: rowKey, isRowDeleted, cell, rowActions, entityRowActions, dropdownMenuRow
- Add: onEntityRowClick, handlePreviewRow, toggleRowSelect, openRowDropdown, closeRowDropdown
- Add: handleEditRow, rowActionsComposable, uid, pageSize, page, onPageChange
- Add: entity, columns, stickyColumns, dataColumns, auditingColumns
- Add: rowActionsEnabled, selectedKeys, footerRangeTotal, footerPage
- Add: previewDropdownOpen, navigatePreview

**Type Strategy:**
- `rows: any` (resolve type conflict)
- `extraCols: number`
- Column arrays: `any[] | undefined`

**Code Example - After Group 2 (Complete Props):**
```svelte
<script lang="ts" generics="TRow extends Record<string, unknown>">
  let {
    // ... all previous props ...
    tableRef,
    tableDensityClass,
    stickyColumnsState,
    rowChromeH,
    checkboxInteractiveClass,
    visibleKeys,
    handleSortClick,
    rowRangeSelection,
    uid,
    pageSize,
    page,
    onPageChange,
    entity,
    columns,
    stickyColumns,
    dataColumns,
    auditingColumns,
    rowActionsEnabled,
    footerRangeTotal,
    footerPage,
    previewDropdownOpen,
    navigatePreview
  }: EntityListTableContentProps = $props();

  type EntityListTableContentProps = {
    // ... all previous types ...
    tableRef: any;
    tableDensityClass: string;
    stickyColumnsState: any;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    visibleKeys: string[];
    handleSortClick: (col: any) => void;
    rowRangeSelection: any;
    uid: string;
    pageSize: number;
    page: number;
    onPageChange: (page: number) => void;
    entity: string;
    columns: any[] | undefined;
    stickyColumns: any[] | undefined;
    dataColumns: any[] | undefined;
    auditingColumns: any[] | undefined;
    rowActionsEnabled: boolean;
    footerRangeTotal: number;
    footerPage: number;
    previewDropdownOpen: boolean;
    navigatePreview: (direction: number) => void;
  };
</script>
```

**Verification:** `pnpm run check` after each prop group

### Step 5: Implement Component Structure
**Action:** Add the component markup structure
- Add outer div with class="min-h-0 flex-1 overflow-hidden"
- Add EntityListTableLoading component
- Add conditional rendering for !metaLoading
- Add EntityListTableCardView component
- Add conditional rendering for viewMode === 'table'
- Add EntityListTableTableView component

**Code Example - Component Structure:**
```svelte
<script lang="ts" generics="TRow extends Record<string, unknown>">
  import EntityListTableLoading from './EntityListTableLoading.svelte';
  import EntityListTableCardView from './EntityListTableCardView.svelte';
  import EntityListTableTableView from './EntityListTableTableView.svelte';

  // ... all props from previous steps ...
</script>

<div class="min-h-0 flex-1 overflow-hidden">
  <EntityListTableLoading
    metaLoading={metaLoading}
    metaLoadingView={metaLoadingView}
    loadingText={loadingText}
  />
  {#if !metaLoading}
    <EntityListTableCardView
      viewMode={viewMode}
      viewRows={viewRows}
      shownColumns={shownColumns}
      rowSelectionEnabled={rowSelectionEnabled}
      selectedKeys={selectedKeys}
      rowKey={rowKey}
      isRowDeleted={isRowDeleted}
      previewPanel={previewPanel}
      actionsEnabled={actionsEnabled}
      rowActions={rowActions}
      entityRowActions={entityRowActions}
      dropdownMenuRow={dropdownMenuRow}
      datetimeIanaModeByKey={datetimeIanaModeByKey}
      datetimeIanaRenderTick={datetimeIanaRenderTick}
      cell={cell}
      stickyColumnsGroup={stickyColumnsGroup}
      error={error}
      errorView={errorView}
      rowsLoading={rowsLoading}
      rowsLoadingView={rowsLoadingView}
      loadingText={loadingText}
      rows={rows}
      emptyView={emptyView}
      emptyText={emptyText}
      showSelectedOnly={showSelectedOnly}
      selectionCount={selectionCount}
      orderedSelectedRows={orderedSelectedRows}
      allOnPageSelected={allOnPageSelected}
      headerIndeterminate={headerIndeterminate}
      toggleAllOnPage={toggleAllOnPage}
      allColumns={allColumns}
      effectiveSortKey={effectiveSortKey}
      sortDir={sortDir}
      onSortChange={onSortChange}
      sortableColumns={sortableColumns}
      datetimeIanaToggleColumns={datetimeIanaToggleColumns}
      toggleDatetimeIana={toggleDatetimeIana}
      onEntityRowClick={onEntityRowClick}
      onToggleRowSelect={toggleRowSelect}
      onOpenRowDropdown={openRowDropdown}
      onCloseRowDropdown={closeRowDropdown}
      onEditRow={handleEditRow}
      rowActionsComposable={rowActionsComposable}
      onPreviewRow={handlePreviewRow}
    />
    {#if viewMode === 'table'}
      <EntityListTableTableView
        tableRef={tableRef}
        tableDensityClass={tableDensityClass}
        rowSelectionEnabled={rowSelectionEnabled}
        stickyColumnsState={stickyColumnsState}
        rowChromeH={rowChromeH}
        checkboxInteractiveClass={checkboxInteractiveClass}
        allOnPageSelected={allOnPageSelected}
        headerIndeterminate={headerIndeterminate}
        toggleAllOnPage={toggleAllOnPage}
        shownColumns={shownColumns}
        stickyColumnsGroup={stickyColumnsGroup}
        visibleKeys={visibleKeys}
        sortKey={sortKey}
        sortDir={sortDir}
        rowsLoading={rowsLoading}
        handleSortClick={handleSortClick}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        toggleDatetimeIana={toggleDatetimeIana}
        actionsEnabled={actionsEnabled}
        previewPanel={previewPanel}
        viewRows={viewRows}
        error={error}
        errorView={errorView}
        rowsLoadingView={rowsLoadingView}
        loadingText={loadingText}
        rows={rows}
        extraCols={extraCols}
        emptyView={emptyView}
        emptyText={emptyText}
        showSelectedOnly={showSelectedOnly}
        selectionCount={selectionCount}
        orderedSelectedRows={orderedSelectedRows}
        rowRangeSelection={rowRangeSelection}
        datetimeIanaRenderTick={datetimeIanaRenderTick}
        rowKey={rowKey}
        isRowDeleted={isRowDeleted}
        cell={cell}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        onEntityRowClick={onEntityRowClick}
        handlePreviewRow={handlePreviewRow}
        toggleRowSelect={toggleRowSelect}
        openRowDropdown={openRowDropdown}
        closeRowDropdown={closeRowDropdown}
        handleEditRow={handleEditRow}
        rowActionsComposable={rowActionsComposable}
        uid={uid}
        pageSize={pageSize}
        page={page}
        onPageChange={onPageChange}
        entity={entity}
        columns={columns}
        stickyColumns={stickyColumns}
        dataColumns={dataColumns}
        auditingColumns={auditingColumns}
        rowActionsEnabled={rowActionsEnabled}
        selectedKeys={selectedKeys}
        footerRangeTotal={footerRangeTotal}
        footerPage={footerPage}
        previewDropdownOpen={previewDropdownOpen}
        navigatePreview={navigatePreview}
      />
    {/if}
  {/if}
</div>
```

**Verification:** `pnpm run check` - should pass

### Step 6: Update EntityListTable.svelte
**Action:** Replace main content section with component
- Import EntityListTableContent
- Replace lines 1097-1217 with component usage
- Pass all props from Step 3-4

**Code Example - Import Statement:**
```svelte
// Add to imports in EntityListTable.svelte
import EntityListTableContent from './components/EntityListTableContent.svelte';
```

**Code Example - Replace Content Section:**
```svelte
// BEFORE (lines 1097-1217):
<div class="min-h-0 flex-1 overflow-hidden">
  <EntityListTableLoading
    metaLoading={metaLoading}
    metaLoadingView={metaLoadingView}
    loadingText={loadingText}
  />
  {#if !metaLoading}
    <EntityListTableCardView
      viewMode={viewMode}
      viewRows={viewRows}
      shownColumns={shownColumns}
      rowSelectionEnabled={rowSelectionEnabled}
      selectedKeys={selectedKeys}
      rowKey={rowKey}
      isRowDeleted={isRowDeleted}
      previewPanel={previewPanel}
      actionsEnabled={actionsEnabled}
      rowActions={rowActions}
      entityRowActions={entityRowActions}
      dropdownMenuRow={dropdownMenuRow}
      datetimeIanaModeByKey={datetimeIanaModeByKey}
      datetimeIanaRenderTick={datetimeIanaRenderTick}
      cell={cell}
      stickyColumnsGroup={stickyColumnsGroup}
      error={error}
      errorView={errorView}
      rowsLoading={rowsLoading}
      rowsLoadingView={rowsLoadingView}
      loadingText={loadingText}
      rows={rows}
      emptyView={emptyView}
      emptyText={emptyText}
      showSelectedOnly={showSelectedOnly}
      selectionCount={selectionCount}
      orderedSelectedRows={orderedSelectedRows}
      allOnPageSelected={allOnPageSelected}
      headerIndeterminate={headerIndeterminate}
      toggleAllOnPage={toggleAllOnPage}
      allColumns={allColumns}
      effectiveSortKey={effectiveSortKey}
      sortDir={sortDir}
      onSortChange={onSortChange}
      sortableColumns={sortableColumns}
      datetimeIanaToggleColumns={datetimeIanaToggleColumns}
      toggleDatetimeIana={toggleDatetimeIana}
      onEntityRowClick={onEntityCardClick}
      onToggleRowSelect={toggleRowSelect}
      onOpenRowDropdown={openRowDropdown}
      onCloseRowDropdown={closeRowDropdown}
      onEditRow={handleEditRow}
      rowActionsComposable={rowActionsComposable}
      onPreviewRow={handlePreviewRow}
    />
    {#if viewMode === 'table'}
      <EntityListTableTableView
        tableRef={tableRef}
        tableDensityClass={tableDensityClass}
        rowSelectionEnabled={rowSelectionEnabled}
        stickyColumnsState={stickyColumnsState}
        rowChromeH={rowChromeH}
        checkboxInteractiveClass={checkboxInteractiveClass}
        allOnPageSelected={allOnPageSelected}
        headerIndeterminate={headerIndeterminate}
        toggleAllOnPage={toggleAllOnPage}
        shownColumns={shownColumns}
        stickyColumnsGroup={stickyColumnsGroup}
        visibleKeys={visibleKeys}
        sortKey={sortKey}
        sortDir={sortDir}
        rowsLoading={rowsLoading}
        handleSortClick={handleSortClick}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        toggleDatetimeIana={toggleDatetimeIana}
        actionsEnabled={actionsEnabled}
        previewPanel={previewPanel}
        viewRows={viewRows}
        error={error}
        errorView={errorView}
        rowsLoadingView={rowsLoadingView}
        loadingText={loadingText}
        rows={rows}
        extraCols={extraCols}
        emptyView={emptyView}
        emptyText={emptyText}
        showSelectedOnly={showSelectedOnly}
        selectionCount={selectionCount}
        orderedSelectedRows={orderedSelectedRows}
        rowRangeSelection={rowRangeSelection}
        datetimeIanaRenderTick={datetimeIanaRenderTick}
        rowKey={rowKey}
        isRowDeleted={isRowDeleted}
        cell={cell}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        onEntityRowClick={onEntityRowClick}
        handlePreviewRow={handlePreviewRow}
        toggleRowSelect={toggleRowSelect}
        openRowDropdown={openRowDropdown}
        closeRowDropdown={closeRowDropdown}
        handleEditRow={handleEditRow}
        rowActionsComposable={rowActionsComposable}
        uid={uid}
        pageSize={pageSize}
        page={page}
        onPageChange={onPageChange}
        entity={entity}
        columns={columns}
        stickyColumns={stickyColumns}
        dataColumns={dataColumns}
        auditingColumns={auditingColumns}
        rowActionsEnabled={rowActionsEnabled}
        selectedKeys={selectedKeys}
        footerRangeTotal={footerRangeTotal}
        footerPage={footerPage}
        previewDropdownOpen={previewDropdownOpen}
        navigatePreview={navigatePreview}
      />
    {/if}
  {/if}
</div>

// AFTER (replace with):
<EntityListTableContent
  metaLoading={metaLoading}
  viewMode={viewMode}
  metaLoadingView={metaLoadingView}
  loadingText={loadingText}
  viewRows={viewRows}
  shownColumns={shownColumns}
  rowSelectionEnabled={rowSelectionEnabled}
  selectedKeys={selectedKeys}
  rowKey={rowKey}
  isRowDeleted={isRowDeleted}
  previewPanel={previewPanel}
  actionsEnabled={actionsEnabled}
  rowActions={rowActions}
  entityRowActions={entityRowActions}
  dropdownMenuRow={dropdownMenuRow}
  datetimeIanaModeByKey={datetimeIanaModeByKey}
  datetimeIanaRenderTick={datetimeIanaRenderTick}
  cell={cell}
  stickyColumnsGroup={stickyColumnsGroup}
  error={error}
  errorView={errorView}
  rowsLoading={rowsLoading}
  rowsLoadingView={rowsLoadingView}
  rows={rows}
  emptyView={emptyView}
  emptyText={emptyText}
  showSelectedOnly={showSelectedOnly}
  selectionCount={selectionCount}
  orderedSelectedRows={orderedSelectedRows}
  allOnPageSelected={allOnPageSelected}
  headerIndeterminate={headerIndeterminate}
  toggleAllOnPage={toggleAllOnPage}
  allColumns={allColumns}
  effectiveSortKey={effectiveSortKey}
  sortDir={sortDir}
  onSortChange={onSortChange}
  sortableColumns={sortableColumns}
  datetimeIanaToggleColumns={datetimeIanaToggleColumns}
  toggleDatetimeIana={toggleDatetimeIana}
  onEntityRowClick={onEntityCardClick}
  onToggleRowSelect={toggleRowSelect}
  onOpenRowDropdown={openRowDropdown}
  onCloseRowDropdown={closeRowDropdown}
  onEditRow={handleEditRow}
  rowActionsComposable={rowActionsComposable}
  onPreviewRow={handlePreviewRow}
  tableRef={tableRef}
  tableDensityClass={tableDensityClass}
  stickyColumnsState={stickyColumnsState}
  rowChromeH={rowChromeH}
  checkboxInteractiveClass={checkboxInteractiveClass}
  visibleKeys={visibleKeys}
  handleSortClick={handleSortClick}
  rowRangeSelection={rowRangeSelection}
  uid={uid}
  pageSize={pageSize}
  page={page}
  onPageChange={onPageChange}
  entity={entity}
  columns={columns}
  stickyColumns={stickyColumns}
  dataColumns={dataColumns}
  auditingColumns={auditingColumns}
  rowActionsEnabled={rowActionsEnabled}
  footerRangeTotal={footerRangeTotal}
  footerPage={footerPage}
  previewDropdownOpen={previewDropdownOpen}
  navigatePreview={navigatePreview}
  extraCols={extraCols}
/>
```

**Verification:** `pnpm run check`

### Step 7: Type Check and Fix (Iteration 1)
**Action:** Run type check and fix any errors
- If errors occur, identify the specific prop causing the issue
- Adjust type definition in component
- Re-run check

**Common Type Errors and Fixes:**

**Error 1: Generic type mismatch**
```
Error: Type 'TRow[]' is not assignable to type 'any[]'.
```
**Fix:** Change generic types to `any` in component props

**Error 2: Function type mismatch**
```
Error: Type '(row: TRow) => string' is not assignable to type 'any'.
```
**Fix:** Change function types to `any` in component props

**Error 3: Handler type mismatch**
```
Error: Type '(key: string, e: MouseEvent) => void' is not assignable to type 'any'.
```
**Fix:** Change handler types to `any` in component props

**Max attempts:** 2 (per guardrails)

### Step 8: Type Check and Fix (Iteration 2)
**Action:** If iteration 1 failed, try alternative approach
- Consider using `any` for all complex props
- Consider optional chaining for undefined props
- Consider type assertions as last resort

**Alternative Fix Examples:**

**Option 1: Use `any` for all complex props**
```typescript
type EntityListTableContentProps = {
  // ... simple types (boolean, string, number) ...
  viewRows: any;
  rows: any;
  orderedSelectedRows: any;
  rowKey: any;
  isRowDeleted: any;
  cell: any;
  rowActions: any;
  entityRowActions: any;
  dropdownMenuRow: any;
  // ... handlers as any ...
  onEntityRowClick: any;
  handlePreviewRow: any;
  toggleRowSelect: any;
  openRowDropdown: any;
  closeRowDropdown: any;
  handleEditRow: any;
  rowActionsComposable: any;
  // ... other complex types as any ...
};
```

**Option 2: Use type assertions in component**
```svelte
<EntityListTableCardView
  viewRows={viewRows as any[]}
  rows={rows as any[]}
  orderedSelectedRows={orderedSelectedRows as any[]}
  rowKey={rowKey as any}
  isRowDeleted={isRowDeleted as any}
  {...}
/>
```

**Max attempts:** 2 (per guardrails)

### Step 9: If Type Check Fails - Rollback Strategy
**Action:** If type check still fails after 2 iterations
- Delete EntityListTableContent.svelte
- Revert EntityListTable.svelte changes
- Document the specific type errors encountered
- Update plan with alternative approach

**Rollback Commands:**
```bash
# Delete the new component
rm src/lib/components/entity-list-table/components/EntityListTableContent.svelte

# Revert EntityListTable.svelte changes
git checkout src/lib/components/entity-list-table/EntityListTable.svelte

# Remove import statement if added
# Manually edit to remove: import EntityListTableContent from './components/EntityListTableContent.svelte';
```

**Acceptance Criteria:** Rollback is acceptable for VERY HIGH RISK phase

### Step 10: If Type Check Succeeds - Final Verification
**Action:** Final verification steps
- Run `pnpm run check` - should pass with no new errors
- Run `pnpm run dev` - should start without errors
- Manual test: Verify loading state renders correctly
- Manual test: Verify card view renders correctly
- Manual test: Verify table view renders correctly
- Manual test: Verify view mode switching works

**Verification Commands:**
```bash
# Type check
pnpm run check

# Start dev server
pnpm run dev

# Expected: No new errors in EntityListTable or EntityListTableContent
```

**Manual Test Checklist:**
- [ ] Loading state displays correctly when metaLoading is true
- [ ] Card view renders when viewMode is 'cards' or 'cards_list'
- [ ] Table view renders when viewMode is 'table'
- [ ] View mode switching works correctly
- [ ] All props are passed correctly to child components
- [ ] No console errors during rendering

## Acceptance Criteria
- Component compiles without type errors
- No new errors introduced in EntityListTable.svelte
- Loading state renders correctly
- Card view renders correctly
- Table view renders correctly
- View mode switching works
- File size reduction: ~120 lines

## Rollback Criteria
- Type check fails after 2 self-correction attempts
- Runtime errors during manual testing
- Breaking changes to existing functionality

## Notes
- This is a VERY HIGH RISK phase per the original plan
- Using `any` types is acceptable to avoid type conflicts
- This is the final extraction phase - if successful, the main component will be very small
- Consider whether the complexity is worth the reduction in file size
- Alternative: Keep current structure as-is (already 22.4% reduction achieved)
