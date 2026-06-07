# EntityListTable Refactoring - Phase 11: Bulk Actions Toolbar

## Overview

This phase focuses on extracting the bulk actions toolbar UI from the main component. This is a moderate-sized section that can be extracted relatively quickly.

**Target Lines**: ~160 lines (lines 1571-1640)  
**Risk Level**: Low  
**Estimated Time**: 1-2 hours  
**Expected Reduction**: ~160 lines

---

## Tasks

### 11.1 Extract Bulk Actions Toolbar Component

**Status**: ❌ NOT STARTED  
**Target**: Lines 1571-1640  
**New File**: `src/lib/components/entity-list-table/components/BulkActionsToolbar.svelte`

**Description**:
Extract the bulk actions toolbar that contains the filter/bulk actions toggle button, filter bar display, and bulk action buttons.

**Props to Extract**:
```typescript
{
  toolbarMode: 'filters' | 'bulk';
  hasAppliedFilters: boolean;
  filterValues: Record<string, unknown>;
  advancedFilters: AdvancedFilter[];
  selectedKeys: string[];
  hasDeletedSelected: boolean;
  allSelectedDeleted: boolean;
  filterableColumns: MetaColumn[];
  onResetFilters: () => void;
  onFilterValuesChange: (values: Record<string, unknown>) => void;
  onAdvancedFiltersChange: (filters: AdvancedFilter[], logic: 'AND' | 'OR') => void;
  onToggleToolbarMode: () => void;
  onBulkExport: () => void;
  onHtmlExport: () => void;
  onBulkDuplicate: () => void;
  onBulkDelete: () => void;
  onBulkRestore: () => void;
}
```

**Implementation Steps**:
1. Create `BulkActionsToolbar.svelte` in `components/` directory
2. Extract toolbar mode toggle button (lines 1555-1568)
3. Extract filter bar display (lines 1571-1582)
4. Extract bulk action buttons (lines 1584-1638)
5. Replace extracted code with component usage in main file
6. Test toolbar functionality

---

## Implementation Guidelines

### Svelte 5 Patterns
- Use `$props()` for component props
- Use callbacks for events
- No internal state needed (state managed by parent)

### Code Style
- Follow existing code patterns in the codebase
- Maintain consistent naming conventions
- Use TypeScript for all new components
- Add proper JSDoc comments for complex functions

### UI Components
- Reuse existing UI components (Button, DropdownMenu, etc.)
- Follow existing toolbar component patterns
- Maintain consistent styling with existing toolbar

### Translations
- **CRITICAL**: Always add translation keys immediately when adding labels
- Follow existing translation key patterns
- Use `$t()` function for all user-facing text
- Check `docs/ai/i18n.md` for translation rules

### Testing
- Test each extracted component independently
- Verify existing functionality is preserved
- Check for any broken references
- Test toolbar mode toggle
- Test filter bar display
- Test bulk action buttons
- Run typecheck: `pnpm run check`

### Git Workflow
- **NEVER commit automatically** - wait for explicit user instruction
- Follow GitFlow rules in `docs/gitflow.md`
- Create feature branches for refactoring work
- Get approval before merging

---

## Expected Results

### File Size Reduction
- **Before**: 1764 lines (after Phase 10)
- **After**: ~1604 lines
- **Reduction**: ~160 lines (9% from current)

### Code Quality Improvements
- Better separation of concerns
- Improved maintainability
- Easier testing of toolbar functionality
- Clearer component responsibilities
- Reusable toolbar component

---

## Notes

- All extractions will maintain backward compatibility
- Existing props interface will be preserved
- No breaking changes to component API
- Follow existing AGENTS.md rules
- Update this document as implementation progresses
- This is a relatively simple extraction with low risk
