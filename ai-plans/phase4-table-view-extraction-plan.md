# Phase 4: Extract Table View Container - Detailed Execution Plan

## Objective
Extract the table view section (lines 1149-1263) from `EntityListTable.svelte` into a new `EntityListTableTableView.svelte` component.

## Risk Assessment
- **Risk Level:** HIGH
- **Complexity:** ~50+ props, complex state management
- **Expected Reduction:** ~115 lines
- **Previous Attempt:** Failed due to type errors (exceeded 2-attempt limit)

## Root Cause Analysis of Previous Failure
The previous attempt failed due to type mismatches:
1. `rows` type conflict: `number` vs `TRow[]` vs `any[]`
2. Column arrays (`columns`, `stickyColumns`, `dataColumns`, `auditingColumns`) type: `MetaColumn[] | undefined` vs `any[]`
3. PreviewPanelWrapper type expectations

## Detailed Execution Plan

### Step 1: Analyze Type Definitions (READ-ONLY)
**Action:** Read and document exact types from `EntityListTable.svelte`
- Identify exact type of `rows` prop
- Identify exact types of column arrays
- Identify exact type of `viewRows`
- Document all prop types with their nullable/optional status

**Expected Types (from analysis):**
```typescript
// From EntityListTable.svelte prop definitions
rows: TRow[]  // Generic array type
viewRows: TRow[]  // Generic array type
columns: MetaColumn[] | undefined
stickyColumns: MetaColumn[] | undefined
dataColumns: MetaColumn[] | undefined
auditingColumns: MetaColumn[] | undefined
selectedKeys: string[]
sortKey: string | null
sortDir: 'asc' | 'desc'
```

**Verification:** No code changes, just analysis

### Step 2: Create Type-Safe Component Stub
**Action:** Create `EntityListTableTableView.svelte` with minimal props
- Start with only 5-10 critical props
- Use `any` type initially for complex props
- Add basic structure without implementation

**Props to include initially:**
- tableRef (any)
- tableDensityClass (string)
- viewMode (string)
- tableVisible (boolean)

**Code Example - Initial Stub:**
```svelte
<!-- File: src/lib/components/entity-list-table/components/EntityListTableTableView.svelte -->
<script lang="ts">
  let {
    tableRef,
    tableDensityClass,
    viewMode,
    tableVisible
  }: EntityListTableTableViewProps = $props();

  type EntityListTableTableViewProps = {
    tableRef: any;
    tableDensityClass: string;
    viewMode: 'table' | 'cards' | 'cards_list';
    tableVisible: boolean;
  };
</script>

{#if tableVisible && viewMode === 'table'}
  <div>Table view placeholder</div>
{/if}
```

**Verification:** `pnpm run check` - should pass

### Step 3: Incrementally Add Props - Group 1: Table Structure
**Action:** Add table-related props
- Add: rowSelectionEnabled, stickyColumnsState, rowChromeH, checkboxInteractiveClass
- Add: allOnPageSelected, headerIndeterminate, toggleAllOnPage
- Add: shownColumns, stickyColumnsGroup, visibleKeys

**Type Strategy:** Use `any` for complex objects initially

**Code Example - After Group 1:**
```svelte
<script lang="ts">
  let {
    tableRef,
    tableDensityClass,
    viewMode,
    tableVisible,
    rowSelectionEnabled,
    stickyColumnsState,
    rowChromeH,
    checkboxInteractiveClass,
    allOnPageSelected,
    headerIndeterminate,
    toggleAllOnPage,
    shownColumns,
    stickyColumnsGroup,
    visibleKeys
  }: EntityListTableTableViewProps = $props();

  type EntityListTableTableViewProps = {
    tableRef: any;
    tableDensityClass: string;
    viewMode: 'table' | 'cards' | 'cards_list';
    tableVisible: boolean;
    rowSelectionEnabled: boolean;
    stickyColumnsState: any;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    shownColumns: any[];
    stickyColumnsGroup: any[];
    visibleKeys: string[];
  };
</script>

{#if tableVisible && viewMode === 'table'}
  <div>Table view placeholder</div>
{/if}
```

**Verification:** `pnpm run check` after each prop group

### Step 4: Incrementally Add Props - Group 2: Sorting & State
**Action:** Add sorting and state props
- Add: sortKey, sortDir, rowsLoading, handleSortClick
- Add: datetimeIanaModeByKey, toggleDatetimeIana
- Add: actionsEnabled, previewPanel, viewRows

