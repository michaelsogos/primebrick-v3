# EntityListTable Refactoring - Phase 12: Sheet Management Composable

## Overview

This phase focuses on extracting the complex sheet management logic into a dedicated composable. The sheet state synchronization and panel props management are currently handled in the main component.

**Target Lines**: ~100 lines (lines 508-607)  
**Risk Level**: Medium  
**Estimated Time**: 2-3 hours  
**Expected Reduction**: ~100 lines

---

## Tasks

### 12.1 Extract Sheet Management Composable

**Status**: ❌ NOT STARTED  
**Target**: Lines 508-607  
**New File**: `src/lib/components/entity-list-table/composables/useSheetPanelManagement.svelte.ts`

**Description**:
Extract the sheet state synchronization and panel props management logic into a dedicated composable.

**Composable Interface**:
```typescript
function useSheetPanelManagement(options: {
  sheetState: { panelId: string | null; open: boolean; props: any };
  filtersOpen: boolean;
  visibleKeys: string[];
  searchInKeys: string[] | null;
  stickyColumnsGroup: MetaColumn[];
  nonAuditingColumns: MetaColumn[];
  auditingColumnsGroup: MetaColumn[];
  filterableColumns: MetaColumn[];
  filterValues: Record<string, unknown>;
  onFilterValuesChange?: (values: Record<string, unknown>) => void;
  onResetFilters?: () => void;
  advancedFilters: AdvancedFilter[];
  onAdvancedFiltersChange?: (filters: AdvancedFilter[], logic: 'AND' | 'OR') => void;
  orderState: ColumnOrderState;
  writeOrderState: (state: ColumnOrderState) => void;
  toggleColumnKey: (key: string) => void;
  onResetColumnVisibility: (view: 'table' | 'card') => void;
  toggleSearchKey: (key: string) => void;
  onSearchInKeysChange: (keys: string[] | null) => void;
  checkboxVisualOnlyClass: string;
  t: (key: string) => string;
}): {
  closeFiltersSheet: () => void;
  openColumnSelectorSheet: () => void;
  openSearchInSheet: () => void;
  openFiltersSheet: () => void;
}
```

**State to Extract**:
```typescript
let lastPanelId = $state<string | null>(null);
```

**Effects to Extract**:
- Sheet panel ID tracking
- Filters open/close synchronization
- Panel props reactive updates

**Functions to Extract**:
- Sheet open/close handlers
- Panel props management
- Column selector sheet logic
- Search in sheet logic
- Filters sheet logic

**Implementation Steps**:
1. Create `useSheetPanelManagement.svelte.ts` in `composables/` directory
2. Extract sheet state tracking logic (lines 509-512)
3. Extract filters open/close synchronization (lines 518-523, 603-607)
4. Extract panel props reactive updates (lines 528-600)
5. Extract sheet open/close handlers
6. Export composable function
7. Update main component to use new composable
8. Test sheet functionality

---

### 12.2 Update Main Component

**Status**: ❌ NOT STARTED  
**Target**: Main component  
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Description**:
Update the main component to use the new sheet management composable.

**Changes to Make**:
1. Import the new composable
2. Initialize composable with required props
3. Replace sheet management logic with composable calls
4. Remove extracted state and effects
5. Update sheet open/close handlers

**Implementation Steps**:
1. Add import for `useSheetPanelManagement`
2. Initialize composable in component
3. Replace sheet state tracking with composable
4. Replace panel props management with composable
5. Update sheet open/close handlers
6. Test all sheet functionality

---

## Implementation Guidelines

### Svelte 5 Patterns
- Use `$state()` for composable state
- Use `$effect()` for side effects
- Return functions and state from composable
- Use typed interfaces for composable options

### Code Style
- Follow existing composable patterns in the codebase
- Maintain consistent naming conventions
- Use TypeScript for all new composables
- Add proper JSDoc comments for complex functions

### Sheet Management
- Handle sheet state synchronization properly
- Ensure panel props are updated reactively
- Handle edge cases (sheet closing, panel switching)
- Maintain existing sheet behavior

### Translations
- **CRITICAL**: Always add translation keys immediately when adding labels
- Follow existing translation key patterns
- Use `$t()` function for all user-facing text
- Check `docs/ai/i18n.md` for translation rules

### Testing
- Test each extracted function independently
- Verify existing functionality is preserved
- Check for any broken references
- Test all sheet panels (filters, columns, search in)
- Test sheet state synchronization
- Test panel props updates
- Run typecheck: `pnpm run check`

### Git Workflow
- **NEVER commit automatically** - wait for explicit user instruction
- Follow GitFlow rules in `docs/gitflow.md`
- Create feature branches for refactoring work
- Get approval before merging

---

## Expected Results

### File Size Reduction
- **Before**: 1604 lines (after Phase 11)
- **After**: ~1504 lines
- **Reduction**: ~100 lines (6% from current)

### Code Quality Improvements
- Centralized sheet management logic
- Better separation of concerns
- Improved maintainability
- Easier testing of sheet functionality
- Clearer component responsibilities
- Reusable composable for other components

### Performance
- No performance degradation expected
- Potential minor improvements from better state management
- Maintained reactivity and performance characteristics

---

## Notes

- All extractions will maintain backward compatibility
- Existing props interface will be preserved
- No breaking changes to component API
- Follow existing AGENTS.md rules
- Update this document as implementation progresses
- Ensure sheet state synchronization works correctly
- Test all sheet panels thoroughly
