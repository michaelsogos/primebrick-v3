# EntityListTable Phase 2: State-Managing Composables Implementation Plan

## Objectives

Implement a gradual migration path for integrating state-managing composables (useSelection, useSorting, useFilters, etc.) into EntityListTable while maintaining backward compatibility and following Svelte 5 best practices.

## Strategy

Use **Option F: Gradual Migration with Mixed Approach**:
- **Phase 2a**: Extract business logic to separate files (Option D)
- **Phase 2b**: Add $bindable for high-value props (Option E)
- **Phase 2c**: Gradual migration to composables over time

This approach:
- Maintains backward compatibility (no breaking changes)
- Aligns with Svelte 5 best practices ($bindable for two-way binding)
- Provides immediate value through business logic extraction
- Allows gradual migration without pressure
- Minimizes risk through incremental changes

## Impacted Files

### Primary Files
- `src/lib/components/entity-list-table/EntityListTable.svelte` (~4887 lines)
- `src/lib/components/entity-list-table/composables/` (new files to be created)

### Consumer Files (no changes required for backward compatibility)
- `src/routes/(app)/customers/+page.svelte`
- `src/routes/(app)/system/settings/users/+page.svelte`
- `src/routes/(app)/system/settings/organizations/+page.svelte`

## Phase 2a: Extract Business Logic (Option D)

### Goal
Extract dialog and bulk action logic to separate composables to reduce main component size without breaking changes.

### Actions

#### 2a.1: Create `useExport.ts` composable
**Location**: `src/lib/components/entity-list-table/composables/useExport.svelte.ts`

**Extract from EntityListTable.svelte** (~440 lines):
- Export dialog state (`exportOpen`, `exportScope`, `htmlExportScope`, `fileType`)
- Export logic (`handleExport`, `handleHtmlExport`)
- Export loading states (`isExporting`, `isHtmlExporting`)
- Export error handling

**Interface**:
```typescript
export interface ExportOptions {
  entity: string;
  selectedKeys: string[];
  total: number;
  onExportStart?: () => void;
  onExportComplete?: () => void;
  onExportError?: (error: Error) => void;
}

export interface ExportReturn {
  exportOpen: boolean;
  exportScope: 'all' | 'selected' | 'page';
  htmlExportScope: 'all' | 'selected' | 'page';
  fileType: 'xlsx' | 'csv' | 'html' | 'pdf';
  isExporting: boolean;
  isHtmlExporting: boolean;
  openExportDialog: () => void;
  closeExportDialog: () => void;
  handleExport: () => Promise<void>;
  handleHtmlExport: () => Promise<void>;
  setExportScope: (scope: 'all' | 'selected' | 'page') => void;
  setHtmlExportScope: (scope: 'all' | 'selected' | 'page') => void;
  setFileType: (type: 'xlsx' | 'csv' | 'html' | 'pdf') => void;
}
```

#### 2a.2: Create `useBulkActions.ts` composable
**Location**: `src/lib/components/entity-list-table/composables/useBulkActions.svelte.ts`

**Extract from EntityListTable.svelte** (~375 lines):
- Bulk delete logic (`handleBulkDelete`)
- Bulk restore logic (`handleBulkRestore`)
- Bulk duplicate logic (`handleBulkDuplicate`)
- Bulk action loading states (`isDeleting`, `isRestoring`, `isDuplicating`)
- Bulk action error handling

**Interface**:
```typescript
export interface BulkActionsOptions {
  entity: string;
  selectedKeys: string[];
  onBulkActionStart?: () => void;
  onBulkActionComplete?: () => void;
  onBulkActionError?: (error: Error) => void;
  onSelectionChange?: (keys: string[]) => void;
}

export interface BulkActionsReturn {
  isDeleting: boolean;
  isRestoring: boolean;
  isDuplicating: boolean;
  handleBulkDelete: () => Promise<void>;
  handleBulkRestore: () => Promise<void>;
  handleBulkDuplicate: () => Promise<void>;
}
```

#### 2a.3: Create `useRowActions.ts` composable
**Location**: `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts`

**Extract from EntityListTable.svelte** (~200 lines):
- Row edit logic (`handleEditRow`)
- Row delete logic (`handleDeleteRow`)
- Row restore logic (`handleRestoreRow`)
- Row duplicate logic (`handleDuplicateRow`)
- Row export logic (`handleExportRow`)
- Row preview logic (`handlePreviewRow`)