**Type Strategy:** 
- `sortKey: string | null`
- `viewRows: any[]` (defer generic until later)
- `previewPanel: any`

**Code Example - After Group 2:**
```svelte
<script lang="ts">
  let {
    // ... previous props ...
    sortKey,
    sortDir,
    rowsLoading,
    handleSortClick,
    datetimeIanaModeByKey,
    toggleDatetimeIana,
    actionsEnabled,
    previewPanel,
    viewRows
  }: EntityListTableTableViewProps = $props();

  type EntityListTableTableViewProps = {
    // ... previous types ...
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    rowsLoading: boolean;
    handleSortClick: (col: any) => void;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    toggleDatetimeIana: (col: any) => void;
    actionsEnabled: boolean;
    previewPanel: any;
    viewRows: any[];
  };
</script>
```

**Verification:** `pnpm run check` after each prop group

### Step 5: Incrementally Add Props - Group 3: TableBody Props
**Action:** Add TableBody-related props
- Add: error, errorView, rowsLoadingView, loadingText
- Add: rows (use `any` type initially)
- Add: extraCols, emptyView, emptyText
- Add: showSelectedOnly, selectionCount, orderedSelectedRows
- Add: rowRangeSelection, datetimeIanaRenderTick
- Add: rowKey, isRowDeleted, cell
- Add: rowActions, entityRowActions, dropdownMenuRow
- Add: rowChromeH, stickyColumnsGroup, stickyColumnsState
- Add: onEntityRowClick, handlePreviewRow, toggleRowSelect
- Add: openRowDropdown, closeRowDropdown, handleEditRow
- Add: rowActionsComposable

**Type Strategy:**
- `rows: any` (resolve type conflict by using `any`)
- `rowKey: any` (defer generic)
- `cell: any`

**Code Example - After Group 3:**
```svelte
<script lang="ts">
  let {
    // ... previous props ...
    error,
    errorView,
    rowsLoadingView,
    loadingText,
    rows,
    extraCols,
    emptyView,
    emptyText,
    showSelectedOnly,
    selectionCount,
    orderedSelectedRows,
    rowRangeSelection,
    datetimeIanaRenderTick,
    rowKey,
    isRowDeleted,
    cell,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    rowChromeH,
    stickyColumnsGroup,
    stickyColumnsState,
    onEntityRowClick,
    handlePreviewRow,
    toggleRowSelect,
    openRowDropdown,
    closeRowDropdown,
    handleEditRow,
    rowActionsComposable
  }: EntityListTableTableViewProps = $props();

  type EntityListTableTableViewProps = {
    // ... previous types ...
    error: string | null;
    errorView?: (() => void) | null;
    rowsLoadingView?: (() => void) | null;
    loadingText: string;
    rows: any;
    extraCols: any[];
    emptyView?: (() => void) | null;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: any[];
    rowRangeSelection: any;
    datetimeIanaRenderTick: number;
    rowKey: any;
    isRowDeleted: (row: any) => boolean;
    cell: any;
    rowActions: any;
    entityRowActions: any;
    dropdownMenuRow: any | null;
    rowChromeH: string;
    stickyColumnsGroup: any[];
    stickyColumnsState: any;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    handlePreviewRow: (row: any) => void;
    toggleRowSelect: (key: string) => void;
    openRowDropdown: (row: any) => void;
    closeRowDropdown: () => void;
    handleEditRow: (row: any) => void;
    rowActionsComposable: any;
  };
</script>
```

**Verification:** `pnpm run check` after each prop group

### Step 6: Incrementally Add Props - Group 4: PreviewPanel Props
**Action:** Add PreviewPanel-related props
- Add: uid, pageSize, page, onPageChange
- Add: entity, columns, stickyColumns, dataColumns, auditingColumns
- Add: rowActionsEnabled, selectedKeys
- Add: footerRangeTotal, footerPage, previewDropdownOpen
- Add: navigatePreview

**Type Strategy:**
- `columns: any[] | undefined`
- `stickyColumns: any[] | undefined`
- `dataColumns: any[] | undefined`
- `auditingColumns: any[] | undefined`
- `selectedKeys: any[]`

**Code Example - After Group 4 (Complete Props):**
```svelte
<script lang="ts">
  let {
    // ... all previous props ...
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
    selectedKeys,
    footerRangeTotal,
    footerPage,
    previewDropdownOpen,
    navigatePreview
  }: EntityListTableTableViewProps = $props();

  type EntityListTableTableViewProps = {
    // ... all previous types ...
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
    selectedKeys: any[];
    footerRangeTotal: number;
    footerPage: number;
    previewDropdownOpen: boolean;
    navigatePreview: (direction: number) => void;
  };
</script>
```

