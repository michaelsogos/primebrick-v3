# EntityListTable Size Reduction Plan

## Current State Analysis

**Component Size**: 4162 lines (down from 4383)

**Existing Composables**:
- ✅ useRowActions.svelte.ts - Row action logic exists but not fully integrated
- ✅ useBulkActions.svelte.ts - Bulk action logic exists but not fully integrated  
- ✅ useDialogs.svelte.ts - Dialog state management exists and partially integrated
- ✅ useExport.svelte.ts - Export logic exists but not fully integrated
- ✅ useSelection, useSorting, useFilters, etc. - State management composables exist

**Current Inline Code** (still in EntityListTable.svelte):
- Bulk action functions (handleBulkDelete, confirmBulkDelete, handleBulkRestore, confirmBulkRestore) - ~80 lines
- Row action functions (handleEditRow, handlePreviewRow, handleDeleteRow, handleRestoreRow, handleDuplicateRow, confirmDeleteRow, confirmRestoreRow, confirmDuplicate) - ~150 lines
- Export state variables and functions (isExporting, exportScope, htmlExportScope, handleHtmlExport) - ~200 lines
- Preview panel logic (previewRow, previewEditMode, previewPanelOpen, etc.) - ~300 lines
- Search and filter logic - ~400 lines
- Toolbar logic - ~200 lines
- View mode logic - ~150 lines
- Large template sections (toolbar, panels, dialogs) - ~2000 lines

**Previous Plans Status**:
- Step 1 (Import composables): ✅ Completed
- Step 2 (Bulk actions refactor): ⚠️ Partially completed - composables exist but inline functions remain
- Step 3 (Dialog state refactor): ✅ Completed - dialog state variables removed
- Step 4 (Row actions refactor): ❌ Not completed - inline functions remain

## Reduction Strategy

**Target**: Reduce from 4162 lines to ~2000 lines (52% reduction)

**Approach**: Multi-phase extraction focusing on:
1. Complete integration of existing composables (quick wins)
2. Extract remaining business logic to new composables
3. Extract sub-components for UI sections
4. Extract utility functions

## Phase 1: Complete Existing Composable Integration

**Expected Reduction**: ~430 lines (10%)

### 1.1 Complete Bulk Actions Integration
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Current State**:
- useBulkActions composable exists with full implementation
- Inline bulk action functions still exist (lines ~1081-1115)
- Template references use inline functions

**Actions**:
1. Replace inline `handleBulkDelete()` with `bulkActions.handleBulkDelete()`
2. Replace inline `confirmBulkDelete()` with `bulkActions.confirmBulkDelete()`
3. Replace inline `handleBulkRestore()` with `bulkActions.handleBulkRestore()`
4. Replace inline `confirmBulkRestore()` with `bulkActions.confirmBulkRestore()`
5. Update template references to use composable state
6. Remove inline bulk action functions (~80 lines)

**Lines to modify**: ~1081-1115, template references

### 1.2 Complete Row Actions Integration
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Current State**:
- useRowActions composable exists with full implementation
- Inline row action functions still exist (lines ~924-943, 1049-1057, 1065-1080, 1273-1320)
- Template references use inline functions

**Actions**:
1. Replace inline `handleEditRow()` with `rowActionsComposable.handleEditRow()`
2. Replace inline `handlePreviewRow()` with `rowActionsComposable.handlePreviewRow()`
3. Update inline `handleDeleteRow()` to set row context then call composable
4. Update inline `handleRestoreRow()` to set row context then call composable
5. Update inline `handleDuplicateRow()` to set row context then call composable
6. Replace inline `confirmDeleteRow()` with `rowActionsComposable.confirmDeleteRow(rowToDelete)`
7. Replace inline `confirmRestoreRow()` with `rowActionsComposable.confirmRestoreRow(rowToRestore)`
8. Replace inline `confirmDuplicate()` with `rowActionsComposable.confirmDuplicateRow(singleRowToDuplicate)`
9. Remove inline row action API logic (~150 lines)

**Lines to modify**: ~924-943, 1049-1057, 1065-1080, 1273-1320, template references

### 1.3 Complete Export Integration
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Current State**:
- useExport composable exists with full implementation
- Inline export state variables still exist (lines ~799-805)
- Inline export functions still exist (handleHtmlExport at line ~1304)
- Template references use inline state

**Actions**:
1. Remove inline export state variables (isExporting, exportScope, htmlExportScope)
2. Replace inline `handleHtmlExport()` with `exportComposable.handleHtmlExport()`
3. Update template references to use composable state (exportComposable.isExporting, etc.)
4. Remove inline export logic (~200 lines)

**Lines to modify**: ~799-805, ~1304, template references

**Acceptance Criteria**:
- All bulk actions use composable
- All row actions use composable
- All export logic uses composable
- No compilation errors
- All functionality works correctly
- Line count reduced by ~430 lines

---

## Phase 2: Extract Preview Panel Logic

**Expected Reduction**: ~300 lines (7%)

