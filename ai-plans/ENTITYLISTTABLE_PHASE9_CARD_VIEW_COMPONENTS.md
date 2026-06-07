# EntityListTable Refactoring - Phase 9: Card View Components

## Overview

This phase focuses on extracting card view components from the main `EntityListTable.svelte` component. This is the largest remaining UI section and will have the most significant impact on file size reduction.

**Target Lines**: ~470 lines (lines 1657-2126)  
**Risk Level**: Medium  
**Estimated Time**: 3-4 hours  
**Expected Reduction**: ~470 lines

---

## Tasks

### 9.1 Extract Card View Renderer Component

**Status**: ❌ NOT STARTED  
**Target**: Lines 1657-2126  
**New File**: `src/lib/components/entity-list-table/components/CardViewRenderer.svelte`

**Description**:
Extract the main card view container that handles card grid/list layout and manages card view state.

**Props to Extract**:
```typescript
{
  viewMode: 'grid' | 'list';
  viewRows: TRow[];
  shownColumns: MetaColumn[];
  rowSelectionEnabled: boolean;
  selectedKeys: string[];
  rowKey: (row: TRow) => string;
  isRowDeleted: (row: TRow) => boolean;
  previewPanel: { focusedRowIndex: number | null };
  actionsEnabled: boolean;
  rowActions?: Snippet<[{ row: TRow }]>;
  entityRowActions?: { edit?: boolean; duplicate?: boolean; preview?: boolean; delete?: boolean };
  dropdownMenuRow: TRow | null;
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
  cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
  onEntityRowClick: (key: string, e: MouseEvent) => void;
  onPreviewRow: (row: TRow) => void;
  onToggleRowSelect: (key: string) => void;
  onOpenRowDropdown: (row: TRow) => void;
  onCloseRowDropdown: () => void;
  onEditRow: (row: TRow) => void;
  onLoadVersionHistory: (row: TRow) => void;
  onDuplicateRow: (row: TRow) => void;
  onDeleteRow: (row: TRow) => void;
  onRestoreRow: (row: TRow) => void;
}
```

**Implementation Steps**:
1. Create `CardViewRenderer.svelte` in `components/` directory
2. Extract card view container logic (lines 1657-1716)
3. Extract card grid/list rendering logic (lines 1717-2126)
4. Replace extracted code with component usage in main file
5. Test card view functionality

---

### 9.2 Extract Card Item Component

**Status**: ❌ NOT STARTED  
**Target**: Part of lines 1717-2126  
**New File**: `src/lib/components/entity-list-table/components/CardItem.svelte`

**Description**:
Extract individual card item wrapper that handles card selection state and click interactions.

**Props to Extract**:
```typescript
{
  row: TRow;
  index: number;
  rowKey: string;
  rowSelected: boolean;
  rowDeleted: boolean;
  rowFocused: boolean;
  rowSelectionEnabled: boolean;
  actionsEnabled: boolean;
  shownColumns: MetaColumn[];
  stickyColumnsGroup: MetaColumn[];
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
  cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
  rowActions?: Snippet<[{ row: TRow }]>;
  entityRowActions?: { edit?: boolean; duplicate?: boolean; preview?: boolean; delete?: boolean };
  dropdownMenuRow: TRow | null;
  onEntityRowClick: (key: string, e: MouseEvent) => void;
  onPreviewRow: (row: TRow) => void;
  onToggleRowSelect: (key: string) => void;
  onOpenRowDropdown: (row: TRow) => void;
  onCloseRowDropdown: () => void;
  onEditRow: (row: TRow) => void;
  onLoadVersionHistory: (row: TRow) => void;
  onDuplicateRow: (row: TRow) => void;
  onDeleteRow: (row: TRow) => void;
  onRestoreRow: (row: TRow) => void;
}
```

**Implementation Steps**:
1. Create `CardItem.svelte` in `components/` directory
2. Extract card item wrapper logic
3. Extract card click and selection handlers
4. Replace extracted code with component usage in CardViewRenderer
5. Test card item interactions

---

### 9.3 Extract Card Field Renderer Component

**Status**: ❌ NOT STARTED  
**Target**: Part of lines 1717-2126  
**New File**: `src/lib/components/entity-list-table/components/CardFieldRenderer.svelte`