**Verification:** `pnpm run check` after each prop group

### Step 7: Implement Component Structure
**Action:** Add the component markup structure
- Add outer div with role="region"
- Add Table.Root with bind:ref and classes
- Add EntityListTableHeaderRow component
- Add TableBody component
- Add PreviewPanelWrapper component

**Code Example - Component Structure:**
```svelte
<script lang="ts">
  import { Table } from '$lib/components/ui';
  import { cn } from '$lib/utils';
  import TableBody from './TableBody.svelte';
  import PreviewPanelWrapper from './PreviewPanelWrapper.svelte';
  import EntityListTableHeaderRow from './EntityListTableHeaderRow.svelte';

  // ... all props from previous steps ...
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="flex h-full overflow-hidden" role="region" aria-label="Table and preview panel">
  <div class="flex-1 min-w-0 overflow-hidden">
    <Table.Root
      bind:ref={tableRef}
      class={cn(
        'w-full bg-background **:data-[slot=table]:isolate **:data-[slot=table]:bg-background **:data-[slot=table-cell]:bg-clip-border [&_[data-slot=table-cell]:not(.sticky)]:bg-background dark:[&_[data-slot=table-cell]:not(.sticky)]:bg-neutral-950 [&_[data-slot=table-head]:not(.sticky)]:bg-neutral-50 dark:[&_[data-slot=table-head]:not(.sticky)]:bg-neutral-900',
        tableDensityClass
      )}
      containerClass="h-full overflow-auto"
    >
      <EntityListTableHeaderRow
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
      />
      <TableBody
        error={error}
        errorView={errorView}
        rowsLoading={rowsLoading}
        rowsLoadingView={rowsLoadingView}
        loadingText={loadingText}
        rows={rows}
        viewRows={viewRows}
        shownColumns={shownColumns}
        extraCols={extraCols}
        emptyView={emptyView}
        emptyText={emptyText}
        showSelectedOnly={showSelectedOnly}
        selectionCount={selectionCount}
        orderedSelectedRows={orderedSelectedRows}
        rowSelectionEnabled={rowSelectionEnabled}
        selectedKeys={selectedKeys}
        rowRangeSelection={rowRangeSelection}
        datetimeIanaRenderTick={datetimeIanaRenderTick}
        rowKey={rowKey}
        isRowDeleted={isRowDeleted}
        previewPanel={previewPanel}
        actionsEnabled={actionsEnabled}
        rowChromeH={rowChromeH}
        stickyColumnsGroup={stickyColumnsGroup}
        onLoadVersionHistory={() => {}}
        stickyColumnsState={stickyColumnsState}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        cell={cell}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        onRowRangeMouseDown={(index: number, e: MouseEvent) => rowRangeSelection.onRowRangeMouseDown(index, e)}
        onEntityRowClick={onEntityRowClick}
        onPreviewRow={handlePreviewRow}
        onToggleRowSelect={toggleRowSelect}
        onOpenRowDropdown={openRowDropdown}
        onCloseRowDropdown={closeRowDropdown}
        onEditRow={handleEditRow}
        onDuplicateRow={(row: any) => rowActionsComposable.handleDuplicateRow(row)}
        onDeleteRow={(row: any) => rowActionsComposable.handleDeleteRow(row)}
        onRestoreRow={(row: any) => rowActionsComposable.handleRestoreRow(row)}
        stickyCellClass={(key, idx, isHeader) => {
          // Import stickyCellClassWithCompute from utils
          // For now, return undefined
          return undefined;
        }}
      />
    </Table.Root>
  </div>

  <PreviewPanelWrapper
    {previewPanel}
    {rows}
    {viewRows}
    {uid}
    {pageSize}
    {page}
    {onPageChange}
    {entity}
    {columns}
    {stickyColumns}
    {dataColumns}
    {auditingColumns}
    {rowActionsEnabled}
    {rowActions}
    {entityRowActions}
    {datetimeIanaModeByKey}
    {isRowDeleted}
    {rowKey}
    {rowSelectionEnabled}
    selectedKeys={selectedKeys as Set<string> | string[]}
    footerRangeTotal={footerRangeTotal}
    footerPage={footerPage}
    {previewDropdownOpen}
    navigatePreview={navigatePreview}
    onEditRow={handleEditRow}
    onDuplicateRow={(row: any) => rowActionsComposable.handleDuplicateRow(row)}
    onDeleteRow={(row: any) => rowActionsComposable.handleDeleteRow(row)}
    onRestoreRow={(row: any) => rowActionsComposable.handleRestoreRow(row)}
    onPreviewDropdownOpenChange={(open: boolean) => previewDropdownOpen = open}
    {rowsLoading}
    {cell}
  />
</div>
```

