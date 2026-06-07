# EntityListTable Refactoring - Phase 15: Type Organization

## Overview

This phase focuses on organizing types by moving the large props interface and related types to a separate file. This is a cleanup task to improve code organization and maintainability.

**Target Lines**: ~165 lines (lines 126-290)  
**Risk Level**: Very Low  
**Estimated Time**: 1 hour  
**Expected Reduction**: ~165 lines

---

## Tasks

### 15.1 Create Types File

**Status**: ❌ NOT STARTED  
**Target**: Lines 126-290  
**New File**: `src/lib/components/entity-list-table/EntityListTable.types.ts`

**Description**:
Create a dedicated types file for EntityListTable and move the large props interface and related types.

**Types to Extract**:
```typescript
// Main props interface
export type EntityListTableProps<TRow extends Record<string, unknown>> = {
  uid: string;
  entity?: string;
  columns: MetaColumn[];
  stickyColumns?: MetaColumn[];
  dataColumns?: MetaColumn[];
  auditingColumns?: MetaColumn[];
  viewVisibility?: ListMetaViewVisibility;
  columnOrderStorageKey?: string;
  filterValuesStorageKey?: string;
  advancedFiltersStorageKey?: string;
  defaultSort?: { key: string; dir: SortDir };
  pageSizeOptions?: number[];
  searchPlaceholderKey?: string;
  selectionLabelKey?: string;
  selectionLabelSingularKey?: string;
  selectionLabelText?: string;
  selectionLabelSingularText?: string;
  rows: TRow[];
  total: number;
  metaLoading: boolean;
  rowsLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  search: string;
  onSearchInput: (value: string) => void;
  searchInKeys: string[] | null;
  onSearchInKeysChange: (keys: string[] | null) => void;
  sortKey: string | null;
  sortDir: SortDir;
  onSortChange: (key: string | null, dir: SortDir) => void;
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
  onResetColumnVisibility: (view: 'table' | 'card') => void;
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  rowSelectionEnabled?: boolean;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  rowActionsEnabled?: boolean;
  rowActions?: Snippet<[{ row: TRow }]>;
  entityRowActions?: {
    edit?: boolean;
    duplicate?: boolean;
    preview?: boolean;
    delete?: boolean;
  };
  onCreateAction?: () => void;
  onEditAction?: (row: TRow) => void;
  filtersOpen?: boolean;
  filterValues?: Record<string, unknown>;
  onFilterValuesChange?: (values: Record<string, unknown>) => void;
  onResetFilters?: () => void;
  advancedFilters?: AdvancedFilter[];
  onAdvancedFiltersChange?: (filters: AdvancedFilter[], logic: 'AND' | 'OR') => void;
  deletionFilterMode?: 'all' | 'non_deleted' | 'deleted_only';
  onDeletionFilterModeChange?: (mode: 'all' | 'non_deleted' | 'deleted_only') => void;
  datetimeIanaModeByKey?: Record<string, 'browser' | 'record'>;
  datetimeIanaRenderTick?: number;
  cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
  metaLoadingView?: Snippet;
  rowsLoadingView?: Snippet;
  emptyView?: Snippet;
  errorView?: Snippet;
  loadingMessage?: string;
  noRecordsMessage?: string;
};

// Related types
export type CellArgs<TRow extends Record<string, unknown>> = {
  row: TRow;
  column: MetaColumn;
};

export type ColumnOrderState = {
  sticky: string[];
  data: string[];
  auditing: string[];
};
```

**Implementation Steps**:
1. Create `EntityListTable.types.ts` in component directory
2. Extract main props interface
3. Extract related types
4. Export all types
5. Add proper JSDoc comments

---

### 15.2 Update Main Component

**Status**: ❌ NOT STARTED  
**Target**: Main component  
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Description**:
Update the main component to import types from the new types file.

**Changes to Make**:
1. Import types from new file
2. Remove type definitions from main component
3. Update component to use imported types
4. Verify type safety

**Implementation Steps**:
1. Add import for types file
2. Remove type definitions from main component
3. Update component props to use imported type
4. Update any other type references
5. Run typecheck to verify

---

### 15.3 Update Other Files

**Status**: ❌ NOT STARTED  
**Target**: Related component files  
**Description**:
Update other component files that might reference these types to import from the new types file.

**Files to Check**:
- Extracted components (CardViewRenderer, PreviewPanelWrapper, etc.)
- Composables that might reference these types
- Any other files that import EntityListTable types

**Implementation Steps**:
1. Search for type references in related files
2. Update imports to use new types file
3. Verify type safety
4. Run typecheck to verify

---

## Implementation Guidelines

### Code Style
- Follow existing type patterns in the codebase
- Maintain consistent naming conventions
- Use TypeScript for all type definitions
- Add proper JSDoc comments for complex types
- Use clear, descriptive type names

### Type Organization
- Group related types together
- Use clear type names
- Export all types that might be needed externally
- Keep internal types separate if possible

### Type Safety
- Ensure all types are properly typed
- Use generics where appropriate
- Maintain type safety across components
- Run typecheck after changes

### Testing
- Verify existing functionality is preserved
- Check for any broken type references
- Run typecheck: `pnpm run check`
- Test all components that use these types

### Git Workflow
- **NEVER commit automatically** - wait for explicit user instruction
- Follow GitFlow rules in `docs/gitflow.md`
- Create feature branches for refactoring work
- Get approval before merging

---

## Expected Results

### File Size Reduction
- **Before**: 1454 lines (after Phase 14)
- **After**: ~1289 lines
- **Reduction**: ~165 lines (11% from current)

### Code Quality Improvements
- Cleaner component script section
- Better type organization
- Improved maintainability
- Reusable type definitions
- Clearer type structure

### Cumulative Results
- **Original size**: ~3500 lines
- **After Phase 15**: ~1289 lines
- **Total reduction**: ~2211 lines (63% from original)
- **Phase 3 target achieved**: 50-55% reduction from current (2504 lines)

---

## Notes

- This is a cleanup task with no functional changes
- Existing functionality will be preserved
- No breaking changes to component API
- Follow existing AGENTS.md rules
- Update this document as implementation progresses
- Ensure all type references are updated
- This completes the Phase 3 refactoring plan
