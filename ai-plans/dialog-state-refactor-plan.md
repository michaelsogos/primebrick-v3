# Dialog State Refactor Plan

## Overview
Extract dialog state management from EntityListTable.svelte into the useDialogs composable.

## Current State Analysis

### State Variables (Lines 787-823)

#### Delete Dialog State (Lines 787-789)
```typescript
/** Delete confirmation dialog state */
let deleteConfirmDialogOpen = $state(false);
let rowToDelete: TRow | null = null;
let isDeleting = $state(false);
```

#### Restore Dialog State (Lines 792-794)
```typescript
/** Restore confirmation dialog state */
let restoreConfirmDialogOpen = $state(false);
let rowToRestore: TRow | null = null;
let isRestoring = $state(false);
```

#### Bulk Delete Dialog State (Lines 797-798)
```typescript
/** Bulk delete confirmation dialog state */
let bulkDeleteConfirmDialogOpen = $state(false);
let isBulkDeleting = $state(false);
```

#### Bulk Restore Dialog State (Lines 801-802)
```typescript
/** Bulk restore confirmation dialog state */
let bulkRestoreConfirmDialogOpen = $state(false);
let isBulkRestoring = $state(false);
```

#### Duplicate Dialog State (Lines 824-825)
```typescript
/** Duplicate confirmation dialog state */
let duplicateConfirmDialogOpen = $state(false);
let isDuplicating = $state(false);
```

### Template References

#### Delete Dialog (Line 4104)
```svelte
<DialogBordered bind:open={deleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

#### Restore Dialog (Line 4130)
```svelte
<DialogBordered bind:open={restoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

#### Bulk Delete Dialog (Line 4161)
```svelte
<DialogBordered bind:open={bulkDeleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

#### Bulk Restore Dialog (Line 4191)
```svelte
<DialogBordered bind:open={bulkRestoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

#### Duplicate Dialog (Line 4224)
```svelte
<DialogBordered bind:open={duplicateConfirmDialogOpen} color="primary" class="sm:max-w-md" showCloseButton={false}>
```

## Composable Status

### useDialogs.svelte.ts
- ✅ Already created
- ✅ Already initialized in EntityListTable.svelte (around line 1950)
- ✅ Has methods: openDeleteDialog, closeDeleteDialog, openRestoreDialog, closeRestoreDialog
- ✅ Has state: deleteDialogOpen, restoreDialogOpen

### Note
The useDialogs composable currently only handles delete and restore dialogs. It does not handle bulk delete, bulk restore, or duplicate dialogs. These are managed by the useBulkActions composable for bulk actions and would need to be added to useDialogs or kept inline.

## Refactor Plan

### Step 1: Remove Delete Dialog State Variables
**Location**: Lines 787-789

**Remove**:
```typescript
/** Delete confirmation dialog state */
let deleteConfirmDialogOpen = $state(false);
let rowToDelete: TRow | null = null;
let isDeleting = $state(false);
```

### Step 2: Remove Restore Dialog State Variables
**Location**: Lines 792-794

**Remove**:
```typescript
/** Restore confirmation dialog state */
let restoreConfirmDialogOpen = $state(false);
let rowToRestore: TRow | null = null;
let isRestoring = $state(false);
```

### Step 3: Remove Bulk Delete Dialog State Variables
**Location**: Lines 797-798

**Remove**:
```typescript
/** Bulk delete confirmation dialog state */
let bulkDeleteConfirmDialogOpen = $state(false);
let isBulkDeleting = $state(false);
```

### Step 4: Remove Bulk Restore Dialog State Variables
**Location**: Lines 801-802

**Remove**:
```typescript
/** Bulk restore confirmation dialog state */
let bulkRestoreConfirmDialogOpen = $state(false);
let isBulkRestoring = $state(false);
```

### Step 5: Remove Duplicate Dialog State Variables
**Location**: Lines 824-825

**Remove**:
```typescript
/** Duplicate confirmation dialog state */
let duplicateConfirmDialogOpen = $state(false);
let isDuplicating = $state(false);
```

### Step 6: Replace Delete Dialog Template Reference
**Location**: Line 4104

**Replace**:
```svelte
<DialogBordered bind:open={deleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.deleteDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

### Step 7: Replace Restore Dialog Template Reference
**Location**: Line 4130

**Replace**:
```svelte
<DialogBordered bind:open={restoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.restoreDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

### Step 8: Replace Bulk Delete Dialog Template Reference
**Location**: Line 4161

**Replace**:
```svelte
<DialogBordered bind:open={bulkDeleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.deleteDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
```

### Step 9: Replace Bulk Restore Dialog Template Reference
**Location**: Line 4191

**Replace**:
```svelte
<DialogBordered bind:open={bulkRestoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.restoreDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
```

### Step 10: Replace Duplicate Dialog Template Reference
**Location**: Line 4224

**Replace**:
```svelte
<DialogBordered bind:open={duplicateConfirmDialogOpen} color="primary" class="sm:max-w-md" showCloseButton={false}>
```

**With**:
```svelte
<DialogBordered bind:open={dialogs.duplicateDialogOpen} color="primary" class="sm:max-w-md" showCloseButton={false}>
```

### Step 11: Update useDialogs Composable
**Location**: d:/git/primebrick-fe-v3/src/lib/components/entity-list-table/composables/useDialogs.svelte.ts

Add duplicate dialog support to the composable:

**Add to DialogReturn interface**:
```typescript
duplicateDialogOpen: boolean;
openDuplicateDialog: () => void;
closeDuplicateDialog: () => void;
```

**Add to composable function**:
```typescript
let duplicateDialogOpen = $state(false);

function openDuplicateDialog() {
  duplicateDialogOpen = true;
}

function closeDuplicateDialog() {
  duplicateDialogOpen = false;
}
```

**Add to return object**:
```typescript
return {
  get deleteDialogOpen() { return deleteDialogOpen; },
  openDeleteDialog,
  closeDeleteDialog,
  get restoreDialogOpen() { return restoreDialogOpen; },
  openRestoreDialog,
  closeRestoreDialog,
  get duplicateDialogOpen() { return duplicateDialogOpen; },
  openDuplicateDialog,
  closeDuplicateDialog
};
```

### Step 12: Verify Compilation
Run `pnpm run check` to ensure no compilation errors.

## Expected Outcome
- Dialog state management extracted to useDialogs composable
- Reduced code duplication
- Improved maintainability
- No compilation errors
- All dialog state (delete, restore, bulk delete, bulk restore, duplicate) managed by composables