**Verification:** `pnpm run check` - should pass

### Step 8: Wire Up EntityListTableHeaderRow
**Action:** Pass props to EntityListTableHeaderRow
- Map component props to header row props
- Ensure all required props are passed

**Code Example - EntityListTableHeaderRow Props:**
```svelte
<EntityListTableHeaderRow
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
/>
```

**Verification:** `pnpm run check`

### Step 9: Wire Up TableBody
**Action:** Pass props to TableBody
- Map component props to TableBody props
- Handle inline handlers (onRowRangeMouseDown, onDuplicateRow, onDeleteRow, onRestoreRow, stickyCellClass)
- Keep inline handlers in main component for now

**Code Example - TableBody Props:**
```svelte
<TableBody
  error={error}
  errorView={errorView}
  rowsLoading={rowsLoading}
  rowsLoadingView={rowsLoadingView}
  loadingText={loadingText}
  rows={rows}
  viewRows={viewRows}
  shownColumns={shownColumns}
  extraCols={extraCols}
  emptyView={emptyView}
  emptyText={emptyText}
  showSelectedOnly={showSelectedOnly}
  selectionCount={selectionCount}
  orderedSelectedRows={orderedSelectedRows}
  rowSelectionEnabled={rowSelectionEnabled}
  selectedKeys={selectedKeys}
  rowRangeSelection={rowRangeSelection}
  datetimeIanaRenderTick={datetimeIanaRenderTick}
  rowKey={rowKey}
  isRowDeleted={isRowDeleted}
  previewPanel={previewPanel}
  actionsEnabled={actionsEnabled}
  rowChromeH={rowChromeH}
  stickyColumnsGroup={stickyColumnsGroup}
  onLoadVersionHistory={() => {}}
  stickyColumnsState={stickyColumnsState}
  datetimeIanaModeByKey={datetimeIanaModeByKey}
  cell={cell}
  rowActions={rowActions}
  entityRowActions={entityRowActions}
  dropdownMenuRow={dropdownMenuRow}
  onRowRangeMouseDown={(index: number, e: MouseEvent) => rowRangeSelection.onRowRangeMouseDown(index, e)}
  onEntityRowClick={onEntityRowClick}
  onPreviewRow={handlePreviewRow}
  onToggleRowSelect={toggleRowSelect}
  onOpenRowDropdown={openRowDropdown}
  onCloseRowDropdown={closeRowDropdown}
  onEditRow={handleEditRow}
  onDuplicateRow={(row: any) => rowActionsComposable.handleDuplicateRow(row)}
  onDeleteRow={(row: any) => rowActionsComposable.handleDeleteRow(row)}
  onRestoreRow={(row: any) => rowActionsComposable.handleRestoreRow(row)}
  stickyCellClass={(key, idx, isHeader) => {
    // Import and use stickyCellClassWithCompute from utils
    // This is a temporary placeholder - will be fixed in Step 7
    return undefined;
  }}
/>
```

**Verification:** `pnpm run check`

### Step 10: Wire Up PreviewPanelWrapper
**Action:** Pass props to PreviewPanelWrapper
- Map component props to PreviewPanelWrapper props
- Handle inline handlers (onEditRow, onDuplicateRow, onDeleteRow, onRestoreRow, onPreviewDropdownOpenChange)
- Keep inline handlers in main component for now

**Code Example - PreviewPanelWrapper Props:**
```svelte
<PreviewPanelWrapper
  {previewPanel}
  {rows}
  {viewRows}
  {uid}
  {pageSize}
  {page}
  {onPageChange}
  {entity}
  {columns}
  {stickyColumns}
  {dataColumns}
  {auditingColumns}
  {rowActionsEnabled}
  {rowActions}
  {entityRowActions}
  {datetimeIanaModeByKey}
  {isRowDeleted}
  {rowKey}
  {rowSelectionEnabled}
  selectedKeys={selectedKeys as Set<string> | string[]}
  footerRangeTotal={footerRangeTotal}
  footerPage={footerPage}
  {previewDropdownOpen}
  navigatePreview={navigatePreview}
  onEditRow={handleEditRow}
  onDuplicateRow={(row: any) => rowActionsComposable.handleDuplicateRow(row)}
  onDeleteRow={(row: any) => rowActionsComposable.handleDeleteRow(row)}
  onRestoreRow={(row: any) => rowActionsComposable.handleRestoreRow(row)}
  onPreviewDropdownOpenChange={(open: boolean) => previewDropdownOpen = open}
  {rowsLoading}
  {cell}
/>
```

