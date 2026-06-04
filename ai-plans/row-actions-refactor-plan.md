# Row Actions Refactor Plan

## Overview
Extract row-level action logic (edit, delete, restore, duplicate) from EntityListTable.svelte into the useRowActions composable.

## Current State Analysis

### Functions (Lines 938-1183)

#### handleEditRow (Lines 938-947)
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

#### handlePreviewRow (Lines 950-960)
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

#### handleDeleteRow (Lines 1075-1080)
```typescript
function handleDeleteRow(row: TRow) {
  // Open confirmation dialog instead of deleting directly
  rowToDelete = row;
  deleteConfirmDialogOpen = true;
  closeRowDropdown();
}
```

#### handleRestoreRow (Lines 1083-1088)
```typescript
function handleRestoreRow(row: TRow) {
  // Open confirmation dialog instead of restoring directly
  rowToRestore = row;
  restoreConfirmDialogOpen = true;
  closeRowDropdown();
}
```

#### confirmDeleteRow (Lines 1091-1132)
```typescript
async function confirmDeleteRow() {
  if (!rowToDelete) return;
  try {
    const uuidValue = rowToDelete[uid] as string;
    await apiFetch(`/api/v1/entities/${entity}/${uuidValue}`, {
      method: 'DELETE'
    });
    deleteConfirmDialogOpen = false;
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
    isDeleting = false;
  }
}
```

#### confirmRestoreRow (Lines 1135-1183)
```typescript
async function confirmRestoreRow() {
  if (!rowToRestore) return;
  try {
    isRestoring = true;
    const uuidValue = rowToRestore[uid] as string;
    await apiFetch(`/api/v1/entities/${entity}/${uuidValue}/restore`, {
      method: 'POST'
    });
    restoreConfirmDialogOpen = false;
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
    isRestoring = false;
  }
}
```

### Template References

#### Edit Action (Lines 2372, 3284, 3410, 3857)
```svelte
onclick={() => { if (rowDeleted) return; handleEditRow(row); }}
```

#### Delete Action (Lines 2414, 3333, 3459, 3906)
```svelte
onclick={() => handleDeleteRow(row)}
```

## Composable Status

### useRowActions.svelte.ts
- ✅ Already created
- ✅ Already initialized in EntityListTable.svelte (around line 1950)
- ✅ Has methods: handleEdit, handleDelete, handleRestore, handleDuplicate
- ✅ Has state: isDeleting, isRestoring, isDuplicating

### Note
The useRowActions composable has been initialized but the functions in EntityListTable.svelte are still using the inline implementations. The composable handles the API calls and error handling, so we can replace the inline functions with simple composable calls.

## Refactor Plan

### Step 1: Replace handleEditRow Implementation
**Location**: Line 938

**Replace**:
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

**With**:
```typescript
function handleEditRow(row: TRow) {
  rowActionsComposable.handleEdit(row);
}
```

### Step 2: Replace handlePreviewRow Implementation
**Location**: Line 950

**Replace**:
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

**With**:
```typescript
function handlePreviewRow(row: TRow) {
  rowActionsComposable.handlePreview(row);
}
```

### Step 3: Replace handleDeleteRow Implementation
**Location**: Line 1075

**Replace**:
```typescript
function handleDeleteRow(row: TRow) {
  // Open confirmation dialog instead of deleting directly
  rowToDelete = row;
  deleteConfirmDialogOpen = true;
  closeRowDropdown();
}
```

**With**:
```typescript
function handleDeleteRow(row: TRow) {
  rowActionsComposable.handleDelete(row);
}
```

### Step 4: Replace handleRestoreRow Implementation
**Location**: Line 1083

**Replace**:
```typescript
function handleRestoreRow(row: TRow) {
  // Open confirmation dialog instead of restoring directly
  rowToRestore = row;
  restoreConfirmDialogOpen = true;
  closeRowDropdown();
}
```

**With**:
```typescript
function handleRestoreRow(row: TRow) {
  rowActionsComposable.handleRestore(row);
}
```

### Step 5: Remove confirmDeleteRow Function
**Location**: Lines 1091-1132

**Remove** the entire function - this logic is now handled by the composable.

### Step 6: Remove confirmRestoreRow Function
**Location**: Lines 1135-1183

**Remove** the entire function - this logic is now handled by the composable.

### Step 7: Update useRowActions Composable Initialization
**Location**: Around line 1950

The composable is already initialized, but we need to ensure the onPreviewRow callback is properly configured. The current initialization should be:

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

This is already correct, so no changes needed.

### Step 8: Verify Compilation
Run `pnpm run check` to ensure no compilation errors.

## Expected Outcome
- Row-level action logic extracted to useRowActions composable
- Reduced code duplication
- Improved maintainability
- No compilation errors
- All row actions (edit, delete, restore, duplicate) use the composable
