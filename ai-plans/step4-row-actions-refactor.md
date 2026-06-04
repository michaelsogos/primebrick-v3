# Step 4: Row Actions Refactor

## Overview
Extract row-level action logic (edit, delete, restore, duplicate) from EntityListTable.svelte into the useRowActions composable.

## Summary of Changes
This step completes the row actions refactoring by:
1. **Simplifying handleEditRow and handlePreviewRow** - Replace inline logic with composable calls
2. **Simplifying confirm functions** - Replace inline API logic (confirmDeleteRow, confirmRestoreRow, confirmDuplicate) with composable calls
3. **Removing cancelDeleteRow** - Template uses dialogs.closeDeleteDialog() directly
4. **Keeping context-setting functions** - handleDeleteRow, handleRestoreRow, handleDuplicateRow remain inline to set row context before opening dialogs
5. **Template integration** - Ensure dialog confirm buttons use the simplified confirm functions

**Key insight**: The composable's handleDeleteRow/handleRestoreRow/handleDuplicateRow only close dropdowns and don't manage dialog state, so we keep inline wrapper functions to set row context (rowToDelete, rowToRestore, singleRowToDuplicate) before calling dialogs.

**Lines affected**: ~200 lines modified/removed across functions 924-933, 936-943, 1077-1118, 1121-1162, 1165-1168, 1374-1418

## Prerequisites
- ✅ Step 1 completed: Composables imported and initialized
- ✅ Step 2 completed: Bulk actions refactored
- ✅ Step 3 completed: Dialog state refactored
- ✅ useRowActions composable initialized as `rowActionsComposable` (line 1851)
- ✅ useDialogs composable handles all dialogs

## Current State Analysis
After Steps 1-3, the current state is:
- **handleEditRow** (line 924-933): Still inline, has full logic
- **handlePreviewRow** (line 936-943): Still inline, has full logic
- **handleDeleteRow** (line 1061-1066): Already uses `dialogs.openDeleteDialog()` from Step 3
- **handleRestoreRow** (line 1069-1074): Already uses `dialogs.openRestoreDialog()` from Step 3
- **confirmDeleteRow** (line 1077-1118): Still inline with full API logic
- **confirmRestoreRow** (line 1121-1162): Still inline with full API logic
- **cancelDeleteRow** (line 1165-1168): Still inline
- **handleDuplicateRow** (line 1363-1372): Still inline with full logic
- **confirmDuplicate** (line 1374-1418): Still inline with full API logic
- **rowActionsComposable** (line 1851-1867): Already initialized correctly

## Critical Issues with Current Plan
1. **Line numbers are outdated**: Current plan shows line numbers from before Steps 1-3
2. **handleDeleteRow/handleRestoreRow already refactored**: They already use dialogs composable from Step 3
3. **Missing handleDuplicateRow**: Plan doesn't mention duplicate row actions at all
4. **Missing confirmDuplicate**: Plan doesn't address the confirmDuplicate function
5. **Dialog state management**: Current inline functions set rowToDelete/rowToRestore before calling dialogs, but composable doesn't handle this
6. **Template integration**: Need to ensure template onclick handlers pass row to composable confirm functions

## Target State
- handleEditRow and handlePreviewRow replaced with composable calls
- handleDeleteRow and handleRestoreRow already use dialogs (no change needed)
- confirmDeleteRow and confirmRestoreRow replaced with composable calls (passing row parameter)
- cancelDeleteRow removed (use dialogs.closeDeleteDialog directly)
- handleDuplicateRow replaced with composable call
- confirmDuplicate replaced with composable call (passing row parameter)
- Row tracking state (rowToDelete, rowToRestore, singleRowToDuplicate) managed inline for dialog context
- All row action API logic in useRowActions composable

## Actions

### Step 4.1: Replace handleEditRow Implementation
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 924-933

**Current code**:
```typescript
/** Handle edit action for a row */
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
/** Handle edit action for a row */
function handleEditRow(row: TRow) {
  rowActionsComposable.handleEditRow(row);
}
```