**Verification:** `pnpm run check`

### Step 11: Update EntityListTable.svelte
**Action:** Replace table view section with component
- Import EntityListTableTableView
- Replace lines 1149-1263 with component usage
- Pass all props from Step 3-6

**Code Example - Import Statement:**
```svelte
// Add to imports in EntityListTable.svelte
import EntityListTableTableView from './components/EntityListTableTableView.svelte';
```

**Code Example - Replace Table View Section:**
```svelte
// BEFORE (lines 1149-1263):
{#if viewMode === 'table'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="flex h-full overflow-hidden" role="region" aria-label="Table and preview panel">
    <div class="flex-1 min-w-0 overflow-hidden">
      <Table.Root
        bind:ref={tableRef}
        class={cn(
          'w-full bg-background **:data-[slot=table]:isolate **:data-[slot=table]:bg-background **:data-[slot=table-cell]:bg-clip-border [&_[data-slot=table-cell]:not(.sticky)]:bg-background dark:[&_[data-slot=table-cell]:not(.sticky)]:bg-neutral-950 [&_[data-slot=table-head]:not(.sticky)]:bg-neutral-50 dark:[&_[data-slot=table-head]:not(.sticky)]:bg-neutral-900',
          tableDensityClass
        )}
        containerClass="h-full overflow-auto"
      >
        <EntityListTableHeaderRow
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
        />
        <TableBody
          error={error}
          errorView={errorView}
          rowsLoading={rowsLoading}
          rowsLoadingView={rowsLoadingView}
          loadingText={loadingText}
          rows={rows}
          viewRows={viewRows}
          shownColumns={shownColumns}
          extraCols={extraCols}
          emptyView={emptyView}
          emptyText={emptyText}
          showSelectedOnly={showSelectedOnly}
          selectionCount={selectionCount}
          orderedSelectedRows={orderedSelectedRows}
          rowSelectionEnabled={rowSelectionEnabled}
          selectedKeys={selectedKeys}
          rowRangeSelection={rowRangeSelection}
          datetimeIanaRenderTick={datetimeIanaRenderTick}
          rowKey={rowKey}
          isRowDeleted={isRowDeleted}
          previewPanel={previewPanel}
          actionsEnabled={actionsEnabled}
          rowChromeH={rowChromeH}
          stickyColumnsGroup={stickyColumnsGroup}
          onLoadVersionHistory={() => {}}
          stickyColumnsState={stickyColumnsState}
          datetimeIanaModeByKey={datetimeIanaModeByKey}
          cell={cell}
          rowActions={rowActions}
          entityRowActions={entityRowActions}
          dropdownMenuRow={dropdownMenuRow}
          onRowRangeMouseDown={(index: number, e: MouseEvent) => rowRangeSelection.onRowRangeMouseDown(index, e)}
          onEntityRowClick={onEntityRowClick}
          onPreviewRow={handlePreviewRow}
          onToggleRowSelect={toggleRowSelect}
          onOpenRowDropdown={openRowDropdown}
          onCloseRowDropdown={closeRowDropdown}
          onEditRow={handleEditRow}
          onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
          onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
          onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
          stickyCellClass={(key, idx, isHeader) => stickyCellClassWithCompute(key, stickyColumnsGroup, visibleKeys, isHeader)}
        />
      </Table.Root>
    </div>

    <PreviewPanelWrapper
      {previewPanel}
      {rows}
      {viewRows}
      {uid}
      {pageSize}
      {page}
      {onPageChange}
      {entity}
      {columns}
      {stickyColumns}
      {dataColumns}
      {auditingColumns}
      {rowActionsEnabled}
      {rowActions}
      {entityRowActions}
      {datetimeIanaModeByKey}
      {isRowDeleted}
      {rowKey}
      {rowSelectionEnabled}
      selectedKeys={selectedKeys as Set<string> | string[]}
      footerRangeTotal={footerRangeTotal}
      footerPage={footerPage}
      {previewDropdownOpen}
      navigatePreview={navigatePreview}
      onEditRow={handleEditRow}
      onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
      onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
      onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
      onPreviewDropdownOpenChange={(open: boolean) => previewDropdownOpen = open}
      {rowsLoading}
      {cell}
    />
  </div>
{/if}

// AFTER (replace with):
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
```