**Interface**:
```typescript
export interface RowActionsOptions {
  entity: string;
  onEditAction?: (row: TRow) => void;
  onRowActionComplete?: () => void;
  onRowActionError?: (error: Error) => void;
}

export interface RowActionsReturn {
  handleEditRow: (row: TRow) => void;
  handleDeleteRow: (row: TRow) => Promise<void>;
  handleRestoreRow: (row: TRow) => Promise<void>;
  handleDuplicateRow: (row: TRow) => Promise<void>;
  handleExportRow: (row: TRow) => Promise<void>;
  handlePreviewRow: (row: TRow) => void;
}
```

#### 2a.4: Create `useDialogs.ts` composable
**Location**: `src/lib/components/entity-list-table/composables/useDialogs.svelte.ts`

**Extract from EntityListTable.svelte** (~43 lines):
- Dialog state management
- Dialog open/close handlers

**Interface**:
```typescript
export interface DialogsReturn {
  deleteDialogOpen: boolean;
  restoreDialogOpen: boolean;
  duplicateDialogOpen: boolean;
  openDeleteDialog: () => void;
  closeDeleteDialog: () => void;
  openRestoreDialog: () => void;
  closeRestoreDialog: () => void;
  openDuplicateDialog: () => void;
  closeDuplicateDialog: () => void;
}
```

#### 2a.5: Update EntityListTable.svelte
**Actions**:
1. Import new composables
2. Replace inline logic with composable calls
3. Remove extracted code (~1058 lines total)
4. Test all dialog and bulk action functionality

**Expected reduction**: ~1058 lines (22% of main component)

### Acceptance Criteria
- All composables created and exported from `composables/index.ts`
- EntityListTable uses new composables
- All dialog functionality works (delete, restore, duplicate, export)
- All bulk actions work (bulk delete, bulk restore, bulk duplicate)
- All row actions work (edit, delete, restore, duplicate, export, preview)
- No breaking changes to consumers
- All tests pass
- TypeScript compilation succeeds

### Risk Assessment
- **Risk Level**: Low
- **Reason**: Extracting business logic without changing state management pattern
- **Mitigation**: Comprehensive testing of all extracted functionality

---

## Phase 2b: Add $bindable for High-Value Props (Option E)

### Goal
Add Svelte 5 $bindable rune for high-value props to enable two-way binding while maintaining backward compatibility.

### Actions

#### 2b.1: Update `useSelection.svelte.ts` to support bindable sync
**Location**: `src/lib/components/entity-list-table/composables/useSelection.svelte.ts`

**Changes**:
1. Add `initialKeys` parameter (for bindable sync)
2. Add `syncWithExternal` function to sync internal state with external changes
3. Maintain backward compatibility with existing interface

**Updated Interface**:
```typescript
export interface SelectionOptions {
  enabled: boolean;
  uid: string;
  initialKeys?: string[]; // NEW: for bindable sync
  onSelectedKeysChange?: (keys: string[]) => void;
}

export interface SelectionReturn {
  selectedKeys: string[];
  toggleRowSelect: (key: string) => void;
  toggleAllRows: (allKeys: string[]) => void;
  clearSelection: () => void;
  isRowSelected: (key: string) => boolean;
  allSelected: boolean;
  someSelected: boolean;
  syncWithExternal: (keys: string[]) => void; // NEW: sync with bindable prop
}
```

**Implementation**:
```typescript
export function useSelection(options: SelectionOptions): SelectionReturn {
  const { enabled, uid, initialKeys, onSelectedKeysChange } = options;

  let selectedKeys = $state<string[]>(initialKeys ?? []);

  // NEW: Sync with external bindable prop
  function syncWithExternal(keys: string[]) {
    if (JSON.stringify(selectedKeys) !== JSON.stringify(keys)) {
      selectedKeys = [...keys];
    }
  }

  // ... existing logic unchanged

  return {
    get selectedKeys() { return selectedKeys; },
    toggleRowSelect,
    toggleAllRows,
    clearSelection,
    isRowSelected,
    get allSelected() { return allSelected; },
    get someSelected() { return someSelected; },
    syncWithExternal // NEW
  };
}
```