### 2.1 Create usePreviewPanel Composable
**File**: `src/lib/components/entity-list-table/composables/usePreviewPanel.svelte.ts`

**Extract from EntityListTable.svelte**:
- Preview panel state (previewRow, previewRowIndex, previewEditMode, previewPanelOpen, focusedRowIndex)
- Preview panel functions (closePreviewPanel, togglePreviewEditMode, handlePreviewFieldChange)
- Preview panel navigation logic

**Interface**:
```typescript
export interface PreviewPanelOptions<TRow extends Record<string, unknown>> {
  viewRows: () => TRow[];
  rowKey: (row: TRow) => string;
  onFieldChange?: (row: TRow, field: string, value: any) => void;
}

export interface PreviewPanelReturn<TRow extends Record<string, unknown>> {
  previewRow: TRow | null;
  previewRowIndex: number;
  previewEditMode: boolean;
  previewPanelOpen: boolean;
  focusedRowIndex: number;
  openPreview: (row: TRow) => void;
  closePreview: () => void;
  toggleEditMode: () => void;
  handleFieldChange: (field: string, value: any) => void;
  navigatePreview: (direction: 'next' | 'prev') => void;
}
```

### 2.2 Integrate usePreviewPanel
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Actions**:
1. Import and initialize usePreviewPanel composable
2. Replace inline preview state with composable state
3. Replace inline preview functions with composable functions
4. Update template references
5. Remove inline preview logic (~300 lines)

**Lines to modify**: State variables section, preview functions section, template

**Acceptance Criteria**:
- Preview panel logic extracted to composable
- All preview functionality works correctly
- Line count reduced by ~300 lines

---

## Phase 3: Extract Search and Filter Logic

**Expected Reduction**: ~400 lines (10%)

### 3.1 Create useSearchFilter Composable
**File**: `src/lib/components/entity-list-table/composables/useSearchFilter.svelte.ts`

**Extract from EntityListTable.svelte**:
- Search input handling logic
- Search-in-columns logic
- Filter value handling
- Advanced filter handling
- Filter reset logic

**Interface**:
```typescript
export interface SearchFilterOptions {
  search: string;
  onSearchInput: (value: string) => void;
  searchInKeys: string[] | null;
  onSearchInKeysChange: (keys: string[] | null) => void;
  filterValues: Record<string, any>;
  onFilterValuesChange: (values: Record<string, any>) => void;
  onResetFilters: () => void;
  advancedFilters: AdvancedFilter[];
  onAdvancedFiltersChange: (filters: AdvancedFilter[]) => void;
  columns: MetaColumn[];
}

export interface SearchFilterReturn {
  handleSearchInput: (value: string) => void;
  handleSearchInKeyToggle: (key: string) => void;
  handleFilterValueChange: (field: string, value: any) => void;
  handleAdvancedFilterAdd: () => void;
  handleAdvancedFilterRemove: (index: number) => void;
  handleAdvancedFilterChange: (index: number, filter: AdvancedFilter) => void;
  hasActiveFilters: boolean;
  resetAllFilters: () => void;
}
```

### 3.2 Integrate useSearchFilter
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Actions**:
1. Import and initialize useSearchFilter composable
2. Replace inline search/filter handlers with composable functions
3. Update template references
4. Remove inline search/filter logic (~400 lines)

**Lines to modify**: Search/filter handler functions, template

**Acceptance Criteria**:
- Search and filter logic extracted to composable
- All search/filter functionality works correctly
- Line count reduced by ~400 lines

---

## Phase 4: Extract Toolbar Component

**Expected Reduction**: ~200 lines (5%)

### 4.1 Create Toolbar Component
**File**: `src/lib/components/entity-list-table/toolbar/EntityListToolbar.svelte`

**Extract from EntityListTable.svelte**:
- Toolbar template section (~200 lines)
- Toolbar-related handlers
- Toolbar state management

**Props**:
```typescript
interface ToolbarProps {
  search: string;
  onSearchInput: (value: string) => void;
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  // ... other toolbar props
}
```

### 4.2 Integrate Toolbar Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Actions**:
1. Create EntityListToolbar.svelte component
2. Move toolbar template to new component
3. Replace toolbar section in EntityListTable with component
4. Pass required props
5. Remove inline toolbar template (~200 lines)

**Lines to modify**: Toolbar template section

**Acceptance Criteria**:
- Toolbar extracted to separate component
- All toolbar functionality works correctly
- Line count reduced by ~200 lines

---

## Phase 5: Extract Panel Components

**Expected Reduction**: ~300 lines (7%)

### 5.1 Create FiltersPanel Component
**File**: `src/lib/components/entity-list-table/panels/FiltersPanel.svelte`

**Extract from EntityListTable.svelte**:
- Filters panel template section
- Filter-related UI logic

### 5.2 Create ColumnSelectorPanel Component
**File**: `src/lib/components/entity-list-table/panels/ColumnSelectorPanel.svelte`