**Description**:
Extract card field rendering logic that handles sticky field styling and field-specific display.

**Props to Extract**:
```typescript
{
  row: TRow;
  column: MetaColumn;
  rowSelected: boolean;
  rowDeleted: boolean;
  stickyColumnsGroup: MetaColumn[];
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
  datetimeIanaRenderTick: number;
  cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
}
```

**Implementation Steps**:
1. Create `CardFieldRenderer.svelte` in `components/` directory
2. Extract card field rendering logic
3. Extract sticky field styling logic
4. Reuse existing `CardField` component
5. Replace extracted code with component usage in CardItem
6. Test card field display

---

### 9.4 Extract Card Actions Component

**Status**: ❌ NOT STARTED  
**Target**: Part of lines 1717-2126  
**New File**: `src/lib/components/entity-list-table/components/CardActions.svelte`

**Description**:
Extract card action buttons (checkbox, dropdown) that handles action menu state and button clicks.

**Props to Extract**:
```typescript
{
  row: TRow;
  rowKey: string;
  rowSelected: boolean;
  rowDeleted: boolean;
  rowSelectionEnabled: boolean;
  actionsEnabled: boolean;
  selectedKeys: string[];
  rowActions?: Snippet<[{ row: TRow }]>;
  entityRowActions?: { edit?: boolean; duplicate?: boolean; preview?: boolean; delete?: boolean };
  dropdownMenuRow: TRow | null;
  onToggleRowSelect: (key: string) => void;
  onOpenRowDropdown: (row: TRow) => void;
  onCloseRowDropdown: () => void;
  onEditRow: (row: TRow) => void;
  onLoadVersionHistory: (row: TRow) => void;
  onDuplicateRow: (row: TRow) => void;
  onDeleteRow: (row: TRow) => void;
  onRestoreRow: (row: TRow) => void;
}
```

**Implementation Steps**:
1. Create `CardActions.svelte` in `components/` directory
2. Extract card checkbox logic
3. Extract card dropdown menu logic
4. Extract action button handlers
5. Replace extracted code with component usage in CardItem
6. Test card actions

---

### 9.5 Extract Card Styling Utilities

**Status**: ❌ NOT STARTED  
**Target**: Scattered styling functions  
**New File**: `src/lib/components/entity-list-table/utils/card-styling.ts`

**Description**:
Extract card-specific styling functions to a dedicated utility file.

**Functions to Extract**:
- `stickyCardFieldChromeClass` (currently in main component)
- Any other card-specific styling functions

**Implementation Steps**:
1. Create `card-styling.ts` in `utils/` directory
2. Extract card styling functions
3. Export functions
4. Import in components that use them
5. Test styling remains consistent

---

## Implementation Guidelines

### Svelte 5 Patterns
- Use `$state()` for component state
- Use `$derived()` for computed values
- Use `$props()` for component props
- Use callbacks for events

### Code Style
- Follow existing code patterns in the codebase
- Maintain consistent naming conventions
- Use TypeScript for all new components
- Add proper JSDoc comments for complex functions

### Translations
- **CRITICAL**: Always add translation keys immediately when adding labels
- Follow existing translation key patterns
- Use `$t()` function for all user-facing text
- Check `docs/ai/i18n.md` for translation rules

### Testing
- Test each extracted component independently
- Verify existing functionality is preserved
- Check for any broken references
- Run typecheck: `pnpm run check`

### Git Workflow
- **NEVER commit automatically** - wait for explicit user instruction
- Follow GitFlow rules in `docs/gitflow.md`
- Create feature branches for refactoring work
- Get approval before merging

---

## Expected Results

### File Size Reduction
- **Before**: 2504 lines
- **After**: ~2034 lines
- **Reduction**: ~470 lines (19% from current)

### Code Quality Improvements
- Better separation of concerns
- Improved maintainability
- Easier testing of individual components
- Clearer component responsibilities
- Reusable card components

---

## Notes

- All extractions will maintain backward compatibility
- Existing props interface will be preserved
- No breaking changes to component API
- Follow existing AGENTS.md rules
- Update this document as implementation progresses