#### 2b.2: Update `useSorting.svelte.ts` to support bindable sync
**Location**: `src/lib/components/entity-list-table/composables/useSorting.svelte.ts`

**Changes**:
1. Add `initialSort` parameter (already exists, ensure it works for bindable sync)
2. Add `syncWithExternal` function to sync internal state with external changes

**Updated Interface**:
```typescript
export interface SortingOptions {
  columns: MetaColumn[];
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' } | null) => void;
}

export interface SortingReturn {
  currentSort: { key: string; direction: 'asc' | 'desc' } | null;
  handleSort: (key: string) => void;
  getSortDirection: (key: string) => 'asc' | 'desc' | null;
  isSortable: (key: string) => boolean;
  syncWithExternal: (sort: { key: string; direction: 'asc' | 'desc' } | null) => void; // NEW
}
```

#### 2b.3: Update EntityListTable.svelte props to use $bindable
**Location**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Changes**:
1. Update `selectedKeys` prop to use `$bindable`
2. Update `sortKey` and `sortDir` props to use `$bindable`
3. Maintain backward compatibility with `onSelectedKeysChange` and `onSortChange` callbacks
4. Integrate `useSelection` and `useSorting` composables with bindable sync

**Updated Props**:
```typescript
let {
  // ... existing props
  selectedKeys = $bindable<string[]>([]), // CHANGED: now bindable
  onSelectedKeysChange, // KEPT: for backward compatibility
  // ... existing props
  sortKey, // CHANGED: will be derived from useSorting
  sortDir, // CHANGED: will be derived from useSorting
  onSortChange, // KEPT: for backward compatibility
  // ... existing props
}: { /* ... */ } = $props();
```

**Integration Logic**:
```typescript
// Integrate useSelection with bindable sync
const selection = useSelection({
  enabled: rowSelectionEnabled,
  uid,
  initialKeys: selectedKeys,
  onSelectedKeysChange: (keys) => {
    // Update bindable prop
    selectedKeys = keys;
    // Call legacy callback for backward compatibility
    onSelectedKeysChange?.(keys);
  }
});

// Sync external changes to composable
$effect(() => {
  selection.syncWithExternal(selectedKeys);
});

// Integrate useSorting with bindable sync
const sorting = useSorting({
  columns: allColumns,
  initialSort: sortKey && sortDir ? { key: sortKey, direction: sortDir } : undefined,
  onSortChange: (sort) => {
    // Update bindable props
    sortKey = sort?.key ?? null;
    sortDir = sort?.direction ?? null;
    // Call legacy callback for backward compatibility
    onSortChange?.(sort?.key ?? null, sort?.direction ?? null);
  }
});

// Sync external changes to composable
$effect(() => {
  const currentSort = sortKey && sortDir ? { key: sortKey, direction: sortDir } : null;
  sorting.syncWithExternal(currentSort);
});
```

#### 2b.4: Update consumers to use bind syntax (optional)
**Location**: Consumer files (optional migration)

**Changes**:
- Consumers can continue using old pattern (backward compatible)
- Consumers can optionally migrate to bind syntax (simpler)

**Old pattern (still works)**:
```typescript
let selectedKeys = $state<string[]>([]);
<EntityListTable
  selectedKeys={selectedKeys}
  onSelectedKeysChange={(keys) => selectedKeys = keys}
/>
```

**New pattern (optional)**:
```typescript
let selectedKeys = $state<string[]>([]);
<EntityListTable bind:selectedKeys />
```

### Acceptance Criteria
- `useSelection` and `useSorting` support bindable sync
- EntityListTable uses $bindable for selectedKeys, sortKey, sortDir
- Backward compatibility maintained (old pattern still works)
- New bind syntax works for consumers who choose to migrate
- All selection and sorting functionality works
- No breaking changes to consumers
- All tests pass
- TypeScript compilation succeeds

### Risk Assessment
- **Risk Level**: Medium
- **Reason**: Introducing $bindable changes prop behavior, but backward compatibility maintained
- **Mitigation**: Comprehensive testing of both old and new patterns, gradual consumer migration

---

## Phase 2c: Gradual Migration to Other Composables

### Goal
Gradually integrate remaining state-managing composables using the pattern established in Phase 2b.

### Actions

#### 2c.1: Integrate `useFilters` with $bindable
**Location**: `src/lib/components/entity-list-table/composables/useFilters.svelte.ts`

