# EntityListTable Size Reduction Plan

## Objectives
Reduce the size of `EntityListTable.svelte` (currently 2827 lines) by extracting reusable components, utilities, and composables while maintaining functionality and following Svelte 5 best practices.

## Current State Analysis

### Component Size
- **Current**: 2827 lines
- **Target**: ~1500 lines (47% reduction)

### Already Extracted (Good Foundation)
- ✅ Panels: FiltersPanel, VersionHistoryPanel, SearchInPanel, ColumnSelectorPanel, PreviewPanel
- ✅ Toolbar: EntityListToolbar, FilterBar, SelectionCounter, SearchBar, ViewModeToggle, BulkActions, DeletionFilterToggle
- ✅ Table: TableHeader, TableCell
- ✅ Cards: CardField, CardGrid, CardList
- ✅ Dialogs: DeleteDialog, RestoreDialog, BulkDeleteDialog, BulkRestoreDialog, ExportDialog, HtmlExportDialog, DuplicateDialog, ExportPreviewDialog
- ✅ Pagination: Pagination
- ✅ Composables: useStickyColumns, useScrollPreservation, useRowRangeSelection, useFilterPersistence, useToolbarMode, useExport, useBulkActions, useRowActions, useDialogs, usePreviewPanel, and many more

### ⚠️ CRITICAL FINDING: Existing Composables NOT Being Used
The following composables **already exist** but are **NOT imported/used** in EntityListTable.svelte:
- ❌ `useViewMode.svelte.ts` - exists but not used (lines 280-299 duplicate this logic)
- ❌ `useColumnOrder.svelte.ts` - exists but not used (lines 272-436 duplicate this logic)
- ❌ `useKeyboardNavigation.svelte.ts` - exists but not used (lines 800-855 duplicate this logic)

**This is a major opportunity**: Replace duplicate inline logic with existing composables instead of creating new ones.

### Remaining Large Sections
1. **Keyboard Navigation Logic** (~55 lines, lines 800-855) - **EXISTING COMPOSABLE NOT USED**
2. **Row Action Handlers** (~40 lines, lines 858-898)
3. **View Mode Management** (~20 lines, lines 280-299) - **EXISTING COMPOSABLE NOT USED**
4. **Column Ordering Logic** (~165 lines, lines 272-436) - **EXISTING COMPOSABLE NOT USED**
5. **Complex Template Sections** (~800+ lines of table rendering)
6. **Inline Cell Rendering Logic** (scattered throughout template)
7. **Sticky Cell Styling** (~17 lines, lines 1251-1267)
8. **Footer/Pagination Logic** (~100 lines, lines 2600-2700)

## Proposed Extractions

### Phase 1: Replace Keyboard Navigation with Existing Composable
**Target**: Use existing `useKeyboardNavigation.svelte.ts` composable

**Current Location**: Lines 800-855 in EntityListTable.svelte (duplicate logic)

**Existing Composable**: `composables/useKeyboardNavigation.svelte.ts` (already exists, 123 lines)

**Action Required**:
- Import and use the existing `useKeyboardNavigation` composable
- Remove duplicate keyboard navigation logic from EntityListTable.svelte
- Adapt the existing composable interface if needed to match current usage

**Expected Reduction**: ~55 lines (removing duplicate logic)

### Phase 2: Extract Row Action Handlers
**Target**: Enhance existing `useRowActions.svelte.ts` composable

**Current Location**: Lines 858-898 in EntityListTable.svelte

**Functionality to Extract**:
- `handleDeleteRow` - Open delete confirmation dialog
- `handleRestoreRow` - Open restore confirmation dialog
- `confirmDeleteRow` - Execute delete after confirmation
- `confirmRestoreRow` - Execute restore after confirmation

**Integration**: Move these into the existing `useRowActions` composable

**Expected Reduction**: ~40 lines

### Phase 3: Replace View Mode Management with Existing Composable
**Target**: Use existing `useViewMode.svelte.ts` composable

**Current Location**: Lines 280-299 in EntityListTable.svelte (duplicate logic)

**Existing Composable**: `composables/useViewMode.svelte.ts` (already exists, 37 lines)

**Action Required**:
- Import and use the existing `useViewMode` composable
- Remove duplicate view mode logic from EntityListTable.svelte
- The existing composable has a simpler interface - may need to extend it for session storage persistence

