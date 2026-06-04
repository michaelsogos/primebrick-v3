# Step 3: Dialog State Refactor

## Overview
Extract dialog state management from EntityListTable.svelte into the useDialogs composable.

## Prerequisites
- ✅ Step 1 completed: Composables imported and initialized
- ✅ Step 2 completed: Bulk actions refactored
- ✅ useDialogs composable initialized as `dialogs`
- ✅ useDialogs composable already has duplicate dialog support

## Current State
- Dialog state variables are inline (deleteConfirmDialogOpen, restoreConfirmDialogOpen, duplicateConfirmDialogOpen, rowToDelete, rowToRestore, isDeleting, isRestoring, isDuplicating)
- Bulk dialog state variables are inline but unused (bulkDeleteConfirmDialogOpen, isBulkDeleting, bulkRestoreConfirmDialogOpen, isBulkRestoring) - these are dead code from Step 2
- Duplicate-related state variables are inline (duplicateScope, singleRowToDuplicate)
- Template references use inline state variables
- useDialogs composable already handles all dialogs (delete, restore, duplicate) - no changes needed

## Target State
- All dialog state variables removed (deleteConfirmDialogOpen, restoreConfirmDialogOpen, duplicateConfirmDialogOpen, bulkDeleteConfirmDialogOpen, bulkRestoreConfirmDialogOpen)
- Row tracking variables removed (rowToDelete, rowToRestore, singleRowToDuplicate)
- Loading state variables removed (isDeleting, isRestoring, isDuplicating, isBulkDeleting, isBulkRestoring)
- Duplicate scope variable removed (duplicateScope)
- Template references use composable state (dialogs.deleteDialogOpen, dialogs.restoreDialogOpen, dialogs.duplicateDialogOpen)
- Template onclick handlers use composable methods (dialogs.closeDeleteDialog(), etc.)
- Row tracking will be added in Step 4 when functions are refactored

## Line Number Reference Summary