**Verification:** `pnpm run check`

### Step 12: Type Check and Fix (Iteration 1)
**Action:** Run type check and fix any errors
- If errors occur, identify the specific prop causing the issue
- Adjust type definition in component
- Re-run check

**Common Type Errors and Fixes:**

**Error 1: `rows` type conflict**
```
Error: Type 'number' is not assignable to type 'any[]'.
```
**Fix:** Change `rows: any` to `rows: any[]` in component props

**Error 2: Column arrays undefined**
```
Error: Type 'MetaColumn[] | undefined' is not assignable to type 'any[]'.
```
**Fix:** Change column array types to `any[] | undefined` in component props

**Error 3: Generic type mismatch**
```
Error: Type 'TRow[]' is not assignable to type 'any[]'.
```
**Fix:** Use `any[]` instead of generics in component props

**Max attempts:** 2 (per guardrails)

### Step 13: Type Check and Fix (Iteration 2)
**Action:** If iteration 1 failed, try alternative approach
- Consider using `any` for problematic props
- Consider optional chaining for undefined props
- Consider type assertions as last resort

**Alternative Fix Examples:**

**Option 1: Use `any` for all complex props**
```typescript
type EntityListTableTableViewProps = {
  // ... simple types ...
  rows: any;
  columns: any;
  stickyColumns: any;
  dataColumns: any;
  auditingColumns: any;
  viewRows: any;
  // ... handlers ...
};
```

**Option 2: Use optional chaining in component**
```svelte
<TableBody
  rows={rows ?? []}
  columns={columns ?? []}
  stickyColumns={stickyColumns ?? []}
  dataColumns={dataColumns ?? []}
  auditingColumns={auditingColumns ?? []}
  {...}
/>
```

**Option 3: Type assertion (last resort)**
```svelte
<TableBody
  rows={rows as any[]}
  columns={columns as any[]}
  {...}
/>
```

**Max attempts:** 2 (per guardrails)

### Step 14: If Type Check Fails - Rollback Strategy
**Action:** If type check still fails after 2 iterations
- Delete EntityListTableTableView.svelte
- Revert EntityListTable.svelte changes
- Document the specific type errors encountered
- Update plan with alternative approach

**Rollback Commands:**
```bash
# Delete the new component
rm src/lib/components/entity-list-table/components/EntityListTableTableView.svelte

# Revert EntityListTable.svelte changes
git checkout src/lib/components/entity-list-table/EntityListTable.svelte

# Remove import statement if added
# Manually edit to remove: import EntityListTableTableView from './components/EntityListTableTableView.svelte';
```

**Acceptance Criteria:** Rollback is acceptable for HIGH RISK phase

### Step 15: If Type Check Succeeds - Final Verification
**Action:** Final verification steps
- Run `pnpm run check` - should pass with no new errors
- Run `pnpm run dev` - should start without errors
- Manual test: Verify table view renders correctly
- Manual test: Verify sorting works
- Manual test: Verify preview panel works

**Verification Commands:**
```bash
# Type check
pnpm run check

# Start dev server
pnpm run dev

# Expected: No new errors in EntityListTable or EntityListTableTableView
```

**Manual Test Checklist:**
- [ ] Table view renders with correct data
- [ ] Column headers display correctly
- [ ] Sorting by clicking column headers works
- [ ] Row selection works
- [ ] Preview panel opens on row click
- [ ] Preview panel navigation works
- [ ] Sticky columns work correctly
- [ ] Datetime IANA toggle works

## Acceptance Criteria
- Component compiles without type errors
- No new errors introduced in EntityListTable.svelte
- Table view renders correctly
- Sorting functionality works
- Preview panel functionality works
- File size reduction: ~115 lines

## Rollback Criteria
- Type check fails after 2 self-correction attempts
- Runtime errors during manual testing
- Breaking changes to existing functionality

## Notes
- This is a HIGH RISK phase per the original plan
- Using `any` types is acceptable to avoid type conflicts
- Inline handlers can remain in main component initially
- Further handler extraction can be done in a separate phase