**Expected Reduction**: ~20 lines (removing duplicate logic)

### Phase 4: Replace Column Ordering Logic with Existing Composable
**Target**: Use existing `useColumnOrder.svelte.ts` composable

**Current Location**: Lines 272-436 in EntityListTable.svelte (duplicate logic)

**Existing Composable**: `composables/useColumnOrder.svelte.ts` (already exists, 117 lines)

**Action Required**:
- Import and use the existing `useColumnOrder` composable
- Remove duplicate column ordering logic from EntityListTable.svelte
- The existing composable already has all the needed functions (readOrderState, writeOrderState, applyKeyOrder, moveKeyWithin, reorderGroup)

**Expected Reduction**: ~165 lines (removing duplicate logic)

### Phase 5: Extract Table Rendering Components
**Target**: Create specialized table sub-components

#### 5a: Extract `EntityTableHeader.svelte`
**Current Location**: Lines ~2200-2277 (header rendering)

**Functionality**:
- Render table header with sort indicators
- Handle datetime IANA toggle buttons
- Sticky column styling
- Action column header

**Props**:
```typescript
let {
  columns,
  sortKey,
  sortDir,
  onSortChange,
  datetimeIanaModeByKey,
  toggleDatetimeIana,
  rowsLoading,
  actionsEnabled,
  previewPanel
}: TableHeaderProps = $props();
```

**Expected Reduction**: ~80 lines

#### 5b: Extract `EntityTableRow.svelte`
**Current Location**: Lines ~2300-2500 (row rendering)

**Functionality**:
- Render single table row
- Handle cell rendering
- Row selection checkbox
- Row styling (deleted, selected, etc.)
- Action dropdown trigger

**Props**:
```typescript
let {
  row,
  columns,
  visibleKeys,
  rowKey,
  selectedKeys,
  rowSelectionEnabled,
  isRowDeleted,
  cell,
  datetimeIanaModeByKey,
  datetimeIanaRenderTick,
  actionsEnabled,
  rowActions,
  openRowDropdown
}: TableRowProps = $props();
```

**Expected Reduction**: ~150 lines

#### 5c: Extract `EntityTableBody.svelte`
**Current Location**: Lines ~2279-2600 (body rendering)

**Functionality**:
- Render table body with loading/error/empty states
- Row iteration
- Keyboard event handling

**Props**:
```typescript
let {
  viewRows,
  columns,
  visibleKeys,
  rowKey,
  selectedKeys,
  rowSelectionEnabled,
  isRowDeleted,
  cell,
  datetimeIanaModeByKey,
  datetimeIanaRenderTick,
  actionsEnabled,
  rowActions,
  error,
  rowsLoading,
  emptyView,
  errorView,
  rowsLoadingView,
  openRowDropdown,
  handleKeydown
}: TableBodyProps = $props();
```

**Expected Reduction**: ~200 lines

### Phase 6: Extract Cell Rendering Logic
**Target**: Create `EntityCellRenderer.svelte` component

**Current Location**: Scattered cell rendering logic throughout template

**Functionality**:
- Render individual cell content
- Handle different cell types (text, datetime, badge, etc.)
- Apply cell styling
- Handle search syntax highlighting
- Handle datetime IANA formatting

**Props**:
```typescript
let {
  row,
  column,
  cell,
  datetimeIanaModeByKey,
  datetimeIanaRenderTick,
  search,
  searchInKeys
}: CellRendererProps = $props();
```

**Expected Reduction**: ~100 lines

### Phase 7: Extract Footer/Pagination Component
**Target**: Create `EntityTableFooter.svelte` component

**Current Location**: Lines ~2600-2700

**Functionality**:
- Render pagination controls
- Display row range information
- Page size selector
- Selection counter display

**Props**:
```typescript
let {
  footerRangeStart,
  footerRangeEnd,
  footerRangeTotal,
  footerPage,
  footerTotalPages,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  onPageChange,
  rowSelectionEnabled,
  selectionCount,
  selectionLabelKey,
  selectionLabelSingularKey,
  selectionLabelText,
  selectionLabelSingularText,
  selectionPastParticipleKey,
  showSelectedOnly,
  onShowSelectedOnlyChange,
  footerUsesClientPaging,
  clientSelectedPage
}: TableFooterProps = $props();
```

