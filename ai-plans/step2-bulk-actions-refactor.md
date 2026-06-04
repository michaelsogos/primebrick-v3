# Step 2: Bulk Actions Refactor

## Overview
Extract bulk delete and bulk restore logic from EntityListTable.svelte into the useBulkActions composable.

## Prerequisites
- ✅ Step 1 completed: Composables imported and initialized
- ✅ useBulkActions composable initialized as `bulkActions`
- ✅ useDialogs composable initialized as `dialogs`

## Important Notes
- **No overlap with other plans**: This step only refactors bulk delete/restore functions and template references. It does NOT remove the inline state variables (bulkDeleteConfirmDialogOpen, isBulkDeleting, bulkRestoreConfirmDialogOpen, isBulkRestoring) - those will be removed in Step 3 (Dialog State Refactor) to avoid overlap.
- **Dialog state management**: The useDialogs composable will handle dialog open/close state, but the inline state variables will remain until Step 3 to ensure a clean separation of concerns.

## Current State
- Bulk delete/restore state variables are inline (bulkDeleteConfirmDialogOpen, isBulkDeleting, bulkRestoreConfirmDialogOpen, isBulkRestoring) - these will remain until Step 3
- Bulk delete/restore functions are inline (handleBulkDelete, confirmBulkDelete, cancelBulkDelete, handleBulkRestore, confirmBulkRestore, cancelBulkRestore)
- Template references use inline state variables

## Target State
- Bulk delete/restore state variables remain inline (will be removed in Step 3)
- Bulk delete/restore functions replaced with composable calls
- Template references use composable state (bulkActions.isDeleting, dialogs.deleteDialogOpen, etc.)

## Actions

### Step 2.1: Replace handleBulkDelete Function
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1190-1193

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "function handleBulkDelete" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1190:   function handleBulkDelete() {
Line 1191:     // Open confirmation dialog instead of deleting directly
Line 1192:     bulkDeleteConfirmDialogOpen = true;
Line 1193:   }
```

**With**:
```
Line 1190:   function handleBulkDelete() {
Line 1191:     dialogs.openDeleteDialog();
Line 1192:   }
```

### Step 2.2: Replace confirmBulkDelete Function
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1196-1258

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "async function confirmBulkDelete" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace entire function** (63 lines from line 1196 to 1258)

**With**:
```
Line 1196:   async function confirmBulkDelete() {
Line 1197:     await bulkActions.confirmBulkDelete();
Line 1198:     dialogs.closeDeleteDialog();
Line 1199:   }
```

### Step 2.3: Replace cancelBulkDelete Function
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1261-1263

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "function cancelBulkDelete" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1261:   function cancelBulkDelete() {
Line 1262:     bulkDeleteConfirmDialogOpen = false;
Line 1263:   }
```

**With**:
```
Line 1261:   function cancelBulkDelete() {
Line 1262:     dialogs.closeDeleteDialog();
Line 1263:   }
```

### Step 2.4: Replace handleBulkRestore Function
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1265-1268

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "function handleBulkRestore" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1265:   function handleBulkRestore() {
Line 1266:     // Open confirmation dialog instead of restoring directly
Line 1267:     bulkRestoreConfirmDialogOpen = true;
Line 1268:   }
```

**With**:
```
Line 1265:   function handleBulkRestore() {
Line 1266:     dialogs.openRestoreDialog();
Line 1267:   }
```

### Step 2.5: Replace confirmBulkRestore Function
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1271-1333

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "async function confirmBulkRestore" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace entire function** (63 lines from line 1271 to 1333)

**With**:
```
Line 1271:   async function confirmBulkRestore() {
Line 1272:     await bulkActions.confirmBulkRestore();
Line 1273:     dialogs.closeRestoreDialog();
Line 1274:   }
```

### Step 2.6: Replace cancelBulkRestore Function
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 1336-1338

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "function cancelBulkRestore" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```
Line 1336:   function cancelBulkRestore() {
Line 1337:     bulkRestoreConfirmDialogOpen = false;
Line 1338:   }
```

**With**:
```
Line 1336:   function cancelBulkRestore() {
Line 1337:     dialogs.closeRestoreDialog();
Line 1338:   }
```

### Step 2.7: Replace Bulk Delete Dialog Template Reference
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4105

**Empirical verification**: Use grep to find the exact location
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

### Step 2.8: Replace Bulk Delete Button Template Reference
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4123-4125

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "disabled={isBulkDeleting}" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```svelte
Line 4243:      disabled={isBulkDeleting}
Line 4244:    >
Line 4245:      {#if isBulkDeleting}
```

**With**:
```svelte
Line 4243:      disabled={bulkActions.isDeleting}
Line 4244:    >
Line 4245:      {#if bulkActions.isDeleting}
```

### Step 2.9: Replace Bulk Restore Dialog Template Reference
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4135

**Empirical verification**: Use grep to find the exact location
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

### Step 2.10: Replace Bulk Restore Button Template Reference
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4153-4155

**Empirical verification**: Use grep to find the exact location
```bash
grep -n "disabled={isBulkRestoring}" primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace**:
```svelte
Line 4273:      disabled={isBulkRestoring}
Line 4274:    >
Line 4275:      {#if isBulkRestoring}
```

**With**:
```svelte
Line 4273:      disabled={bulkActions.isRestoring}
Line 4274:    >
Line 4275:      {#if bulkActions.isRestoring}
```

### Step 2.11: Verify Compilation
Run `pnpm run check` to ensure no compilation errors.

## Expected Outcome
- Bulk delete/restore functions replaced with composable calls
- Template references use composable state
- No compilation errors
- Bulk delete/restore functionality works correctly
- Inline state variables remain (will be removed in Step 3)

## Notes
- This step removes ~120 lines of inline code (functions only)
- All bulk delete/restore logic is now in useBulkActions composable
- Dialog state is managed by useDialogs composable
- Inline state variables (bulkDeleteConfirmDialogOpen, isBulkDeleting, bulkRestoreConfirmDialogOpen, isBulkRestoring) will be removed in Step 3 to avoid overlap with dialog state refactor
