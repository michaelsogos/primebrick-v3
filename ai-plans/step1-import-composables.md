# Step 1: Import and Initialize Composables

## Overview
Import and initialize the composables (useExport, useBulkActions, useRowActions, useDialogs) in EntityListTable.svelte.

## Current State
- EntityListTable.svelte has been restored from git
- Composables exist in `src/lib/components/entity-list-table/composables/` but are NOT imported
- All logic is still inline
- Existing composables are initialized at lines 1844-1888 (useStickyColumns, useScrollPreservation, useRowRangeSelection, useFilterPersistence, useToolbarMode)

## Target State
- EntityListTable.svelte imports all required composables
- EntityListTable.svelte initializes all composables with correct parameters
- No functional changes yet - just import/initialization

## Actions

### Step 1.1: Add Composable Imports
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: After line 37 (after existing composables import)

**Current code at lines 31-37**:
```typescript
import {
  useStickyColumns,
  useScrollPreservation,
  useRowRangeSelection,
  useFilterPersistence,
  useToolbarMode
} from './composables';
```

**Add these imports after line 37**:
```typescript
import { useExport } from './composables/useExport.svelte.js';
import { useBulkActions } from './composables/useBulkActions.svelte.js';
import { useRowActions } from './composables/useRowActions.svelte.js';
import { useDialogs } from './composables/useDialogs.svelte.js';
```

### Step 1.2: Initialize useExport Composable
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: After line 1888 (after toolbarModeState initialization)

**Current code at lines 1883-1888**:
```typescript
const toolbarModeState = useToolbarMode({
  selectedKeys: () => selectedKeys,
  filterValues: () => filterValues,
  advancedFilters: () => advancedFilters,
  onToolbarModeChange: (mode) => {
    toolbarMode = mode;
  }
});
```

**Add initialization after line 1888**:
```typescript
const exportComposable = useExport({
  entity: () => entity,
  selectedKeys: () => selectedKeys,
  total: () => total,
  onExportStart: () => {
    // Optional: handle export start
  },
  onExportComplete: () => {
    // Optional: handle export complete
  },
  onExportError: (error) => {
    // Optional: handle export error
  }
});
```

### Step 1.3: Initialize useBulkActions Composable
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: After exportComposable initialization (after line 1908)

**Add initialization after exportComposable**:
```typescript
const bulkActions = useBulkActions({
  entity: () => entity,
  selectedKeys: () => selectedKeys,
  onBulkActionStart: () => {
    // Optional: handle bulk action start
  },
  onBulkActionComplete: () => {
    // Optional: handle bulk action complete
  },
  onBulkActionError: (error) => {
    // Optional: handle bulk action error
  },
  onSelectionChange: (keys) => {
    selectedKeys = keys;
  }
});
```

### Step 1.4: Initialize useRowActions Composable
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: After bulkActions initialization (after line 1925)

**Add initialization after bulkActions**:
```typescript
const rowActionsComposable = useRowActions<TRow>({
  entity: () => entity,
  uid: () => uid,
  onEditAction: onEditAction,
  onRefresh: onRefresh,
  isRowDeleted: isRowDeleted,
  rowKey: rowKey,
  onPreviewRow: (row) => {
    previewRow = row;
    previewRowIndex = viewRows.findIndex(r => rowKey(r) === rowKey(row));
    focusedRowIndex = previewRowIndex;
    previewEditMode = false;
    previewPanelOpen = true;
  },
  closeRowDropdown: closeRowDropdown,
  t: $t
});
```

### Step 1.5: Initialize useDialogs Composable
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: After rowActionsComposable initialization (after line 1942)

**Add initialization after rowActionsComposable**:
```typescript
const dialogs = useDialogs();
```

### Step 1.6: Verify Compilation
Run `pnpm run check` to ensure no compilation errors.

## Expected Outcome
- All composables imported successfully
- All composables initialized successfully
- No compilation errors
- No functional changes yet
- Ready for Step 2 (Bulk Actions Refactor)

## Notes
- This step only adds imports and initializations
- No inline code is removed yet
- No template changes yet
- Functional changes will happen in subsequent steps
