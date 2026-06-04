# Phase 1: Complete Existing Composable Integration

## Overview
Complete the integration of existing composables (useBulkActions, useRowActions, useExport) that were created in previous refactoring efforts but not fully integrated into EntityListTable.svelte.

## Expected Reduction
~430 lines (10%) - from 4162 to ~3732 lines

## Current State Analysis

### Bulk Actions Status
- ✅ useBulkActions composable exists at `src/lib/components/entity-list-table/composables/useBulkActions.svelte.ts`
- ❌ Inline bulk action functions still exist in EntityListTable.svelte
- ❌ Template references use inline functions instead of composable

### Row Actions Status
- ✅ useRowActions composable exists at `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts`
- ❌ Inline row action functions still exist in EntityListTable.svelte
- ❌ Template references use inline functions instead of composable

### Export Status
- ✅ useExport composable exists at `src/lib/components/entity-list-table/composables/useExport.svelte.ts`
- ❌ Inline export state variables still exist in EntityListTable.svelte
- ❌ Inline export functions still exist in EntityListTable.svelte
- ❌ Template references use inline state instead of composable

## Target State
- All bulk actions use useBulkActions composable
- All row actions use useRowActions composable
- All export logic uses useExport composable
- No inline bulk/row/export functions remain
- Template references use composable state and methods
- No compilation errors
- All functionality works correctly

## Prerequisites
- useBulkActions composable exists and is functional
- useRowActions composable exists and is functional
- useExport composable exists and is functional
- EntityListTable.svelte at current state (4162 lines)

## Actions

### 1.1 Complete Bulk Actions Integration

#### Step 1.1.1: Verify Composable Initialization
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check if bulkActions composable is initialized**:
```bash
grep -n "const bulkActions" src/lib/components/entity-list-table/EntityListTable.svelte
```

**If not initialized, add initialization after line ~1888** (after toolbarModeState):
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
  },
  onRefresh: onRefresh,
  onToolbarModeChange: () => {
    toolbarMode = 'filters';
  },
  t: $t
});
```

#### Step 1.1.2: Replace handleBulkDelete Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1081-1083

**Find exact location**:
```bash
grep -n "function handleBulkDelete" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code**:
```typescript
function handleBulkDelete() {
  // Open confirmation dialog instead of deleting directly
  bulkDeleteConfirmDialogOpen = true;
}
```

**Replace with**:
```typescript
function handleBulkDelete() {
  dialogs.openDeleteDialog();
}
```

#### Step 1.1.3: Replace confirmBulkDelete Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1086-1115