### Step 4.2: Replace handlePreviewRow Implementation
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 936-943

**Current code**:
```typescript
/** Handle preview action for a row */
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
/** Handle preview action for a row */
function handlePreviewRow(row: TRow) {
  rowActionsComposable.handlePreviewRow(row);
}
```

### Step 4.3: Update handleDeleteRow to Set Row Context
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1061-1066

**Current code** (already uses dialogs from Step 3):
```typescript
/** Handle delete action for a row */
function handleDeleteRow(row: TRow) {
  // Open confirmation dialog instead of deleting directly
  rowToDelete = row;
  dialogs.openDeleteDialog();
  closeRowDropdown();
}
```

**No change needed** - this already sets rowToDelete and uses dialogs correctly. The composable's handleDeleteRow only closes dropdown, so we keep the inline version to manage row context.

### Step 4.4: Update handleRestoreRow to Set Row Context
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1069-1074

**Current code** (already uses dialogs from Step 3):
```typescript
/** Handle restore action for a row */
function handleRestoreRow(row: TRow) {
  // Open confirmation dialog instead of restoring directly
  rowToRestore = row;
  dialogs.openRestoreDialog();
  closeRowDropdown();
}
```

**No change needed** - this already sets rowToRestore and uses dialogs correctly. The composable's handleRestoreRow only closes dropdown, so we keep the inline version to manage row context.

### Step 4.5: Replace confirmDeleteRow Implementation
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1077-1118

**Current code**:
```typescript
/** Confirm delete action after dialog confirmation */
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
/** Confirm delete action after dialog confirmation */
async function confirmDeleteRow() {
  if (!rowToDelete) return;
  await rowActionsComposable.confirmDeleteRow(rowToDelete);
  dialogs.closeDeleteDialog();
  rowToDelete = null;
}
```

### Step 4.6: Replace confirmRestoreRow Implementation
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1121-1162

**Current code**:
```typescript
/** Confirm restore action after dialog confirmation */
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
/** Confirm restore action after dialog confirmation */
async function confirmRestoreRow() {
  if (!rowToRestore) return;
  await rowActionsComposable.confirmRestoreRow(rowToRestore);
  dialogs.closeRestoreDialog();
  rowToRestore = null;
}
```

### Step 4.7: Remove cancelDeleteRow Function
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1165-1168

**Current code**:
```typescript
/** Cancel delete action */
function cancelDeleteRow() {
  dialogs.closeDeleteDialog();
  rowToDelete = null;
}
```

**Remove the entire function** - template should call `dialogs.closeDeleteDialog()` directly and clear rowToDelete inline.

### Step 4.8: Replace handleDuplicateRow Implementation
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1363-1372

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

**No change needed** - this already sets singleRowToDuplicate and duplicateScope, then uses dialogs. The composable's handleDuplicateRow only closes dropdown, so we keep the inline version to manage row context.

### Step 4.9: Replace confirmDuplicate Implementation
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1374-1418

**Current code**:
```typescript
async function confirmDuplicate() {
  try {
    const uuids = duplicateScope === 'single'
      ? [rowKey(singleRowToDuplicate!)]
      : selectedKeys;
    const response = await apiFetch(`/api/v1/entities/${entity}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuids })
    });
    if (!response.ok) {
      const errorData = await response.json() as RFC7807Error & { duplicateResults?: { successful: string[]; failed: Array<{ uuid: string; error: string }> } };
      // Include duplicateResults as extra field for the error panel
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
    onRefresh();

    dialogs.closeDuplicateDialog();
  } catch (error) {
    console.error('Duplicate failed:', error);
    // Error already handled by pushRFC7807Error above
  } finally {
    dialogs.closeDuplicateDialog();
  }
}
```

**Replace with**:
```typescript
async function confirmDuplicate() {
  if (duplicateScope === 'single' && singleRowToDuplicate) {
    await rowActionsComposable.confirmDuplicateRow(singleRowToDuplicate);
  }
  // Bulk duplicate is handled separately by bulkActions composable
  dialogs.closeDuplicateDialog();
  singleRowToDuplicate = null;
}
```

### Step 4.10: Update Template Delete Dialog Confirm Handler
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4044

**Current template code**:
```svelte
<Button
  class="bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:scale-105 transition-all"
  onclick={confirmDeleteRow}
