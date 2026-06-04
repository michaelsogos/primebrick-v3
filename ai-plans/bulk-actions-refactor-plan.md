# Bulk Actions Refactor Plan

## Overview
Extract bulk delete and bulk restore logic from EntityListTable.svelte into the useBulkActions composable.

## Current State Analysis

### State Variables (Lines 797-802)
```typescript
/** Bulk delete confirmation dialog state */
let bulkDeleteConfirmDialogOpen = $state(false);
let isBulkDeleting = $state(false);

/** Bulk restore confirmation dialog state */
let bulkRestoreConfirmDialogOpen = $state(false);
let isBulkRestoring = $state(false);
```

### Functions (Lines 1186-1334)

#### handleBulkDelete (Lines 1186-1189)
```typescript
function handleBulkDelete() {
  // Open confirmation dialog instead of deleting directly
  bulkDeleteConfirmDialogOpen = true;
}
```

#### confirmBulkDelete (Lines 1192-1254)
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

      const toneForImpact = 'danger'; // HIGH impact uses danger
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
    // The toolbar mode will automatically switch based on the composable's reactive logic
    // Refresh the list after successful deletion
    onRefresh?.();
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
    // Close dialog regardless of success or error
    bulkDeleteConfirmDialogOpen = false;
  }
}
```

#### cancelBulkDelete (Lines 1257-1259)
```typescript
function cancelBulkDelete() {
  bulkDeleteConfirmDialogOpen = false;
}
```

#### handleBulkRestore (Lines 1261-1264)
```typescript
function handleBulkRestore() {
  // Open confirmation dialog instead of restoring directly
  bulkRestoreConfirmDialogOpen = true;
}
```

#### confirmBulkRestore (Lines 1267-1329)
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

      const toneForImpact = 'warning'; // HIGH impact uses warning for restore
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
    // The toolbar mode will automatically switch based on the composable's reactive logic
    // Refresh the list after successful restore
    onRefresh?.();
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
    // Close dialog regardless of success or error
    bulkRestoreConfirmDialogOpen = false;
  }
}
```

#### cancelBulkRestore (Lines 1332-1334)
```typescript
function cancelBulkRestore() {
  bulkRestoreConfirmDialogOpen = false;
}
```

### Template References