**Extract from EntityListTable.svelte**:
- Column selector panel template section
- Column selection logic

### 5.3 Create SearchInPanel Component
**File**: `src/lib/components/entity-list-table/panels/SearchInPanel.svelte`

**Extract from EntityListTable.svelte**:
- Search-in panel template section
- Search-in selection logic

### 5.4 Integrate Panel Components
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Actions**:
1. Create panel components
2. Move panel templates to new components
3. Replace panel sections in EntityListTable with components
4. Pass required props
5. Remove inline panel templates (~300 lines)

**Lines to modify**: Panel template sections

**Acceptance Criteria**:
- Panels extracted to separate components
- All panel functionality works correctly
- Line count reduced by ~300 lines

---

## Phase 6: Extract Dialog Components

**Expected Reduction**: ~200 lines (5%)

### 6.1 Create Dialog Components
**Files**:
- `src/lib/components/entity-list-table/dialogs/BulkDeleteDialog.svelte`
- `src/lib/components/entity-list-table/dialogs/BulkRestoreDialog.svelte`
- `src/lib/components/entity-list-table/dialogs/DeleteDialog.svelte`
- `src/lib/components/entity-list-table/dialogs/RestoreDialog.svelte`
- `src/lib/components/entity-list-table/dialogs/DuplicateDialog.svelte`
- `src/lib/components/entity-list-table/dialogs/ExportDialog.svelte`

**Extract from EntityListTable.svelte**:
- Dialog template sections
- Dialog-specific UI logic

### 6.2 Integrate Dialog Components
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Actions**:
1. Create dialog components
2. Move dialog templates to new components
3. Replace dialog sections in EntityListTable with components
4. Pass required props
5. Remove inline dialog templates (~200 lines)

**Lines to modify**: Dialog template sections

**Acceptance Criteria**:
- Dialogs extracted to separate components
- All dialog functionality works correctly
- Line count reduced by ~200 lines

---

## Phase 7: Extract Utility Functions

**Expected Reduction**: ~100 lines (2%)

### 7.1 Create Utility File
**File**: `src/lib/components/entity-list-table/utils.ts`

**Extract from EntityListTable.svelte**:
- Helper functions (rowKey, isRowDeleted, formatCellValue, etc.)
- Type utilities
- Constants

### 7.2 Integrate Utilities
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Actions**:
1. Create utils.ts file
2. Move utility functions
3. Import utilities in EntityListTable
4. Remove inline utility functions (~100 lines)

**Lines to modify**: Utility function sections

**Acceptance Criteria**:
- Utilities extracted to separate file
- All functionality works correctly
- Line count reduced by ~100 lines

---

## Phase 8: Final Cleanup and Optimization

**Expected Reduction**: ~200 lines (5%)

### 8.1 Remove Dead Code
**Actions**:
1. Identify and remove unused imports
2. Remove unused variables
3. Remove commented-out code
4. Remove redundant code

### 8.2 Optimize Template
**Actions**:
1. Extract repeated template patterns
2. Simplify conditional logic
3. Reduce template nesting where possible

### 8.3 Consolidate State
**Actions**:
1. Review state variables for consolidation opportunities
2. Merge related state where appropriate
3. Remove redundant derived state

**Acceptance Criteria**:
- No dead code remains
- Template is optimized
- State is consolidated
- Line count reduced by ~200 lines

---

## Summary

**Total Expected Reduction**: ~1630 lines (39%)
- Phase 1: ~430 lines (10%)
- Phase 2: ~300 lines (7%)
- Phase 3: ~400 lines (10%)
- Phase 4: ~200 lines (5%)
- Phase 5: ~300 lines (7%)
- Phase 6: ~200 lines (5%)
- Phase 7: ~100 lines (2%)
- Phase 8: ~200 lines (5%)

**Target Final Size**: ~2532 lines (from 4162 lines)

**Implementation Order**:
1. Phase 1 (Complete existing composable integration) - Quick wins, low risk
2. Phase 2 (Extract preview panel logic) - Medium complexity, medium risk
3. Phase 3 (Extract search/filter logic) - Medium complexity, medium risk
4. Phase 4 (Extract toolbar component) - Low complexity, low risk
5. Phase 5 (Extract panel components) - Low complexity, low risk
6. Phase 6 (Extract dialog components) - Low complexity, low risk
7. Phase 7 (Extract utility functions) - Low complexity, low risk
8. Phase 8 (Final cleanup) - Low complexity, low risk

**Risk Assessment**:
- **Overall Risk**: Medium
- **Highest Risk Phase**: Phase 3 (Search/filter logic extraction)
- **Mitigation**: Comprehensive testing after each phase, incremental implementation

**Testing Strategy**:
1. Run `pnpm run check` after each phase
2. Run `pnpm run build` after each phase
3. Manual testing of affected functionality after each phase
4. Integration testing after all phases complete

**Rollback Strategy**:
- Each phase is independently revertable
- Git commits after each completed phase
- Clear documentation of changes per phase