**Changes**:
1. Add `syncWithExternal` function
2. Update EntityListTable to use $bindable for `filterValues`
3. Maintain backward compatibility

#### 2c.2: Integrate `useAdvancedFilters` with $bindable
**Location**: `src/lib/components/entity-list-table/composables/useAdvancedFilters.svelte.ts`

**Changes**:
1. Add `syncWithExternal` function
2. Update EntityListTable to use $bindable for `advancedFilters`
3. Maintain backward compatibility

#### 2c.3: Integrate `useDeletionFilter` with $bindable
**Location**: `src/lib/components/entity-list-table/composables/useDeletionFilter.svelte.ts`

**Changes**:
1. Add `syncWithExternal` function
2. Update EntityListTable to use $bindable for `deletionFilterMode`
3. Maintain backward compatibility

#### 2c.4: Fix `useKeyboardNavigation` parameter mismatch
**Location**: `src/lib/components/entity-list-table/composables/useKeyboardNavigation.svelte.ts`

**Changes**:
1. Update to accept derived state or conditional parameters
2. Support both client and server paging modes
3. Test keyboard navigation in both modes

### Acceptance Criteria
- All state-managing composables integrated with $bindable
- All functionality preserved
- Backward compatibility maintained
- Code reduction achieved (~1039 lines total)
- All tests pass
- TypeScript compilation succeeds

### Risk Assessment
- **Risk Level**: Low-Medium
- **Reason**: Following established pattern from Phase 2b
- **Mitigation**: Incremental integration, comprehensive testing at each step

---

## Testing Strategy

### Unit Tests
- Test each new composable in isolation
- Test bindable sync logic
- Test backward compatibility

### Integration Tests
- Test EntityListTable with new composables
- Test all consumer scenarios (old and new patterns)
- Test all dialog, bulk action, and row action functionality

### Manual Testing
- Test selection (single, multiple, all, range)
- Test sorting (all sortable columns)
- Test filtering (basic and advanced)
- Test deletion filter
- Test export (all scopes, all file types)
- Test bulk actions (delete, restore, duplicate)
- Test row actions (edit, delete, restore, duplicate, export, preview)
- Test keyboard navigation
- Test pagination
- Test view mode switching
- Test column visibility
- Test column ordering

### Regression Testing
- Ensure all existing functionality still works
- Ensure no breaking changes for consumers
- Ensure performance is not degraded

---

## Success Criteria

### Phase 2a
- [ ] All business logic composables created
- [ ] EntityListTable uses new composables
- [ ] ~1058 lines removed from main component
- [ ] All dialog functionality works
- [ ] All bulk actions work
- [ ] All row actions work
- [ ] No breaking changes
- [ ] All tests pass

### Phase 2b
- [ ] `useSelection` and `useSorting` support bindable sync
- [ ] EntityListTable uses $bindable for high-value props
- [ ] Backward compatibility maintained
- [ ] New bind syntax works
- [ ] All selection and sorting functionality works
- [ ] No breaking changes
- [ ] All tests pass

### Phase 2c
- [ ] All state-managing composables integrated
- [ ] ~1039 lines total reduction achieved
- [ ] All functionality preserved
- [ ] Backward compatibility maintained
- [ ] All tests pass

### Overall
- [ ] Code is more maintainable and readable
- [ ] Performance is not degraded
- [ ] Aligns with Svelte 5 best practices
- [ ] No breaking changes to consumers
- [ ] TypeScript compilation succeeds
- [ ] All tests pass

---

## Estimated Timeline

- **Phase 2a**: 1-2 days
- **Phase 2b**: 1-2 days
- **Phase 2c**: 1-2 days (can be spread over time)
- **Total**: 2-4 days (can be implemented incrementally)

---

## Notes

- This plan follows Svelte 5 best practices:
  - Uses $bindable for two-way binding (recommended pattern)
  - Maintains clear state ownership
  - Avoids complex sync logic (unlike Option C)
  - Aligns with "don't mutate props directly" principle

- Backward compatibility is maintained throughout:
  - Old callback pattern still works
  - New bind syntax is optional for consumers
  - Consumers can migrate gradually

- Risk is minimized through:
  - Incremental implementation
  - Independent phases
  - Comprehensive testing
  - Ability to rollback each phase independently