#### Bulk Delete Dialog (Line 4161)
```svelte
<DialogBordered bind:open={bulkDeleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

#### Bulk Delete Button (Lines 4179-4183)
```svelte
disabled={isBulkDeleting}
>
  {#if isBulkDeleting}
    {$t('common.deleting')}
  {:else}
```

#### Bulk Restore Dialog (Line 4191)
```svelte
<DialogBordered bind:open={bulkRestoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

#### Bulk Restore Button (Lines 4209-4213)
```svelte
disabled={isBulkRestoring}
>
  {#if isBulkRestoring}
    {$t('common.restoring')}
  {:else}
```

## Composable Status

### useBulkActions.svelte.ts
- ✅ Already created
- ✅ Already initialized in EntityListTable.svelte (around line 1950)
- ✅ Has methods: handleBulkDelete, confirmBulkDelete, cancelBulkDelete, handleBulkRestore, confirmBulkRestore, cancelBulkRestore
- ✅ Has state: isDeleting, isRestoring

### useDialogs.svelte.ts
- ✅ Already created
- ✅ Already initialized in EntityListTable.svelte (around line 1950)
- ✅ Has methods: openDeleteDialog, closeDeleteDialog, openRestoreDialog, closeRestoreDialog
- ✅ Has state: deleteDialogOpen, restoreDialogOpen

## Refactor Plan

### Step 1: Remove Inline State Variables
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 796-802

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "bulkDeleteConfirmDialogOpen" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these 7 lines**:
```
Line 796:   /** Bulk delete confirmation dialog state */
Line 797:   let bulkDeleteConfirmDialogOpen = $state(false);
Line 798:   let isBulkDeleting = $state(false);
Line 799:
Line 800:   /** Bulk restore confirmation dialog state */
Line 801:   let bulkRestoreConfirmDialogOpen = $state(false);
Line 802:   let isBulkRestoring = $state(false);
```

### Step 2: Replace Function Implementations

#### handleBulkDelete
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1186-1189

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "function handleBulkDelete" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1186:   function handleBulkDelete() {
Line 1187:     // Open confirmation dialog instead of deleting directly
Line 1188:     bulkDeleteConfirmDialogOpen = true;
Line 1189:   }
```

**With**:
```
Line 1186:   function handleBulkDelete() {
Line 1187:     dialogs.openDeleteDialog();
Line 1188:   }
```

#### confirmBulkDelete
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1192-1254

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "async function confirmBulkDelete" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace entire function** (63 lines from line 1192 to 1254)

**With**:
```
Line 1192:   async function confirmBulkDelete() {
Line 1193:     await bulkActions.confirmBulkDelete();
Line 1194:     dialogs.closeDeleteDialog();
Line 1195:   }
```

#### cancelBulkDelete
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1257-1259

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "function cancelBulkDelete" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1257:   function cancelBulkDelete() {
Line 1258:     bulkDeleteConfirmDialogOpen = false;
Line 1259:   }
```

**With**:
```
Line 1257:   function cancelBulkDelete() {
Line 1258:     dialogs.closeDeleteDialog();
Line 1259:   }
```

#### handleBulkRestore
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1261-1264

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "function handleBulkRestore" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1261:   function handleBulkRestore() {
Line 1262:     // Open confirmation dialog instead of restoring directly
Line 1263:     bulkRestoreConfirmDialogOpen = true;
Line 1264:   }
```

**With**:
```
Line 1261:   function handleBulkRestore() {
Line 1262:     dialogs.openRestoreDialog();
Line 1263:   }
```

#### confirmBulkRestore
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1267-1329

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "async function confirmBulkRestore" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace entire function** (63 lines from line 1267 to 1329)

**With**:
```
Line 1267:   async function confirmBulkRestore() {
Line 1268:     await bulkActions.confirmBulkRestore();
Line 1269:     dialogs.closeRestoreDialog();
Line 1270:   }
```

#### cancelBulkRestore
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1332-1334

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "function cancelBulkRestore" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1332:   function cancelBulkRestore() {
Line 1333:     bulkRestoreConfirmDialogOpen = false;
Line 1334:   }
```

**With**:
```
Line 1332:   function cancelBulkRestore() {
Line 1333:     dialogs.closeRestoreDialog();
Line 1334:   }
```

### Step 3: Replace Template References

#### Bulk Delete Dialog
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4161

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "bind:open={bulkDeleteConfirmDialogOpen}" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```svelte
<DialogBordered bind:open={bulkDeleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.deleteDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

#### Bulk Delete Button
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4179-4183

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "disabled={isBulkDeleting}" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```svelte
disabled={isBulkDeleting}
>
  {#if isBulkDeleting}
    {$t('common.deleting')}
  {:else}
```

**With**:
```svelte
disabled={bulkActions.isDeleting}
>
  {#if bulkActions.isDeleting}
    {$t('common.deleting')}
  {:else}
```

#### Bulk Restore Dialog
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4191

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "bind:open={bulkRestoreConfirmDialogOpen}" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```svelte
<DialogBordered bind:open={bulkRestoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.restoreDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

#### Bulk Restore Button
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4209-4213

**Empirical verification**: Use grep to find the exact location:
```bash
grep -n "disabled={isBulkRestoring}" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```svelte
disabled={isBulkRestoring}
>
  {#if isBulkRestoring}
    {$t('common.restoring')}
  {:else}
```

**With**:
```svelte
disabled={bulkActions.isRestoring}
>
  {#if bulkActions.isRestoring}
    {$t('common.restoring')}
  {:else}
```

### Step 4: Verify Compilation
Run `pnpm run check` to ensure no compilation errors.

## Expected Outcome
- Bulk delete and bulk restore logic extracted to useBulkActions composable
- Dialog state managed by useDialogs composable
- Reduced code duplication
- Improved maintainability
- No compilation errors