>
  {$t('common.delete')}
</Button>
```

**No change needed** - the onclick handler already calls confirmDeleteRow, which will be updated in Step 4.5.

**Optional enhancement**: Add loading state similar to restore/duplicate dialogs:
```svelte
<Button
  class="bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:scale-105 transition-all"
  onclick={confirmDeleteRow}
  disabled={rowActionsComposable.isDeleting}
>
  {#if rowActionsComposable.isDeleting}
    {$t('common.deleting')}
  {:else}
    {$t('common.delete')}
  {/if}
</Button>
```

### Step 4.11: Update Template Restore Dialog Confirm Handler
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4069

**Current template code** (already uses composable state):
```svelte
<Button
  class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all"
  onclick={confirmRestoreRow}
  disabled={rowActionsComposable.isRestoring}
>
  {#if rowActionsComposable.isRestoring}
    {$t('common.restoring')}
  {:else}
    {$t('common.restore')}
  {/if}
</Button>
```

**No change needed** - the onclick handler already calls confirmRestoreRow and uses rowActionsComposable.isRestoring for loading state.

### Step 4.12: Update Template Duplicate Dialog Confirm Handler
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4278

**Current template code** (already uses composable state):
```svelte
<Button
  class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all flex-1 sm:flex-none"
  onclick={confirmDuplicate}
  disabled={rowActionsComposable.isDuplicating}
>
  {#if rowActionsComposable.isDuplicating}
    {$t('common.duplicating')}
  {:else}
    {$t('common.duplicate')}
  {/if}
</Button>
```

**No change needed** - the onclick handler already calls confirmDuplicate and uses rowActionsComposable.isDuplicating for loading state.

### Step 4.13: Verify useRowActions Composable Initialization
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1851-1867

**Current initialization**:
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

**No change needed** - initialization is already correct.

### Step 4.14: Verify Compilation
Run `pnpm run check` to ensure no compilation errors.

## Expected Outcome
- handleEditRow and handlePreviewRow replaced with composable calls (simplifies inline logic)
- handleDeleteRow and handleRestoreRow remain inline to manage row context before dialog
- confirmDeleteRow, confirmRestoreRow, and confirmDuplicate replaced with composable calls (removes ~80 lines of API logic)
- cancelDeleteRow removed (template uses dialogs.closeDeleteDialog directly)
- Template onclick handlers updated to use new confirm functions
- No compilation errors
- All row action functionality works correctly

## Notes
- **Row context management**: handleDeleteRow, handleRestoreRow, and handleDuplicateRow remain inline to set row context (rowToDelete, rowToRestore, singleRowToDuplicate) before opening dialogs. The composable versions don't manage dialog state.
- **API logic extraction**: The main benefit is extracting ~80 lines of API call logic (confirmDeleteRow, confirmRestoreRow, confirmDuplicate) into the composable.
- **Composable limitations**: The current useRowActions composable's handleDeleteRow/handleRestoreRow/handleDuplicateRow only close dropdowns - they don't set dialog state or row context. This is why we keep inline wrapper functions.
- **Template integration**: Template dialog confirm buttons need to call the simplified confirm functions which now delegate to the composable.
- **Bulk vs single**: confirmDuplicate handles both single row (via composable) and bulk (via bulkActions composable) based on duplicateScope.
- **Error handling**: The composable handles all RFC7807 error formatting and toast notifications, reducing inline error handling code.
- **MCP Tools**: The Svelte MCP server is available for official documentation and code examples if needed during implementation.
- **Devin Rules**: Follow Svelte 5 mandatory rules - use $state for reactive state, proper TypeScript typing, and avoid createEventDispatcher (use callback props instead).