**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`

### State Variables to Remove (Lines 791-832)

**Lines 791-793** - Delete dialog state:
```typescript
/** Delete confirmation dialog state */
let deleteConfirmDialogOpen = $state(false);
let rowToDelete: TRow | null = null;
let isDeleting = $state(false);
```

**Lines 796-798** - Restore dialog state:
```typescript
/** Restore confirmation dialog state */
let restoreConfirmDialogOpen = $state(false);
let rowToRestore: TRow | null = null;
let isRestoring = $state(false);
```

**Lines 801-802** - Bulk delete dialog state (dead code from Step 2):
```typescript
/** Bulk delete confirmation dialog state */
let bulkDeleteConfirmDialogOpen = $state(false);
let isBulkDeleting = $state(false);
```

**Lines 805-806** - Bulk restore dialog state (dead code from Step 2):
```typescript
/** Bulk restore confirmation dialog state */
let bulkRestoreConfirmDialogOpen = $state(false);
let isBulkRestoring = $state(false);
```

**Lines 829-832** - Duplicate dialog state:
```typescript
/** Duplicate confirmation dialog state */
let duplicateConfirmDialogOpen = $state(false);
let isDuplicating = $state(false);
let duplicateScope = $state<'selected' | 'single'>('selected');
let singleRowToDuplicate: TRow | null = null;
```

### Template References to Replace (Lines 4048-4305)

**Line 4048** - Delete dialog bind:open:
```svelte
<DialogBordered bind:open={deleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

**Lines 4057-4060** - Delete dialog cancel button onclick:
```svelte
onclick={() => {
  deleteConfirmDialogOpen = false;
  rowToDelete = null;
}}
```

**Line 4074** - Restore dialog bind:open:
```svelte
<DialogBordered bind:open={restoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

**Lines 4083-4086** - Restore dialog cancel button onclick:
```svelte
onclick={() => {
  restoreConfirmDialogOpen = false;
  rowToRestore = null;
}}
```

**Lines 4093-4096** - Restore dialog loading state:
```svelte
disabled={isRestoring}
>
  {#if isRestoring}
    {$t('common.restoring')}
```

**Line 4280** - Duplicate dialog bind:open:
```svelte
<DialogBordered bind:open={duplicateConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

**Lines 4302-4305** - Duplicate dialog loading state:
```svelte
disabled={isDuplicating}
>
  {#if isDuplicating}
    {$t('common.duplicating')}
```

### State Variables to Add (After Line 798)

**After line 798** - Add row tracking variables:
```typescript
/** Row tracking for dialog actions */
let rowToDelete: TRow | null = $state(null);
let rowToRestore: TRow | null = $state(null);
let singleRowToDuplicate: TRow | null = $state(null);
```

## Actions

### Step 3.1: Remove Delete Dialog State Variables
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 791-793

**Remove**:
```typescript
/** Delete confirmation dialog state */
let deleteConfirmDialogOpen = $state(false);
let rowToDelete: TRow | null = null;
let isDeleting = $state(false);
```

### Step 3.2: Remove Restore Dialog State Variables
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 796-798

**Remove**:
```typescript
/** Restore confirmation dialog state */
let restoreConfirmDialogOpen = $state(false);
let rowToRestore: TRow | null = null;
let isRestoring = $state(false);
```

### Step 3.3: Remove Bulk Delete Dialog State Variables
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 801-802

**Remove** (dead code from Step 2):
```typescript
/** Bulk delete confirmation dialog state */
let bulkDeleteConfirmDialogOpen = $state(false);
let isBulkDeleting = $state(false);
```

### Step 3.4: Remove Bulk Restore Dialog State Variables
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 805-806

**Remove** (dead code from Step 2):
```typescript
/** Bulk restore confirmation dialog state */
let bulkRestoreConfirmDialogOpen = $state(false);
let isBulkRestoring = $state(false);
```

### Step 3.5: Remove Duplicate Dialog State Variables
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 829-832

**Remove**:
```typescript
/** Duplicate confirmation dialog state */
let duplicateConfirmDialogOpen = $state(false);
let isDuplicating = $state(false);
let duplicateScope = $state<'selected' | 'single'>('selected');
let singleRowToDuplicate: TRow | null = null;
```

### Step 3.6: Replace Delete Dialog Template Reference
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4048

**Replace**:
```svelte
<DialogBordered bind:open={deleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.deleteDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

### Step 3.7: Replace Delete Dialog Cancel Button Handler
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4057-4060

**Replace**:
```svelte
onclick={() => {
  deleteConfirmDialogOpen = false;
  rowToDelete = null;
}}
```

**With**:
```svelte
onclick={() => {
  dialogs.closeDeleteDialog();
}}
```

### Step 3.8: Replace Restore Dialog Template Reference
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4074

**Replace**:
```svelte
<DialogBordered bind:open={restoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.restoreDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

### Step 3.9: Replace Restore Dialog Cancel Button Handler
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4083-4086

**Replace**:
```svelte
onclick={() => {
  restoreConfirmDialogOpen = false;
  rowToRestore = null;
}}
```

**With**:
```svelte
onclick={() => {
  dialogs.closeRestoreDialog();
}}
```

### Step 3.10: Replace Restore Dialog Loading State
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4093-4096

**Replace**:
```svelte
disabled={isRestoring}
>
  {#if isRestoring}
    {$t('common.restoring')}
```

**With**:
```svelte
disabled={rowActionsComposable.isRestoring}
>
  {#if rowActionsComposable.isRestoring}
    {$t('common.restoring')}
```

### Step 3.11: Replace Duplicate Dialog Template Reference
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 4280

**Replace**:
```svelte
<DialogBordered bind:open={duplicateConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.duplicateDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

### Step 3.12: Replace Duplicate Dialog Loading State
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Lines 4302-4305

**Replace**:
```svelte
disabled={isDuplicating}
>
  {#if isDuplicating}
    {$t('common.duplicating')}
```

**With**:
```svelte
disabled={rowActionsComposable.isDuplicating}
>
  {#if rowActionsComposable.isDuplicating}
    {$t('common.duplicating')}
```

### Step 3.13: Add Row Tracking State Variables
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: After line 798 (after removing the above state variables)

**Add** (needed for Step 4 when functions are refactored):
```typescript
/** Row tracking for dialog actions */
let rowToDelete: TRow | null = $state(null);
let rowToRestore: TRow | null = $state(null);
let singleRowToDuplicate: TRow | null = $state(null);
```

### Step 3.14: Verify Compilation
Run `pnpm run check` to ensure no compilation errors.

## Expected Outcome
- All dialog state variables removed (delete, restore, duplicate, bulk delete, bulk restore)
- All loading state variables removed (isDeleting, isRestoring, isDuplicating, isBulkDeleting, isBulkRestoring)
- Duplicate scope variable removed (duplicateScope)
- Row tracking variables added (rowToDelete, rowToRestore, singleRowToDuplicate) for Step 4
- Template references use composable state (dialogs.deleteDialogOpen, dialogs.restoreDialogOpen, dialogs.duplicateDialogOpen)
- Template onclick handlers use composable methods (dialogs.closeDeleteDialog(), etc.)
- Template loading states use composable state (rowActionsComposable.isRestoring, etc.)
- No compilation errors
- All dialog functionality works correctly

## Notes
- This step removes ~18 lines of inline state variables (including dead code from Step 2)
- All dialog open/close state is now in useDialogs composable (already has duplicate support)
- Loading states are now in useRowActions composable (rowActionsComposable.isDeleting, etc.)
- Row tracking variables are added back as $state for Step 4 to use
- Row-level action functions (handleDeleteRow, confirmDeleteRow, etc.) will be refactored in Step 4
- The duplicate dialog uses rowActionsComposable for loading state (isDuplicating)
- The restore dialog uses rowActionsComposable for loading state (isRestoring)