**Expected Reduction**: ~100 lines

### Phase 8: Extract Sticky Cell Styling
**Target**: Move to existing `utils/cell-styling.ts`

**Current Location**: Lines 1251-1267

**Functionality**:
- `stickyCellClass` function

**Integration**: Add to existing cell-styling utilities

**Expected Reduction**: ~17 lines

### Phase 9: Extract Loading/Error/Empty State Components
**Target**: Create `EntityListState.svelte` component

**Current Location**: Lines ~1636-1700 (repeated in multiple places)

**Functionality**:
- Consolidate loading, error, and empty state rendering
- Reusable across table and card views

**Props**:
```typescript
let {
  type,
  message,
  customView
}: StateProps = $props();
```

**Expected Reduction**: ~50 lines

## Implementation Order

### Priority 1 (High Impact, Low Risk - Use Existing Composables)
1. **Phase 1**: Replace keyboard navigation with existing `useKeyboardNavigation` composable
2. **Phase 3**: Replace view mode management with existing `useViewMode` composable
3. **Phase 4**: Replace column ordering logic with existing `useColumnOrder` composable
4. **Phase 8**: Extract sticky cell styling to utils (trivial utility move)
5. **Phase 2**: Extract row action handlers to existing `useRowActions` composable

### Priority 2 (Medium Impact, Medium Risk)
6. **Phase 9**: Extract state rendering component

### Priority 3 (High Impact, Higher Risk)
7. **Phase 5a**: Extract table header component
8. **Phase 5b**: Extract table row component
9. **Phase 5c**: Extract table body component
10. **Phase 6**: Extract cell renderer component
11. **Phase 7**: Extract footer component

## Impacted Files

### New Files to Create
- `table/EntityTableHeader.svelte`
- `table/EntityTableRow.svelte`
- `table/EntityTableBody.svelte`
- `table/EntityCellRenderer.svelte`
- `table/EntityTableFooter.svelte`
- `table/EntityListState.svelte`

### Files to Modify
- `EntityListTable.svelte` (main reduction target - replace duplicate logic with existing composables)
- `composables/useRowActions.svelte.ts` (enhance with row action handlers)
- `composables/useViewMode.svelte.ts` (may need to extend for session storage)
- `composables/useColumnOrder.svelte.ts` (already complete, just need to use it)
- `composables/useKeyboardNavigation.svelte.ts` (already complete, just need to use it)
- `utils/cell-styling.ts` (add sticky cell styling)
- `table/index.ts` (export new components)

### Files to Modify
- `EntityListTable.svelte` (main reduction target)
- `composables/useRowActions.svelte.ts` (enhance)
- `composables/useViewMode.svelte.ts` (verify/enhance)
- `composables/useColumnOrder.svelte.ts` (verify/enhance)
- `utils/cell-styling.ts` (add sticky cell styling)
- `table/index.ts` (export new components)

## Architectural Changes

### Component Hierarchy
```
EntityListTable (main orchestrator)
├── EntityListToolbar (existing)
├── EntityTableBody (new)
│   ├── EntityTableRow (new)
│   │   └── EntityCellRenderer (new)
│   └── EntityListState (new)
├── EntityTableHeader (new)
├── EntityTableFooter (new)
└── PreviewPanel (existing)
```

### Composable Usage
EntityListTable will use these composables:
- `useKeyboardNavigation` (new)
- `useRowActions` (enhanced)
- `useViewMode` (verified)
- `useColumnOrder` (verified)
- `useBulkActions` (existing)
- `useDialogs` (existing)
- `usePreviewPanel` (existing)
- `useFilterPersistence` (existing)
- `useStickyColumns` (existing)
- `useScrollPreservation` (existing)
- `useRowRangeSelection` (existing)

## Acceptance Criteria

### Functional Requirements
- ✅ All existing functionality must be preserved
- ✅ No breaking changes to public API
- ✅ All props and events must remain compatible
- ✅ Keyboard navigation must work identically
- ✅ Row actions must work identically
- ✅ View mode switching must work identically
- ✅ Column ordering must work identically
- ✅ Cell rendering must work identically
- ✅ Pagination must work identically

### Code Quality Requirements
- ✅ Follow Svelte 5 runes syntax ($state, $derived, $props)
- ✅ Maintain TypeScript type safety
- ✅ Use existing patterns and conventions
- ✅ Add proper JSDoc comments
- ✅ Follow existing file naming conventions

