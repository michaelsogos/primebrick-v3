# EntityListTable.svelte Refactoring - Phase 4: Extract Row Components

## Overview

This phase focuses on extracting row rendering components from the main `EntityListTable.svelte` component. These are self-contained rendering units that can be extracted into separate components.

**Target Lines:** ~550 lines  
**Risk Level:** Medium  
**Estimated Time:** 2-3 hours

## Key Findings & Corrections

**Important Discovery:** Several components already exist but are NOT being used in the main component:
- `CardGrid.svelte` and `CardList.svelte` exist but main component has inline card rendering
- `TableCell.svelte` exists but main component still uses `listDefaultCellValue` snippet
- `CardField.svelte` exists but main component still uses `entityCardField` snippet

**Corrected Line Numbers:**
- Table row rendering: Lines 2417-2611 (not 3023-3220 as originally planned)
- Card row rendering: Lines 1876-2173 (not 2500-2900 as originally planned)
- Cell value snippet: Lines 1483-1538 (not 2022-2077 as originally planned)
- Card field snippet: Lines 1439-1481 (additional extraction needed)

**Strategy Change:**
Instead of creating new components, this phase will:
1. Create new `TableRow.svelte` component (doesn't exist)
2. Integrate existing `CardGrid.svelte` and `CardList.svelte` (update them to match inline logic)
3. Replace `listDefaultCellValue` snippet with existing `TableCell.svelte` (update if needed)
4. Replace `entityCardField` snippet with existing `CardField.svelte` (update if needed)

---

## Tasks

### 4.1 Table Row Component
**Status:** ⚠️ NEEDS EXTRACTION - TableRow component doesn't exist yet

**Action:** Extract table row rendering from main component to new `table/TableRow.svelte`

**Target:** Lines 2417-2611 (~194 lines)

**New File:** `src/lib/components/entity-list-table/table/TableRow.svelte`

**Current Code Structure (Lines 2417-2611):**
```svelte
{#key datetimeIanaRenderTick}
{#each viewRows as r, i (rowKey(r))}
  {@const rk = rowKey(r)}
  {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
  {@const rowDeleted = isRowDeleted(r)}
  {@const rowFocused = previewPanel.focusedRowIndex === i}
  <Table.Row
    suppressCellHoverMuted
    data-row-index={rowSelectionEnabled ? i : undefined}
    data-focused-row-index={rowFocused ? i : undefined}
    data-state={rowSelected ? 'selected' : undefined}
    class={cn(
      'group/entity-row',
      rowSelected ? 'data-[state=selected]:bg-transparent!' : undefined,
      rowFocused ? 'border-2 border-primary ring-2 ring-primary/20' : ''
    )}
    onmousedown={rowSelectionEnabled ? (e) => rowRangeSelection.onRowRangeMouseDown(i, e) : undefined}
    onclick={rowSelectionEnabled ? (e) => onEntityRowClick(rk, e) : undefined}
    ondblclick={() => handlePreviewRow(r)}
  >
    {#if rowSelectionEnabled}
      <Table.Cell
        class={cn(
          'w-10 min-w-10 max-w-10 sticky left-0 z-50 bg-clip-border p-2',
          rowDeleted
            ? entityListDestructiveChromeCellClass(rowSelected)
            : entityListGrayChromeCellClass(rowSelected)
        )}
      >
        <div class={cn('flex items-center justify-center', rowChromeH)}>
          <Checkbox
            class={checkboxInteractiveClass}
            checked={selectedKeys.includes(rk)}
            onCheckedChange={() => toggleRowSelect(rk)}
            aria-label="select row"
          />
        </div>
      </Table.Cell>
    {/if}
    {#each shownColumns as col, colIdx (col.key)}
      {#if stickyColumnsGroup.some((s) => s.key === col.key)}
        {#if i === 0}
          <Table.Cell
            style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
            class={cn(
              stickyCellClass(col.key, colIdx, false),
              datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
              isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
                ? undefined
                : (rowDeleted
                  ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                  : entityListGrayBandStickyInteractionClass(rowSelected)),
              entityListDataCellValignClass(col)
            )}
          >
            <div use:stickyColumnsState.stickyRef={{ key: col.key, isHead: false }}>
            {#if cell}
              {@render cell({ row: r, column: col })}
            {:else}
              {@render listDefaultCellValue(r, col)}
            {/if}
            </div>
          </Table.Cell>
        {:else}
          <Table.Cell
            style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
            class={cn(
              stickyCellClass(col.key, colIdx, false),
              datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
              isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
                ? undefined
                : (rowDeleted
                  ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                  : entityListGrayBandStickyInteractionClass(rowSelected)),
              entityListDataCellValignClass(col)
            )}
          >
            {#if cell}
              {@render cell({ row: r, column: col })}
            {:else}
              {@render listDefaultCellValue(r, col)}
            {/if}
          </Table.Cell>
        {/if}
      {:else}
        <Table.Cell
          class={cn(
            stickyCellClass(col.key, colIdx, false),
            datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
            isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
              ? undefined
              : (rowDeleted
                ? entityListDestructiveScrollInteractionClass(rowSelected)
                : entityListDefaultScrollInteractionClass(rowSelected)),
            entityListDataCellValignClass(col)
          )}
        >
          {#if cell}
            {@render cell({ row: r, column: col })}
          {:else}
            {@render listDefaultCellValue(r, col)}
          {/if}
        </Table.Cell>
      {/if}
    {/each}
    {#if actionsEnabled}
      <Table.Cell
        class={cn(
          'w-10 min-w-10 max-w-10 sticky right-0 z-50 bg-clip-border p-2',
          entityListGrayChromeCellClass(rowSelected)
        )}
      >
        <div class={cn('flex items-center justify-center', rowChromeH)}>
          {#if rowActions}
            {@render rowActions({ row: r })}
          {:else}
            <DropdownMenu.Root open={dropdownMenuRow === r} onOpenChange={(open) => { if (!open) closeRowDropdown(); }}>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button 
                    {...props}
                    variant="ghost" 
                    size="icon-sm" 
                    aria-label="row actions" 
                    title="actions"
                    onclick={(e) => {
                      e.stopPropagation();
                      openRowDropdown(r);
                    }}
                  >
                    <MoreVertical class="size-4" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content class="w-56" align="end">
                {#if entityRowActions?.edit !== false}
                  <DropdownMenu.Item
                    onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleEditRow(r); }}
                    class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                  >
                    <div class="flex items-center gap-2">
                      <Pencil class="size-4 opacity-70" />
                      <span>{$t('common.edit')}</span>
                    </div>
                  </DropdownMenu.Item>
                {/if}
                {#if entityRowActions?.duplicate !== false}
                  <DropdownMenu.Item
                    onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; rowActionsComposable.handleDuplicateRow(r); }}
                    class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                  >
                    <div class="flex items-center gap-2">
                      <Copy class="size-4 opacity-70" />
                      <span>{$t('common.duplicate')}</span>
                    </div>
                  </DropdownMenu.Item>
                {/if}
                <DropdownMenu.Item
                  onclick={(e) => { e.stopPropagation(); loadVersionHistory(r); }}
                >
                  <div class="flex items-center gap-2">
                    <FileClock class="size-4 opacity-70" />
                    <span>{$t('common.versionHistory')}</span>
                  </div>
                </DropdownMenu.Item>
                {#if entityRowActions?.preview !== false}
                  <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handlePreviewRow(r); }}>
                    <div class="flex items-center gap-2">
                      <Eye class="size-4 opacity-70" />
                      <span>{$t('entities.list.preview')}</span>
                    </div>
                  </DropdownMenu.Item>
                {/if}
                {#if entityRowActions?.delete !== false}
                  <DropdownMenu.Separator />
                  {#if isRowDeleted(r)}
                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleRestoreRow(r); }} class="text-warning">
                      <div class="flex items-center gap-2">
                        <span class="relative flex items-center justify-center">
                          <Trash2 class="size-4 text-warning/70" />
                          <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                        </span>
                        <span>{$t('common.restore')}</span>
                      </div>
                    </DropdownMenu.Item>
                  {:else}
                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleDeleteRow(r); }} class="text-destructive">
                      <div class="flex items-center gap-2">
                        <Trash2 class="size-4 text-destructive/70" />
                        <span>{$t('common.delete')}</span>
                      </div>
                    </DropdownMenu.Item>
                  {/if}
                {/if}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {/if}
        </div>
      </Table.Cell>
    {/if}
  </Table.Row>
{/each}
{/key}
```

**Extract:**
- Table row rendering with conditional styling
- Sticky column handling with left offsets
- Cell rendering with all conditional logic
- Row dropdown menu with actions
- Row selection checkbox
- Row click and double-click handlers

**Props:**
```typescript
interface TableRowProps<TRow> {
  row: TRow;
  rowIndex: number;
  rowKey: string;
  rowSelected: boolean;
  rowDeleted: boolean;
  rowFocused: boolean;
  columns: MetaColumn[];
  stickyColumns: MetaColumn[];
  stickyLeftOffsets: Record<string, number>;
  rowSelectionEnabled: boolean;
  actionsEnabled: boolean;
  cell?: Snippet<[CellArgs]>;
  rowActions?: Snippet<[RowArgs]>;
  entityRowActions?: { edit?: boolean; duplicate?: boolean; delete?: boolean; preview?: boolean };
  onRowSelect: (key: string) => void;
  onRowClick: (key: string, e: MouseEvent) => void;
  onRowDoubleClick: (row: TRow) => void;
  onEditRow: (row: TRow) => void;
  onDuplicateRow: (row: TRow) => void;
  onDeleteRow: (row: TRow) => void;
  onRestoreRow: (row: TRow) => void;
  onPreviewRow: (row: TRow) => void;
  onLoadVersionHistory: (row: TRow) => void;
  onRowDropdownOpen: (row: TRow) => void;
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
  dropdownMenuRow: TRow | null;
  rowChromeH: string;
  stickyCellClass: (key: string, idx: number, isHead: boolean) => string;
}
```

**Steps:**
1. Read `EntityListTable.svelte` lines 2417-2611
2. Extract table row rendering logic including all conditional logic for sticky columns
3. Create `src/lib/components/entity-list-table/table/TableRow.svelte`
4. Add extracted rendering to new component with proper props
5. Define props interface using Svelte 5 runes
6. Update imports in `EntityListTable.svelte` to include TableRow
7. Replace extracted code (lines 2417-2611) with `<TableRow />` component call
8. Test table row rendering works correctly

---

### 4.2 Card Row Component
**Status:** ⚠️ NEEDS EXTRACTION - CardGrid and CardList exist but are NOT being used

**Action:** Extract card row rendering from main component and integrate with existing `cards/CardGrid.svelte` and `cards/CardList.svelte`

**Target:** Lines 1876-2173 (~297 lines)

**Existing Files:** 
- `src/lib/components/entity-list-table/cards/CardGrid.svelte` (already exists, not used)
- `src/lib/components/entity-list-table/cards/CardList.svelte` (already exists, not used)
- `src/lib/components/entity-list-table/cards/CardField.svelte` (already exists, not used)

**Current Code Structure (Lines 1876-2173):**
```svelte
<div class="p-3">
  <div
    class={cn(
      viewMode === 'cards_list'
        ? 'flex flex-col gap-3'
        : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    )}
  >
    {#each viewRows as r (rowKey(r))}
      {@const rk = rowKey(r)}
      {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
      {@const rowDeleted = isRowDeleted(r)}
      {@const rowFocused = previewPanel.focusedRowIndex !== null && viewRows[previewPanel.focusedRowIndex] === r}
      <div
        role="button"
        tabindex={rowSelectionEnabled ? 0 : -1}
        aria-disabled={!rowSelectionEnabled}
        data-state={rowSelected ? 'selected' : undefined}
        class={cn(
          'group rounded-md border bg-background p-3 shadow-sm transition-colors',
          viewMode === 'cards_list'
            ? 'flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:gap-4'
            : undefined,
        rowSelectionEnabled
          ? rowSelected
            ? 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800'
            : 'cursor-pointer hover:bg-accent/40'
          : undefined,
        rowSelected
          ? 'bg-neutral-50 ring-1 ring-primary/40 dark:bg-neutral-700 dark:ring-primary/35'
          : undefined,
        rowFocused ? 'border-2 border-primary ring-2 ring-primary/20' : ''
      )}
        onclick={(e) => {
          if (!rowSelectionEnabled) return;
          onEntityCardClick(rk, e);
        }}
        onkeydown={
          (e) => {
            if (!rowSelectionEnabled) return;
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggleRowSelect(rk);
          }
        }
      >
        {#if viewMode === 'cards_list'}
          <div
            class="flex w-full shrink-0 items-start justify-between gap-2 sm:w-auto sm:flex-col sm:items-stretch sm:gap-2"
          >
            {#if rowSelectionEnabled}
              <div
                class="shrink-0"
                data-pb-card-cta
                role="button"
                tabindex="-1"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
              >
                <Checkbox
                  class={checkboxInteractiveClass}
                  checked={selectedKeys.includes(rk)}
                  onCheckedChange={() => toggleRowSelect(rk)}
                  aria-label={$t('entities.list.selectRow')}
                />
              </div>
            {/if}

            {#if actionsEnabled}
              <div
                class={cn('shrink-0', rowSelectionEnabled ? 'ml-auto sm:ml-0' : 'ml-auto')}
                data-pb-card-cta
                role="button"
                tabindex="-1"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
              >
                {#if rowActions}
                  {@render rowActions({ row: r })}
                {:else}
                  <DropdownMenu.Root open={dropdownMenuRow === r} onOpenChange={(open) => { if (!open) closeRowDropdown(); }}>
                    <DropdownMenu.Trigger>
                      {#snippet child({ props })}
                        <Button 
                          {...props}
                          variant="ghost" 
                          size="icon-sm" 
                          aria-label={$t('entities.list.rowActions')} 
                          title={$t('entities.list.rowActions')}
                          onclick={(e) => {
                            e.stopPropagation();
                            openRowDropdown(r);
                          }}
                        >
                          <MoreVertical class="size-4" />
                        </Button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content class="w-56" align="end">
                      {#if entityRowActions?.edit !== false}
                        <DropdownMenu.Item
                          onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleEditRow(r); }}
                          class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                        >
                          <div class="flex items-center gap-2">
                            <Pencil class="size-4 opacity-70" />
                            <span>{$t('common.edit')}</span>
                          </div>
                        </DropdownMenu.Item>
                      {/if}
                      {#if entityRowActions?.duplicate !== false}
                        <DropdownMenu.Item
                          onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; rowActionsComposable.handleDuplicateRow(r); }}
                          class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                        >
                          <div class="flex items-center gap-2">
                            <Copy class="size-4 opacity-70" />
                            <span>{$t('common.duplicate')}</span>
                          </div>
                        </DropdownMenu.Item>
                      {/if}
                      <DropdownMenu.Item
                        onclick={(e) => { e.stopPropagation(); loadVersionHistory(r); }}
                      >
                        <div class="flex items-center gap-2">
                          <FileClock class="size-4 opacity-70" />
                          <span>{$t('common.versionHistory')}</span>
                        </div>
                      </DropdownMenu.Item>
                      {#if entityRowActions?.preview !== false}
                        <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handlePreviewRow(r); }}>
                          <div class="flex items-center gap-2">
                            <Eye class="size-4 opacity-70" />
                            <span>{$t('entities.list.preview')}</span>
                          </div>
                        </DropdownMenu.Item>
                      {/if}
                      {#if entityRowActions?.delete !== false}
                        <DropdownMenu.Separator />
                        {#if isRowDeleted(r)}
                          <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleRestoreRow(r); }} class="text-warning">
                            <div class="flex items-center gap-2">
                              <span class="relative flex items-center justify-center">
                                <Trash2 class="size-4 text-warning/70" />
                                <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                              </span>
                              <span>{$t('common.restore')}</span>
                            </div>
                          </DropdownMenu.Item>
                        {:else}
                          <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleDeleteRow(r); }} class="text-destructive">
                            <div class="flex items-center gap-2">
                              <Trash2 class="size-4 text-destructive/70" />
                              <span>{$t('common.delete')}</span>
                            </div>
                          </DropdownMenu.Item>
                        {/if}
                      {/if}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                {/if}
              </div>
            {/if}
          </div>

          <div class="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-3">
            {#each shownColumns as col (col.key)}
              {@render entityCardField(r, col, rowSelected, rowDeleted)}
            {/each}
          </div>
        {:else}
          <div class="mb-2 flex items-start justify-between gap-2">
            {#if rowSelectionEnabled}
              <div
                class="shrink-0"
                data-pb-card-cta
                role="button"
                tabindex="-1"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
              >
                <Checkbox
                  class={checkboxInteractiveClass}
                  checked={selectedKeys.includes(rk)}
                  onCheckedChange={() => toggleRowSelect(rk)}
                  aria-label={$t('entities.list.selectRow')}
                />
              </div>
            {/if}

            {#if actionsEnabled}
              <div
                class="ml-auto shrink-0"
                data-pb-card-cta
                role="button"
                tabindex="-1"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
              >
                {#if rowActions}
                  {@render rowActions({ row: r })}
                {:else}
                  <DropdownMenu.Root open={dropdownMenuRow === r} onOpenChange={(open) => { if (!open) closeRowDropdown(); }}>
                    <DropdownMenu.Trigger>
                      {#snippet child({ props })}
                        <Button 
                          {...props}
                          variant="ghost" 
                          size="icon-sm" 
                          aria-label={$t('entities.list.rowActions')} 
                          title={$t('entities.list.rowActions')}
                          onclick={(e) => {
                            e.stopPropagation();
                            openRowDropdown(r);
                          }}
                        >
                          <MoreVertical class="size-4" />
                        </Button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content class="w-56" align="end">
                      {#if entityRowActions?.edit !== false}
                        <DropdownMenu.Item
                          onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleEditRow(r); }}
                          class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                        >
                          <div class="flex items-center gap-2">
                            <Pencil class="size-4 opacity-70" />
                            <span>{$t('common.edit')}</span>
                          </div>
                        </DropdownMenu.Item>
                      {/if}
                      {#if entityRowActions?.duplicate !== false}
                        <DropdownMenu.Item
                          onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; rowActionsComposable.handleDuplicateRow(r); }}
                          class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                        >
                          <div class="flex items-center gap-2">
                            <Copy class="size-4 opacity-70" />
                            <span>{$t('common.duplicate')}</span>
                          </div>
                        </DropdownMenu.Item>
                      {/if}
                      <DropdownMenu.Item
                        onclick={(e) => { e.stopPropagation(); loadVersionHistory(r); }}
                      >
                        <div class="flex items-center gap-2">
                          <FileClock class="size-4 opacity-70" />
                          <span>{$t('common.versionHistory')}</span>
                        </div>
                      </DropdownMenu.Item>
                      {#if entityRowActions?.preview !== false}
                        <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handlePreviewRow(r); }}>
                          <div class="flex items-center gap-2">
                            <Eye class="size-4 opacity-70" />
                            <span>{$t('entities.list.preview')}</span>
                          </div>
                        </DropdownMenu.Item>
                      {/if}
                      {#if entityRowActions?.delete !== false}
                        <DropdownMenu.Separator />
                        {#if isRowDeleted(r)}
                          <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleRestoreRow(r); }} class="text-warning">
                            <div class="flex items-center gap-2">
                              <span class="relative flex items-center justify-center">
                                <Trash2 class="size-4 text-warning/70" />
                                <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                              </span>
                              <span>{$t('common.restore')}</span>
                            </div>
                          </DropdownMenu.Item>
                        {:else}
                          <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleDeleteRow(r); }} class="text-destructive">
                            <div class="flex items-center gap-2">
                              <Trash2 class="size-4 text-destructive/70" />
                              <span>{$t('common.delete')}</span>
                            </div>
                          </DropdownMenu.Item>
                        {/if}
                      {/if}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                {/if}
              </div>
            {/if}
          </div>

          <div class="flex flex-col gap-2">
            {#each shownColumns as col (col.key)}
              {@render entityCardField(r, col, rowSelected, rowDeleted)}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
```

**Extract:**
- Card row rendering with conditional display (cards_list vs cards_grid)
- Card action buttons and dropdown menu
- Card selection checkbox
- Card click handlers
- Card field rendering (entityCardField snippet at lines 1439-1481)
- Integration with existing CardField component

**Important Notes:**
- The existing `CardGrid.svelte` and `CardList.svelte` components are NOT currently being used in the main component
- The main component has inline card rendering that needs to be moved to these existing components
- The `entityCardField` snippet (lines 1439-1481) should be replaced with the existing `CardField.svelte` component
- Need to update existing CardGrid and CardList components to match the inline rendering logic

**Steps:**
1. Read `EntityListTable.svelte` lines 1876-2173 (card rendering)
2. Read `EntityListTable.svelte` lines 1439-1481 (entityCardField snippet)
3. Read existing `cards/CardGrid.svelte`, `cards/CardList.svelte`, and `cards/CardField.svelte`
4. Update existing CardGrid and CardList components to include all the inline rendering logic
5. Update CardField component if needed to match entityCardField snippet functionality
6. Update imports in `EntityListTable.svelte` 
7. Replace inline card rendering (lines 1876-2173) with `<CardGrid />` or `<CardList />` component calls based on viewMode
8. Remove entityCardField snippet (lines 1439-1481) as it will be replaced by CardField component
9. Test card row rendering works correctly

---

### 4.3 Cell Value Renderer
**Status:** ⚠️ NEEDS INTEGRATION - TableCell.svelte exists but listDefaultCellValue snippet is still used inline

**Action:** Replace `listDefaultCellValue` snippet with existing `table/TableCell.svelte` component

**Target:** Lines 1483-1538 (~55 lines) - `listDefaultCellValue` snippet

**Existing File:** `src/lib/components/entity-list-table/table/TableCell.svelte` (already exists, partially used)

**Current Code Structure (Lines 1483-1538):**
```svelte
{#snippet listDefaultCellValue(row: TRow, col: MetaColumn)}
    {@const value = row[col.key]}
    {#if col.type === 'boolean'}
      {#if value === true}
        <Tooltip.Root>
          <Tooltip.Trigger>
            <CircleCheck class="size-4 text-green-600 shrink-0" />
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{$t(`entities.userProfile.fields.${col.key}`)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      {:else if value === false}
        <Tooltip.Root>
          <Tooltip.Trigger>
            <CircleX class="size-4 text-muted-foreground shrink-0" />
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{$t(`entities.userProfile.fields.${col.key}_false`)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      {:else}
        <span class="min-w-0 truncate">-</span>
      {/if}
    {:else if col.badge?.values && value}
      {@const badgeValue = value as string}
      {@const badgeColors = badgeClassesFromToken(col.badge.values[badgeValue]?.color ?? null)}
      <Badge
        class="shadow-none"
        style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
      >
        {col.badge.values[badgeValue]?.labelText || $t(col.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)}
      </Badge>
    {:else if col.type === 'datetime'}
      {@const mode = datetimeIanaModeByKey[col.key] ?? 'browser'}
      {@const parts = formatDatetimeCellDisplay(
        col,
        row as Record<string, unknown>,
        $uiLang,
        mode
      )}
      {#if isDatetimeIanaRecordMode(col, datetimeIanaModeByKey) && parts.iana}
        <div class="flex min-w-0 flex-col gap-1">
          <span class="min-w-0 truncate">{parts.text}</span>
          <Badge
            variant="outline"
            class="w-fit max-w-full shrink truncate border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >{parts.iana}</Badge>
        </div>
      {:else}
        <span class="min-w-0 truncate">{parts.text}</span>
      {/if}
    {:else}
      <span class="min-w-0 truncate">{formatListCellValue(col, value, $uiLang)}</span>
    {/if}
  {/snippet}
```

**Existing TableCell.svelte Analysis:**
The existing `TableCell.svelte` component already handles:
- Boolean cell rendering with tooltips
- Badge cell rendering with color tokens  
- Datetime cell rendering
- Color cell rendering
- Default text cell rendering

**Differences to Address:**
1. The existing TableCell uses `formatListCellValue` for datetime, but the inline snippet uses `formatDatetimeCellDisplay` with IANA support
2. The inline snippet has more sophisticated IANA timezone badge rendering
3. Need to ensure TableCell supports the IANA toggle functionality

**Extract:**
- Replace `listDefaultCellValue` snippet usage with TableCell component
- Update TableCell component to support IANA timezone display if needed
- Remove the snippet definition (lines 1483-1538)
- Update all 5 usages of `listDefaultCellValue` (lines 1477, 2470, 2491, 2511)

**Props for TableCell (existing):**
```typescript
{
  row: Record<string, unknown>;
  column: MetaColumn;
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
  datetimeIanaRenderTick: number;
  cellSnippet?: any;
}
```

**Steps:**
1. Read `EntityListTable.svelte` lines 1483-1538 (listDefaultCellValue snippet)
2. Read existing `table/TableCell.svelte` to understand current implementation
3. Update TableCell.svelte to support IANA timezone badge rendering if missing
4. Find all usages of `listDefaultCellValue` (currently at lines 1477, 2470, 2491, 2511)
5. Replace `{@render listDefaultCellValue(r, col)}` with `<TableCell row={r} column={col} datetimeIanaModeByKey={datetimeIanaModeByKey} datetimeIanaRenderTick={datetimeIanaRenderTick} cellSnippet={cell} />`
6. Remove the `listDefaultCellValue` snippet definition (lines 1483-1538)
7. Test cell value rendering works correctly in both table and card views

---

## Existing Components Analysis

**Already Extracted (Not Currently Used):**
- `table/TableCell.svelte` - Cell value rendering component (exists but not fully utilized)
- `table/TableHeader.svelte` - Table header component (exists and used)
- `cards/CardField.svelte` - Card field rendering component (exists but not used)
- `cards/CardGrid.svelte` - Card grid layout component (exists but not used)
- `cards/CardList.svelte` - Card list layout component (exists but not used)

**Currently in Main Component (Needs Extraction):**
- Table row rendering (lines 2417-2611) - needs new TableRow component
- Card row rendering (lines 1876-2173) - needs to use existing CardGrid/CardList
- Cell value rendering snippet (lines 1483-1538) - needs to use existing TableCell
- Card field snippet (lines 1439-1481) - needs to use existing CardField

---

## Testing Checklist

- [ ] Table row rendering works correctly
- [ ] Table row selection works correctly
- [ ] Table row click handlers work correctly
- [ ] Table row double-click works correctly
- [ ] Table row dropdown menu works correctly
- [ ] Sticky columns work correctly in table view
- [ ] Card row rendering works correctly (both grid and list modes)
- [ ] Card row selection works correctly
- [ ] Card row click handlers work correctly
- [ ] Card row dropdown menu works correctly
- [ ] Cell value rendering works correctly in table view
- [ ] Cell value rendering works correctly in card view
- [ ] Boolean cell rendering works correctly
- [ ] Badge cell rendering works correctly
- [ ] Datetime cell rendering works correctly
- [ ] IANA toggle works correctly in both table and card views
- [ ] Card field rendering works correctly with all column types
- [ ] No TypeScript errors: `pnpm run check`
- [ ] Dev server runs without errors: `pnpm run dev`
- [ ] Manual testing of affected features
- [ ] All existing functionality preserved

---

## Success Criteria

- [ ] All row components extracted or integrated
- [ ] Main component reduced by ~550 lines
- [ ] Existing CardGrid and CardList components are actually used
- [ ] Existing TableCell component is fully utilized
- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] All features manually tested
- [ ] Code follows existing patterns and conventions
- [ ] IANA timezone functionality preserved in all views