**Find exact location**:
```bash
grep -n "async function confirmBulkDelete" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (entire function):
```typescript
async function confirmBulkDelete() {
  if (selectedKeys.length === 0) return;
  try {
    isBulkDeleting = true;
    const res = await apiFetch(`/api/v1/entities/${entity}/bulk-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uuids: selectedKeys })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ title: 'Unknown error', status: res.status, detail: 'Unknown error' })) as {
        title?: string;
        status?: number;
        detail?: string;
        instance?: string;
        internal_code?: string;
      };

      const toneForImpact = 'danger';
      throw {
        type: 'about:blank',
        title: data.title || 'Bulk delete failed',
        status: data.status || res.status,
        detail: data.detail || 'Unknown error',
        instance: data.instance,
        internal_code: data.internal_code,
        toneForImpact
      };
    }

    // Clear selection after successful deletion
    selectedKeys = [];
    // Switch back to filters mode
    toolbarMode = 'filters';
    // Refresh the list after successful deletion
    if (onRefresh) {
      onRefresh();
    }
  } catch (error) {
    console.error('Bulk delete failed:', error);

    if (error && typeof error === 'object' && 'title' in error) {
      const err = error as RFC7807Error;
      pushRFC7807Error(err, { showToast: true });
    } else {
      pushImpactError({
        impact: 'MEDIUM',
        messageKey: 'entities.list.bulkDeleteFailed',
        scope: $t('errors.scope.bulkDeleteApi'),
        detail: error instanceof Error ? error.message : String(error),
        toast: true,
      });
    }
  } finally {
    isBulkDeleting = false;
  }
}
```

**Replace with**:
```typescript
async function confirmBulkDelete() {
  await bulkActions.confirmBulkDelete();
  dialogs.closeDeleteDialog();
}
```

#### Step 1.1.4: Replace handleBulkRestore Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1118-1120

**Find exact location**:
```bash
grep -n "function handleBulkRestore" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code**:
```typescript
function handleBulkRestore() {
  // Open confirmation dialog instead of restoring directly
  bulkRestoreConfirmDialogOpen = true;
}
```

**Replace with**:
```typescript
function handleBulkRestore() {
  dialogs.openRestoreDialog();
}
```

#### Step 1.1.5: Replace confirmBulkRestore Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1123-1152

**Find exact location**:
```bash
grep -n "async function confirmBulkRestore" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (entire function):
```typescript
async function confirmBulkRestore() {
  if (selectedKeys.length === 0) return;
  try {
    isBulkRestoring = true;
    const res = await apiFetch(`/api/v1/entities/${entity}/bulk-restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uuids: selectedKeys })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ title: 'Unknown error', status: res.status, detail: 'Unknown error' })) as {
        title?: string;
        status?: number;
        detail?: string;
        instance?: string;
        internal_code?: string;
      };

      const toneForImpact = 'warning';
      throw {
        type: 'about:blank',
        title: data.title || 'Bulk restore failed',
        status: data.status || res.status,
        detail: data.detail || 'Unknown error',
        instance: data.instance,
        internal_code: data.internal_code,
        toneForImpact
      };
    }

    // Clear selection after successful restore
    selectedKeys = [];
    // Switch back to filters mode
    toolbarMode = 'filters';
    // Refresh the list after successful restore
    if (onRefresh) {
      onRefresh();
    }
  } catch (error) {
    console.error('Bulk restore failed:', error);

    if (error && typeof error === 'object' && 'title' in error) {
      const err = error as RFC7807Error;
      pushRFC7807Error(err, { showToast: true });
    } else {
      pushImpactError({
        impact: 'MEDIUM',
        messageKey: 'entities.list.bulkRestoreFailed',
        scope: $t('errors.scope.bulkRestoreApi'),
        detail: error instanceof Error ? error.message : String(error),
        toast: true,
      });
    }
  } finally {
    isBulkRestoring = false;
  }
}
```

**Replace with**:
```typescript
async function confirmBulkRestore() {
  await bulkActions.confirmBulkRestore();
  dialogs.closeRestoreDialog();
}
```

#### Step 1.1.6: Update Bulk Delete Template References
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find and replace bulk delete dialog bind:open**:
```bash
grep -n "bind:open={dialogs.deleteDialogOpen}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Update template to use composable loading state**:
```bash
grep -n "disabled={isBulkDeleting}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
disabled={bulkActions.isDeleting}
```

**Update loading indicator**:
```bash
grep -n "{#if isBulkDeleting}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
{#if bulkActions.isDeleting}
```

#### Step 1.1.7: Update Bulk Restore Template References
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Update template to use composable loading state**:
```bash
grep -n "disabled={isBulkRestoring}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
disabled={bulkActions.isRestoring}
```

**Update loading indicator**:
```bash
grep -n "{#if isBulkRestoring}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
{#if bulkActions.isRestoring}
```

### 1.2 Complete Row Actions Integration

#### Step 1.2.1: Verify Composable Initialization
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check if rowActionsComposable is initialized**:
```bash
grep -n "const rowActionsComposable" src/lib/components/entity-list-table/EntityListTable.svelte
```

**If not initialized, add initialization after bulkActions**:
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

#### Step 1.2.2: Replace handleEditRow Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~924-928