### Performance Requirements
- ✅ No performance degradation
- ✅ Maintain reactivity efficiency
- ✅ Avoid unnecessary re-renders

### Testing Requirements
- ✅ Manual testing of all features
- ✅ Verify keyboard navigation
- ✅ Verify row actions (delete, restore, edit, duplicate)
- ✅ Verify view mode switching
- ✅ Verify column ordering
- ✅ Verify pagination
- ✅ Verify cell rendering with different data types
- ✅ Verify sticky columns
- ✅ Verify selection functionality

## Code Examples

### Example: useKeyboardNavigation Composable
```typescript
// composables/useKeyboardNavigation.svelte.ts
import type { Snippet } from 'svelte';

interface KeyboardNavigationArgs<T> {
  viewRows: T[];
  rowKey: (row: T) => string;
  previewPanel: {
    focusedRowIndex: number | null;
    previewPanelOpen: boolean;
    previewRow: T | null;
    openPreview: (row: T) => void;
    closePreview: () => void;
  };
  toggleRowSelect: (key: string) => void;
  openRowDropdown: (row: T) => void;
  closeRowDropdown: () => void;
  onPageChange: (page: number) => void;
  clientSelectedPage: number;
  footerUsesClientPaging: boolean;
  footerPage: number;
  footerTotalPages: number;
}

export function useKeyboardNavigation<T>(args: KeyboardNavigationArgs<T>) {
  const {
    viewRows,
    rowKey,
    previewPanel,
    toggleRowSelect,
    openRowDropdown,
    closeRowDropdown,
    onPageChange,
    clientSelectedPage,
    footerUsesClientPaging,
    footerPage,
    footerTotalPages
  } = args;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (previewPanel.focusedRowIndex === null) {
        previewPanel.focusedRowIndex = 0;
      } else if (previewPanel.focusedRowIndex < viewRows.length - 1) {
        previewPanel.focusedRowIndex++;
      } else if (previewPanel.focusedRowIndex === viewRows.length - 1 && footerPage < footerTotalPages) {
        if (footerUsesClientPaging) {
          clientSelectedPage++;
        } else {
          onPageChange(page + 1);
        }
      }
      if (previewPanel.previewPanelOpen && previewPanel.focusedRowIndex !== null) {
        previewPanel.openPreview(viewRows[previewPanel.focusedRowIndex]);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (previewPanel.focusedRowIndex === null) {
        previewPanel.focusedRowIndex = 0;
      } else if (previewPanel.focusedRowIndex > 0) {
        previewPanel.focusedRowIndex--;
      } else if (previewPanel.focusedRowIndex === 0 && footerPage > 1) {
        if (footerUsesClientPaging) {
          clientSelectedPage--;
        } else {
          onPageChange(page - 1);
        }
      }
      if (previewPanel.previewPanelOpen && previewPanel.focusedRowIndex !== null) {
        previewPanel.openPreview(viewRows[previewPanel.focusedRowIndex]);
      }
    } else if (e.key === ' ' && previewPanel.focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[previewPanel.focusedRowIndex];
      if (row) toggleRowSelect(rowKey(row));
    } else if (e.key === 'Enter' && previewPanel.focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[previewPanel.focusedRowIndex];
      if (row) openRowDropdown(row);
    } else if (e.key === 'Escape') {
      closeRowDropdown();
      setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
    }
  }

  return { handleKeydown };
}
```

