# EntityListTable Refactoring - Phase 10: Preview Panel Component

## Overview

This phase focuses on consolidating the scattered preview panel code into a single component. The preview panel logic is currently spread across multiple sections of the main component.

**Target Lines**: ~270 lines (scattered across lines 639-725, 1717-2000)  
**Risk Level**: Medium  
**Estimated Time**: 2-3 hours  
**Expected Reduction**: ~270 lines

---

## Tasks

### 10.1 Extract Preview Panel Wrapper Component

**Status**: ❌ NOT STARTED  
**Target**: Lines 639-725, 1717-2000  
**New File**: `src/lib/components/entity-list-table/components/PreviewPanelWrapper.svelte`

**Description**:
Extract the complete preview panel with resize logic, navigation, and state management into a dedicated component.

**Props to Extract**:
```typescript
{
  previewPanel: {
    previewPanelOpen: boolean;
    previewRow: TRow | null;
    openPreview: (row: TRow) => void;
    closePreview: () => void;
    focusedRowIndex: number | null;
  };
  rows: TRow[];
  viewRows: TRow[];
  uid: string;
  pageSize: number;
  page: number;
  onPageChange: (page: number) => void;
  entity?: string;
  columns: MetaColumn[];
  rowActionsEnabled: boolean;
  rowActions?: Snippet<[{ row: TRow }]>;
  entityRowActions?: { edit?: boolean; duplicate?: boolean; preview?: boolean; delete?: boolean };
  onEditRow: (row: TRow) => void;
  onDuplicateRow: (row: TRow) => void;
  onDeleteRow: (row: TRow) => void;
  onRestoreRow: (row: TRow) => void;
}
```

**State to Extract**:
```typescript
let previewPanelWidth = $state<number>(30); // percentage
let isResizing = $state(false);
let resizeStartX = $state(0);
let resizeStartWidth = $state(0);
let navigatingToNextPage = $state(false);
let navigatingToPrevPage = $state(false);
```

**Functions to Extract**:
```typescript
function startResize(e: MouseEvent)
function handleResize(e: MouseEvent)
function stopResize()
function loadVersionHistory(row: TRow)
```

**Session Storage Logic to Extract**:
- Preview panel state persistence
- Width restoration
- Row key restoration

**Implementation Steps**:
1. Create `PreviewPanelWrapper.svelte` in `components/` directory
2. Extract preview panel state management (lines 639-672)
3. Extract resize handlers (lines 675-696)
4. Extract navigation logic (lines 708-724)
5. Extract preview panel UI (lines 1717-2000)
6. Extract session storage logic
7. Replace extracted code with component usage in main file
8. Test preview panel functionality

---

### 10.2 Update Preview Panel Composable

**Status**: ❌ NOT STARTED  
**Target**: Existing `usePreviewPanel.svelte.ts`  
**File**: `src/lib/components/entity-list-table/composables/usePreviewPanel.svelte.ts`

**Description**:
Update the existing preview panel composable to handle the extracted component's state management more efficiently.

**Changes to Consider**:
- Move session storage logic to composable
- Consolidate preview panel state management
- Simplify component props by moving logic to composable

**Implementation Steps**:
1. Review existing `usePreviewPanel` composable
2. Identify state that can be moved to composable
3. Move session storage logic to composable
4. Update composable interface
5. Update PreviewPanelWrapper to use enhanced composable
6. Test composable functionality

---

## Implementation Guidelines

### Svelte 5 Patterns
- Use `$state()` for component state
- Use `$derived()` for computed values
- Use `$props()` for component props
- Use `$effect()` for side effects (session storage)
- Use callbacks for events

### Code Style
- Follow existing code patterns in the codebase
- Maintain consistent naming conventions
- Use TypeScript for all new components
- Add proper JSDoc comments for complex functions

### Session Storage
- Handle cases where sessionStorage is not available
- Provide sensible defaults when session storage is empty
- Ensure proper error handling
- Test session storage behavior

### Translations
- **CRITICAL**: Always add translation keys immediately when adding labels
- Follow existing translation key patterns
- Use `$t()` function for all user-facing text
- Check `docs/ai/i18n.md` for translation rules

### Testing
- Test each extracted component independently
- Verify existing functionality is preserved
- Check for any broken references
- Test session storage behavior
- Test resize functionality
- Test navigation functionality
- Run typecheck: `pnpm run check`

### Git Workflow
- **NEVER commit automatically** - wait for explicit user instruction
- Follow GitFlow rules in `docs/gitflow.md`
- Create feature branches for refactoring work
- Get approval before merging

---

## Expected Results

### File Size Reduction
- **Before**: 2034 lines (after Phase 9)
- **After**: ~1764 lines
- **Reduction**: ~270 lines (13% from current)

### Code Quality Improvements
- Consolidated preview panel logic
- Better separation of concerns
- Improved maintainability
- Easier testing of preview panel
- Clearer component responsibilities

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
- Ensure session storage logic handles edge cases properly