**Find exact location**:
```bash
grep -n "function handleEditRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code**:
```typescript
function handleEditRow(row: TRow) {
  if (isRowDeleted(row)) {
    console.log('Cannot edit deleted row:', rowKey(row));
    return;
  }
  if (onEditAction) {
    onEditAction(row);
  }
  closeRowDropdown();
}
```

**Replace with**:
```typescript
function handleEditRow(row: TRow) {
  rowActionsComposable.handleEditRow(row);
}
```

#### Step 1.2.3: Replace handlePreviewRow Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~929-936

**Find exact location**:
```bash
grep -n "function handlePreviewRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code**:
```typescript
function handlePreviewRow(row: TRow) {
  previewRow = row;
  previewRowIndex = viewRows.findIndex(r => rowKey(r) === rowKey(row));
  focusedRowIndex = previewRowIndex;
  previewEditMode = false;
  previewPanelOpen = true;
  closeRowDropdown();
}
```

**Replace with**:
```typescript
function handlePreviewRow(row: TRow) {
  rowActionsComposable.handlePreviewRow(row);
}
```

#### Step 1.2.4: Update handleDeleteRow to Set Row Context
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1049-1054

**Find exact location**:
```bash
grep -n "function handleDeleteRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code**:
```typescript
function handleDeleteRow(row: TRow) {
  // Open confirmation dialog instead of deleting directly
  rowToDelete = row;
  dialogs.openDeleteDialog();
  closeRowDropdown();
}
```

**No change needed** - this already sets rowToDelete and uses dialogs correctly. The composable's handleDeleteRow only closes dropdown, so we keep the inline version to manage row context.

#### Step 1.2.5: Update handleRestoreRow to Set Row Context
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1057-1062

**Find exact location**:
```bash
grep -n "function handleRestoreRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code**:
```typescript
function handleRestoreRow(row: TRow) {
  // Open confirmation dialog instead of restoring directly
  rowToRestore = row;
  dialogs.openRestoreDialog();
  closeRowDropdown();
}
```

**No change needed** - this already sets rowToRestore and uses dialogs correctly.

#### Step 1.2.6: Update handleDuplicateRow to Set Row Context
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1273-1282

**Find exact location**:
```bash
grep -n "function handleDuplicateRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code**:
```typescript
function handleDuplicateRow(row: TRow) {
  if (isRowDeleted(row)) {
    console.log('Cannot duplicate deleted row:', rowKey(row));
    return;
  }
  singleRowToDuplicate = row;
  duplicateScope = 'single';
  dialogs.openDuplicateDialog();
  closeRowDropdown();
}
```

**No change needed** - this already sets singleRowToDuplicate and uses dialogs correctly.

#### Step 1.2.7: Replace confirmDeleteRow Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1065-1080

**Find exact location**:
```bash
grep -n "async function confirmDeleteRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (entire function):
```typescript
async function confirmDeleteRow() {
  if (!rowToDelete) return;
  try {
    const uuidValue = rowToDelete[uid] as string;
    await apiFetch(`/api/v1/entities/${entity}/${uuidValue}`, {
      method: 'DELETE'
    });
    dialogs.closeDeleteDialog();
    rowToDelete = null;
    // Refresh the list after successful deletion
    if (onRefresh) {
      onRefresh();
    }
  } catch (error) {
    console.error('Delete failed:', error);
    // Handle both RFC 7807 errors and non-RFC errors
    if (error && typeof error === 'object' && 'title' in error) {
      const err = error as RFC7807Error;
      // Ensure required RFC 7807 fields are present
      const rfcError: RFC7807Error = {
        type: err.type || 'about:blank',
        title: err.title || 'Delete failed',
        status: err.status || 500,
        detail: err.detail || 'Unknown error',
        internal_code: err.internal_code,
        instance: err.instance,
        severity: err.severity
      };
      pushRFC7807Error(rfcError, { showToast: true });
    } else {
      pushImpactError({
        impact: 'MEDIUM',
        messageKey: 'entities.list.deleteFailed',
        scope: $t('errors.scope.deleteApi'),
        detail: error instanceof Error ? error.message : String(error),
        toast: true,
      });
    }
  } finally {
    // isDeleting is now managed by rowActionsComposable
  }
}
```

**Replace with**:
```typescript
async function confirmDeleteRow() {
  if (!rowToDelete) return;
  await rowActionsComposable.confirmDeleteRow(rowToDelete);
  dialogs.closeDeleteDialog();
  rowToDelete = null;
}
```

#### Step 1.2.8: Replace confirmRestoreRow Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1073-1088