### Example: EntityTableRow Component
```svelte
<!-- table/EntityTableRow.svelte -->
<script lang="ts" generics="TRow extends Record<string, unknown>>
  import type { Snippet } from 'svelte';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { MoreVertical } from 'lucide-svelte';
  import { cn } from '$lib/utils.js';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { EntityCellRenderer } from './EntityCellRenderer.svelte';
  import {
    entityListGrayChromeCellClass,
    entityListDestructiveChromeCellClass,
    entityListGrayBandStickyInteractionClass,
    entityListDestructiveBandStickyInteractionClass
  } from '../utils/cell-styling';

  let {
    row,
    columns,
    visibleKeys,
    rowKey,
    selectedKeys,
    rowSelectionEnabled,
    isRowDeleted,
    cell,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    actionsEnabled,
    rowActions,
    openRowDropdown
  }: {
    row: TRow;
    columns: MetaColumn[];
    visibleKeys: string[];
    rowKey: (row: TRow) => string;
    selectedKeys: string[];
    rowSelectionEnabled: boolean;
    isRowDeleted: (row: TRow) => boolean;
    cell?: Snippet<[ { row: TRow; column: MetaColumn } ]>;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    actionsEnabled: boolean;
    rowActions?: Snippet<[ { row: TRow } ]>;
    openRowDropdown: (row: TRow) => void;
  } = $props();

  const key = $derived(rowKey(row));
  const selected = $derived(selectedKeys.includes(key));
  const deleted = $derived(isRowDeleted(row));
  
  const rowChromeClass = $derived(
    deleted
      ? entityListDestructiveChromeCellClass
      : entityListGrayChromeCellClass
  );
  
  const rowInteractionClass = $derived(
    deleted
      ? entityListDestructiveBandStickyInteractionClass
      : entityListGrayBandStickyInteractionClass
  );
</script>

<tr
  class={cn(
    'group/row transition-colors',
    rowChromeClass,
    selected && 'bg-accent/50',
    rowInteractionClass
  )}
>
  {#if rowSelectionEnabled}
    <td class="w-10 p-2">
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => {
          // Handle selection
        }}
      />
    </td>
  {/if}
  
  {#each columns as col}
    {#if visibleKeys.includes(col.key)}
      <td>
        <EntityCellRenderer
          {row}
          column={col}
          {cell}
          datetimeIanaModeByKey={datetimeIanaModeByKey}
          datetimeIanaRenderTick={datetimeIanaRenderTick}
        />
      </td>
    {/if}
  {/each}
  
  {#if actionsEnabled}
    <td class="w-10 p-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <button
            onclick={() => openRowDropdown(row)}
            class="p-1 rounded hover:bg-accent"
          >
            <MoreVertical class="size-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {#if rowActions}
            {@render rowActions({ row })}
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </td>
  {/if}
</tr>
```

## Risk Assessment

### Low Risk
- Phase 8: Utility function move (no behavior change)
- Phase 2: Enhancing existing composable (well-contained)
- Phase 9: State component extraction (presentational only)

### Medium Risk
- Phase 1: Keyboard navigation extraction (complex logic, but well-contained)
- Phase 3-4: Verifying composables (may reveal missing functionality)

### High Risk
- Phase 5-7: Table component extraction (complex template refactoring)
- Phase 6: Cell renderer extraction (critical rendering logic)

### Mitigation Strategies
1. Implement phases in priority order
2. Test thoroughly after each phase
3. Keep git commits small and focused
4. Run typecheck after each change
5. Manual testing of affected features
6. Maintain backward compatibility

## Success Metrics

### Quantitative
- Reduce EntityListTable.svelte from 2827 to ~1500 lines (47% reduction)
- Maintain 100% feature parity
- Zero TypeScript errors
- Zero runtime errors

### Qualitative
- Improved code maintainability
- Better separation of concerns
- Easier to test individual components
- Clearer component responsibilities

## Notes

### Existing Composables to Verify
The following composables already exist and should be verified for completeness:
- `useViewMode.svelte.ts` - verify if all view mode logic is extracted
- `useColumnOrder.svelte.ts` - verify if all column ordering logic is extracted
- `useKeyboardNavigation.svelte.ts` - check if this already exists

### Dependencies
- Ensure all new components have proper imports
- Update index.ts files for exports
- Maintain proper TypeScript types

### Translation Keys
- All existing translation keys must remain unchanged
- No new i18n keys should be needed

## Timeline Estimate

- Phase 1: 1-2 hours
- Phase 2: 1 hour
- Phase 3-4: 1-2 hours (verification)
- Phase 5: 4-6 hours (complex template refactoring)
- Phase 6: 2-3 hours
- Phase 7: 2 hours
- Phase 8-9: 1-2 hours
- Testing: 2-3 hours

**Total**: 14-21 hours

## Next Steps

1. Verify existing composables (useViewMode, useColumnOrder, useKeyboardNavigation)
2. Start with Phase 8 (lowest risk)
3. Proceed through phases in priority order
4. Test thoroughly after each phase
5. Update documentation if needed