**Find exact location**:
```bash
grep -n "async function confirmRestoreRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (entire function):
```typescript
async function confirmRestoreRow() {
  if (!rowToRestore) return;
  try {
    const uuidValue = rowToRestore[uid] as string;
    await apiFetch(`/api/v1/entities/${entity}/${uuidValue}/restore`, {
      method: 'POST'
    });
    dialogs.closeRestoreDialog();
    rowToRestore = null;
    // Refresh the list after successful restore
    if (onRefresh) {
      onRefresh();
    }
  } catch (error) {
    console.error('Restore failed:', error);
    // Handle both RFC 7807 errors and non-RFC errors
    if (error && typeof error === 'object' && 'title' in error) {
      const err = error as RFC7807Error;
      // Ensure required RFC 7807 fields are present
      const rfcError: RFC7807Error = {
        type: err.type || 'about:blank',
        title: err.title || 'Restore failed',
        status: err.status || 500,
        detail: err.detail || 'Unknown error',
        internal_code: err.internal_code,
        instance: err.instance,
        severity: err.severity
      };
      pushRFC7807Error(rfcError, { showToast: true });
    } else {
      pushImpactError({
        impact: 'MEDIUM',
        messageKey: 'entities.list.restoreFailed',
        scope: $t('errors.scope.restoreApi'),
        detail: error instanceof Error ? error.message : String(error),
        toast: true,
      });
    }
  } finally {
    // isRestoring is now managed by rowActionsComposable
  }
}
```

**Replace with**:
```typescript
async function confirmRestoreRow() {
  if (!rowToRestore) return;
  await rowActionsComposable.confirmRestoreRow(rowToRestore);
  dialogs.closeRestoreDialog();
  rowToRestore = null;
}
```

#### Step 1.2.9: Replace confirmDuplicate Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1284-1320

**Find exact location**:
```bash
grep -n "async function confirmDuplicate" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (entire function):
```typescript
async function confirmDuplicate() {
  if (duplicateScope === 'selected') {
    await bulkActions.confirmBulkDuplicate();
    dialogs.closeDuplicateDialog();
    return;
  }

  if (!singleRowToDuplicate) return;
  try {
    isDuplicating = true;
    const uuidValue = singleRowToDuplicate[uid] as string;
    const response = await apiFetch(`/api/v1/entities/${entity}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuids: [uuidValue] })
    });

    if (!response.ok) {
      const errorData = await response.json() as RFC7807Error & { duplicateResults?: { successful: string[]; failed: Array<{ uuid: string; error: string }> } };
      const enhancedError = { ...errorData, duplicateResults: errorData.duplicateResults };
      pushRFC7807Error(enhancedError, { showToast: true });
      throw enhancedError;
    }

    const result = await response.json() as { uuids: string[]; errors: Array<{ uuid: string; error: string }> };
    if (result.errors.length > 0) {
      pushImpactError({
        impact: 'MEDIUM',
        messageKey: 'entities.list.duplicatePartialSuccess',
        messageParams: { count: result.uuids.length, failed: result.errors.length },
        scope: $t('errors.scope.duplicateApi')
      });
    } else {
      pushImpactError({
        impact: 'LOW',
        messageKey: 'entities.list.duplicateSuccess',
        messageParams: { count: result.uuids.length },
        scope: $t('errors.scope.duplicateApi')
      });
    }

    // Refresh the list
    if (onRefresh) {
      onRefresh();
    }
    dialogs.closeDuplicateDialog();
  } catch (error) {
    console.error('Duplicate failed:', error);
    pushImpactError({
      impact: 'MEDIUM',
      messageKey: 'entities.list.duplicateFailed',
      scope: $t('errors.scope.duplicateApi'),
      detail: error instanceof Error ? error.message : String(error),
      toast: true,
    });
  } finally {
    isDuplicating = false;
  }
}
```

**Replace with**:
```typescript
async function confirmDuplicate() {
  if (duplicateScope === 'selected') {
    await bulkActions.confirmBulkDuplicate();
    dialogs.closeDuplicateDialog();
    return;
  }

  if (!singleRowToDuplicate) return;
  await rowActionsComposable.confirmDuplicateRow(singleRowToDuplicate);
  dialogs.closeDuplicateDialog();
  singleRowToDuplicate = null;
}
```

#### Step 1.2.10: Update Row Action Template References
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Update delete dialog loading state**:
```bash
grep -n "disabled={isDeleting}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
disabled={rowActionsComposable.isDeleting}
```

**Update restore dialog loading state**:
```bash
grep -n "disabled={isRestoring}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
disabled={rowActionsComposable.isRestoring}
```

**Update duplicate dialog loading state**:
```bash
grep -n "disabled={isDuplicating}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
disabled={rowActionsComposable.isDuplicating}
```

### 1.3 Complete Export Integration

#### Step 1.3.1: Verify Composable Initialization
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check if exportComposable is initialized**:
```bash
grep -n "const exportComposable" src/lib/components/entity-list-table/EntityListTable.svelte
```

**If not initialized, add initialization after rowActionsComposable**:
```typescript
const exportComposable = useExport({
  entity: () => entity,
  uid: () => uid,
  columns: () => columns,
  selectedKeys: () => selectedKeys,
  search: () => search,
  searchInKeys: () => searchInKeys,
  sortKey: () => sortKey,
  sortDir: () => sortDir,
  filterValues: () => filterValues,
  advancedFilters: () => advancedFilters,
  deletionFilterMode: () => deletionFilterMode,
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

#### Step 1.3.2: Remove Inline Export State Variables
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~799-805

**Find exact location**:
```bash
grep -n "let isExporting = \$state" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these state variables**:
```typescript
let isExporting = $state(false);
let exportScope = $state<'selected' | 'all'>('selected');
let htmlExportScope = $state<'selected' | 'all'>('selected');
```

#### Step 1.3.3: Replace handleHtmlExport Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines ~1304-1320

**Find exact location**:
```bash
grep -n "function handleHtmlExport" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (entire function):
```typescript
function handleHtmlExport() {
  // Implementation details...
}
```

**Replace with**:
```typescript
function handleHtmlExport() {
  exportComposable.handleHtmlExport();
}
```

#### Step 1.3.4: Update Export Template References
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Update export dialog bind:open**:
```bash
grep -n "bind:open={exportOpen}" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
bind:open={exportComposable.exportOpen}
```

**Update export scope references**:
```bash
grep -n "exportScope" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
exportComposable.exportScope
```

**Update html export scope references**:
```bash
grep -n "htmlExportScope" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
exportComposable.htmlExportScope
```

**Update loading state references**:
```bash
grep -n "isExporting" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
exportComposable.isExporting
```

**Update html export loading state**:
```bash
grep -n "isHtmlExporting" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with**:
```svelte
exportComposable.isHtmlExporting
```

## Verification Steps

### Step 1: Type Check
```bash
cd D:\git\primebrick\primebrick-fe-v3
pnpm run check
```

**Expected**: No TypeScript errors

### Step 2: Build Check
```bash
pnpm run build
```

**Expected**: Build succeeds without errors

### Step 3: Manual Testing
Test the following functionality:
1. Bulk delete - select multiple rows, click bulk delete, confirm
2. Bulk restore - select multiple deleted rows, click bulk restore, confirm
3. Row edit - click edit on a row
4. Row delete - click delete on a row, confirm
5. Row restore - click restore on a deleted row, confirm
6. Row duplicate - click duplicate on a row, confirm
7. Export - click export, select options, export

**Expected**: All functionality works correctly

### Step 4: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~3732 lines (reduction of ~430 lines)

## Acceptance Criteria
- ✅ All bulk actions use useBulkActions composable
- ✅ All row actions use useRowActions composable
- ✅ All export logic uses useExport composable
- ✅ No inline bulk/row/export functions remain
- ✅ Template references use composable state and methods
- ✅ No compilation errors
- ✅ All functionality works correctly
- ✅ Line count reduced by ~430 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually revert changes by restoring inline functions
3. Document what failed and why

## Notes
- This phase focuses on integrating existing composables
- No new composables are created
- The composables already exist and should be functional
- Main work is replacing inline code with composable calls
- Template updates are critical for state management
