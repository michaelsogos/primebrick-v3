# EntityListTable.svelte Refactoring - Phase 2: Extract Action Handlers

## Analysis Summary

**Date:** 2025-06-05  
**Component:** `EntityListTable.svelte` (3477 lines)  
**Composables Analyzed:**
- `useRowActions.svelte.ts` (234 lines) - Already has core logic
- `useBulkActions.svelte.ts` (277 lines) - Already has core logic
- `useDialogs.svelte.ts` (83 lines) - Manages dialog open/close state
- `usePreviewPanel.svelte.ts` (104 lines) - Manages preview panel state
- `useExport.svelte.ts` (463 lines) - Manages export functionality

**Current State:**
- Core action logic is already in composables (API calls, error handling)
- Main component has **wrapper functions** that manage dialog state and call composable methods
- Dialog state variables (`rowToDelete`, `rowToRestore`, `singleRowToDuplicate`, `duplicateScope`) are in main component
- Total wrapper functions to move: ~120 lines

**Refactoring Strategy:**
- Move wrapper functions from main component to their respective composables
- Move dialog state variables to composables
- Update composables to accept dialog management as dependency
- Share `duplicateScope` state between row and bulk actions

**Updated Plan:** This plan now includes specific line numbers, code examples, and detailed refactoring steps based on actual code analysis.

## Overview

This phase focuses on extracting action handler wrappers from the main `EntityListTable.svelte` component into existing composables. The core logic is already in composables, but the main component still has wrapper functions that manage dialog state. These wrappers should be moved to the composables to reduce component size.

**Target Lines:** ~120 lines  
**Risk Level:** Low  
**Estimated Time:** 1-2 hours

---

## Tasks

### 2.1 Row Action Handlers
**Status:** ✅ PARTIALLY EXISTS as `composables/useRowActions.svelte.ts`

**Action:** Move row action handler wrappers from main component to existing `composables/useRowActions.svelte.ts`

**Target:** Lines 857-970 (~113 lines)

**Existing File:** `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts`

**Current State in EntityListTable.svelte:**

```typescript
// Lines 627-630: Dialog state variables
let rowToDelete: TRow | null = $state(null);
let rowToRestore: TRow | null = $state(null);
let singleRowToDuplicate: TRow | null = $state(null);
let duplicateScope = $state<'selected' | 'single'>('selected');

// Lines 857-863: handleDeleteRow wrapper
function handleDeleteRow(row: TRow) {
  // Open confirmation dialog instead of deleting directly
  rowToDelete = row;
  dialogs.openDeleteDialog();
  closeRowDropdown();
}

// Lines 865-871: handleRestoreRow wrapper
function handleRestoreRow(row: TRow) {
  // Open confirmation dialog instead of restoring directly
  rowToRestore = row;
  dialogs.openRestoreDialog();
  closeRowDropdown();
}

// Lines 873-879: confirmDeleteRow wrapper
async function confirmDeleteRow() {
  if (!rowToDelete) return;
  await rowActionsComposable.confirmDeleteRow(rowToDelete);
  dialogs.closeDeleteDialog();
  rowToDelete = null;
}

// Lines 881-887: confirmRestoreRow wrapper
async function confirmRestoreRow() {
  if (!rowToRestore) return;
  await rowActionsComposable.confirmRestoreRow(rowToRestore);
  dialogs.closeRestoreDialog();
  rowToRestore = null;
}

// Lines 946-955: handleDuplicateRow wrapper
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

// Lines 957-964: confirmDuplicate wrapper
async function confirmDuplicate() {
  if (duplicateScope === 'single' && singleRowToDuplicate) {
    await rowActionsComposable.confirmDuplicateRow(singleRowToDuplicate);
  }
  // Bulk duplicate is handled separately by bulkActions composable
  dialogs.closeDuplicateDialog();
  singleRowToDuplicate = null;
}

// Lines 966-969: cancelDuplicate wrapper
function cancelDuplicate() {
  dialogs.closeDuplicateDialog();
  singleRowToDuplicate = null;
}

// Lines 733-736: handleEditRow wrapper
function handleEditRow(row: TRow) {
  rowActionsComposable.handleEditRow(row);
}

// Lines 738-742: handlePreviewRow wrapper
function handlePreviewRow(row: TRow) {
  previewPanel.openPreview(row);
  closeRowDropdown();
}

// Lines 695-702: loadVersionHistory function
async function loadVersionHistory(row: TRow) {
  const rowUuid = String((row as Record<string, unknown>)[uid]);
  openSheet('entity.versionHistory', {
    entity,
    rowUuid,
    columns: columns
  });
}
```

**Refactored useRowActions.svelte.ts should include:**

```typescript
export interface RowActionsOptions<TRow extends Record<string, unknown>> {
  entity: () => string;
  uid: () => string;
  columns: () => MetaColumn[];
  onEditAction?: (row: TRow) => void;
  onRowActionComplete?: () => void;
  onRowActionError?: (error: Error) => void;
  onRefresh?: () => void;
  isRowDeleted?: (row: TRow) => boolean;
  rowKey?: (row: TRow) => string;
  onPreviewRow?: (row: TRow) => void;
  closeRowDropdown?: () => void;
  t?: (key: string, params?: Record<string, any>) => string;
  dialogs?: {
    openDeleteDialog: () => void;
    closeDeleteDialog: () => void;
    openRestoreDialog: () => void;
    closeRestoreDialog: () => void;
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
  };
}

export interface RowActionsReturn<TRow extends Record<string, unknown>> {
  // Existing returns...
  rowToDelete: TRow | null;
  rowToRestore: TRow | null;
  singleRowToDuplicate: TRow | null;
  duplicateScope: 'selected' | 'single';
  handleDeleteRow: (row: TRow) => void;
  handleRestoreRow: (row: TRow) => void;
  confirmDeleteRow: () => Promise<void>;
  confirmRestoreRow: () => Promise<void>;
  handleDuplicateRow: (row: TRow) => void;
  confirmDuplicate: () => Promise<void>;
  cancelDuplicate: () => void;
  loadVersionHistory: (row: TRow) => Promise<void>;
}

// Add state to composable
let rowToDelete = $state<TRow | null>(null);
let rowToRestore = $state<TRow | null>(null);
let singleRowToDuplicate = $state<TRow | null>(null);
let duplicateScope = $state<'selected' | 'single'>('selected');

// Add wrapper functions
function handleDeleteRow(row: TRow) {
  rowToDelete = row;
  dialogs?.openDeleteDialog();
  closeRowDropdown?.();
}

function handleRestoreRow(row: TRow) {
  rowToRestore = row;
  dialogs?.openRestoreDialog();
  closeRowDropdown?.();
}

async function confirmDeleteRow() {
  if (!rowToDelete) return;
  await confirmDeleteRowImpl(rowToDelete); // Call existing implementation
  dialogs?.closeDeleteDialog();
  rowToDelete = null;
}

async function confirmRestoreRow() {
  if (!rowToRestore) return;
  await confirmRestoreRowImpl(rowToRestore); // Call existing implementation
  dialogs?.closeRestoreDialog();
  rowToRestore = null;
}

function handleDuplicateRow(row: TRow) {
  if (isRowDeleted?.(row)) {
    console.log('Cannot duplicate deleted row:', rowKey?.(row));
    return;
  }
  singleRowToDuplicate = row;
  duplicateScope = 'single';
  dialogs?.openDuplicateDialog();
  closeRowDropdown?.();
}

async function confirmDuplicate() {
  if (duplicateScope === 'single' && singleRowToDuplicate) {
    await confirmDuplicateRowImpl(singleRowToDuplicate); // Call existing implementation
  }
  dialogs?.closeDuplicateDialog();
  singleRowToDuplicate = null;
}

function cancelDuplicate() {
  dialogs?.closeDuplicateDialog();
  singleRowToDuplicate = null;
}

async function loadVersionHistory(row: TRow) {
  const entity = entityFn();
  const uid = uidFn();
  const columns = columnsFn();
  const rowUuid = String((row as Record<string, unknown>)[uid]);
  // Import openSheet dynamically or pass as callback
  const { openSheet } = await import('$lib/shell/sheets/sheet-manager.svelte');
  openSheet('entity.versionHistory', {
    entity,
    rowUuid,
    columns
  });
}
```

**Dependencies to add to useRowActions:**
- `dialogs` composable (openDeleteDialog, closeDeleteDialog, etc.)
- `columns` parameter
- `openSheet` function (import dynamically or pass as callback)

**Steps:**
1. Read `EntityListTable.svelte` lines 627-630, 695-702, 733-742, 857-970
2. Read existing `composables/useRowActions.svelte.ts`
3. Add dialog state variables to useRowActions composable
4. Add wrapper functions to useRowActions composable
5. Update RowActionsOptions interface to include dialogs and columns
6. Update RowActionsReturn interface to include new state and functions
7. Rename existing confirm functions to confirmDeleteRowImpl, confirmRestoreRowImpl, confirmDuplicateRowImpl
8. Add loadVersionHistory function
9. Update EntityListTable.svelte to pass dialogs and columns to useRowActions
10. Remove wrapper functions from EntityListTable.svelte (lines 857-970, 733-742, 695-702)
11. Remove dialog state variables from EntityListTable.svelte (lines 627-630)
12. Update dialog components to use composable state
13. Test all row actions (delete, restore, duplicate, edit, preview, version history)

---

### 2.2 Bulk Action Handlers
**Status:** ✅ PARTIALLY EXISTS as `composables/useBulkActions.svelte.ts`

**Action:** Move bulk action handler wrappers from main component to existing `composables/useBulkActions.svelte.ts`

**Target:** Lines 889-1005 (~116 lines)

**Existing File:** `src/lib/components/entity-list-table/composables/useBulkActions.svelte.ts`

**Current State in EntityListTable.svelte:**

```typescript
// Lines 889-892: handleBulkDelete wrapper
function handleBulkDelete() {
  dialogs.openBulkDeleteDialog();
}

// Lines 894-898: confirmBulkDelete wrapper
async function confirmBulkDelete() {
  await bulkActions.confirmBulkDelete();
  dialogs.closeBulkDeleteDialog();
}

// Lines 900-903: cancelBulkDelete wrapper
function cancelBulkDelete() {
  dialogs.closeBulkDeleteDialog();
}

// Lines 905-907: handleBulkRestore wrapper
function handleBulkRestore() {
  dialogs.openBulkRestoreDialog();
}

// Lines 909-913: confirmBulkRestore wrapper
async function confirmBulkRestore() {
  await bulkActions.confirmBulkRestore();
  dialogs.closeBulkRestoreDialog();
}

// Lines 915-918: cancelBulkRestore wrapper
function cancelBulkRestore() {
  dialogs.closeBulkRestoreDialog();
}

// Lines 932-944: handleBulkDuplicate wrapper
function handleBulkDuplicate() {
  if (selectedKeys.length > 50) {
    pushImpactError({
      impact: 'MEDIUM',
      messageKey: 'entities.list.duplicateMaxLimit',
      scope: $t('errors.scope.duplicateAction'),
      toast: true
    });
    return;
  }
  duplicateScope = 'selected';
  dialogs.openDuplicateDialog();
}

// Lines 920-925: confirmExportRow wrapper
async function confirmExportRow() {
  if (!exportComposable.fileType) return;
  await exportComposable.handleExport(exportComposable.fileType);
  exportComposable.closeExportDialog();
}

// Lines 927-930: cancelExportRow wrapper
function cancelExportRow() {
  exportComposable.closeExportDialog();
}

// Lines 971-973: handleBulkExport wrapper
function handleBulkExport() {
  exportComposable.openExportDialog();
}

// Lines 975-977: handleHtmlExport wrapper
function handleHtmlExport() {
  exportComposable.handleHtmlExport();
}

// Lines 979-981: cancelHtmlExport wrapper
function cancelHtmlExport() {
  exportComposable.closeHtmlExportDialog();
}

// Lines 983-985: confirmHtmlExport wrapper
async function confirmHtmlExport() {
  await exportComposable.handleHtmlExport();
}

// Lines 987-989: closeHtmlPreview wrapper
function closeHtmlPreview() {
  exportComposable.closeHtmlPreview();
}

// Lines 991-993: copyHtmlToClipboard wrapper
async function copyHtmlToClipboard() {
  await exportComposable.copyHtmlToClipboard();
}

// Lines 995-997: generatePdfPreview wrapper
async function generatePdfPreview() {
  await exportComposable.generatePdfPreview();
}

// Lines 999-1001: prepareEmailHtml wrapper
async function prepareEmailHtml() {
  await exportComposable.prepareEmailHtml();
}

// Lines 1003-1005: copyEmailHtmlToClipboard wrapper
async function copyEmailHtmlToClipboard() {
  await exportComposable.copyEmailHtmlToClipboard();
}
```

**Refactored useBulkActions.svelte.ts should include:**

```typescript
export interface BulkActionsOptions {
  entity: () => string;
  selectedKeys: () => string[];
  onBulkActionStart?: () => void;
  onBulkActionComplete?: () => void;
  onBulkActionError?: (error: Error) => void;
  onSelectionChange?: (keys: string[]) => void;
  onRefresh?: () => void;
  onToolbarModeChange?: () => void;
  t?: (key: string, params?: Record<string, any>) => string;
  dialogs?: {
    openBulkDeleteDialog: () => void;
    closeBulkDeleteDialog: () => void;
    openBulkRestoreDialog: () => void;
    closeBulkRestoreDialog: () => void;
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
  };
  duplicateScope?: $state<'selected' | 'single'>;
  setDuplicateScope?: (scope: 'selected' | 'single') => void;
  exportComposable?: {
    fileType: 'xlsx' | 'csv' | null;
    handleExport: (fileType: 'xlsx' | 'csv') => Promise<void>;
    openExportDialog: () => void;
    closeExportDialog: () => void;
    handleHtmlExport: () => Promise<void>;
    openHtmlExportDialog: () => void;
    closeHtmlExportDialog: () => void;
    closeHtmlPreview: () => void;
    copyHtmlToClipboard: () => Promise<void>;
    generatePdfPreview: () => Promise<void>;
    prepareEmailHtml: () => Promise<void>;
    copyEmailHtmlToClipboard: () => Promise<void>;
  };
}

export interface BulkActionsReturn {
  // Existing returns...
  handleBulkDelete: () => void;
  confirmBulkDelete: () => Promise<void>;
  cancelBulkDelete: () => void;
  handleBulkRestore: () => void;
  confirmBulkRestore: () => Promise<void>;
  cancelBulkRestore: () => void;
  handleBulkDuplicate: () => void;
  confirmBulkDuplicate: () => Promise<void>;
  cancelBulkDuplicate: () => void;
  handleBulkExport: () => void;
  confirmExportRow: () => Promise<void>;
  cancelExportRow: () => void;
  handleHtmlExport: () => Promise<void>;
  cancelHtmlExport: () => void;
  confirmHtmlExport: () => Promise<void>;
  closeHtmlPreview: () => void;
  copyHtmlToClipboard: () => Promise<void>;
  generatePdfPreview: () => Promise<void>;
  prepareEmailHtml: () => Promise<void>;
  copyEmailHtmlToClipboard: () => Promise<void>;
}

// Add wrapper functions to composable
function handleBulkDelete() {
  dialogs?.openBulkDeleteDialog();
}

async function confirmBulkDelete() {
  await confirmBulkDeleteImpl(); // Call existing implementation
  dialogs?.closeBulkDeleteDialog();
}

function cancelBulkDelete() {
  dialogs?.closeBulkDeleteDialog();
}

function handleBulkRestore() {
  dialogs?.openBulkRestoreDialog();
}

async function confirmBulkRestore() {
  await confirmBulkRestoreImpl(); // Call existing implementation
  dialogs?.closeBulkRestoreDialog();
}

function cancelBulkRestore() {
  dialogs?.closeBulkRestoreDialog();
}

function handleBulkDuplicate() {
  if (selectedKeysFn().length > 50) {
    const { pushImpactError } = await import('$lib/errors/app-errors');
    pushImpactError({
      impact: 'MEDIUM',
      messageKey: 'entities.list.duplicateMaxLimit',
      scope: tFn?.('errors.scope.duplicateAction') || 'duplicate',
      toast: true
    });
    return;
  }
  setDuplicateScope?.('selected');
  dialogs?.openDuplicateDialog();
}

function handleBulkExport() {
  exportComposable?.openExportDialog();
}

async function confirmExportRow() {
  if (!exportComposable?.fileType) return;
  await exportComposable.handleExport(exportComposable.fileType);
  exportComposable.closeExportDialog();
}

function cancelExportRow() {
  exportComposable?.closeExportDialog();
}

function handleHtmlExport() {
  exportComposable?.handleHtmlExport();
}

function cancelHtmlExport() {
  exportComposable?.closeHtmlExportDialog();
}

async function confirmHtmlExport() {
  await exportComposable?.handleHtmlExport();
}

function closeHtmlPreview() {
  exportComposable?.closeHtmlPreview();
}

async function copyHtmlToClipboard() {
  await exportComposable?.copyHtmlToClipboard();
}

async function generatePdfPreview() {
  await exportComposable?.generatePdfPreview();
}

async function prepareEmailHtml() {
  await exportComposable?.prepareEmailHtml();
}

async function copyEmailHtmlToClipboard() {
  await exportComposable?.copyEmailHtmlToClipboard();
}
```

**Dependencies to add to useBulkActions:**
- `dialogs` composable (openBulkDeleteDialog, closeBulkDeleteDialog, etc.)
- `duplicateScope` state (shared with useRowActions)
- `exportComposable` (optional, for export-related wrappers)
- `pushImpactError` function (import dynamically)

**Steps:**
1. Read `EntityListTable.svelte` lines 889-1005
2. Read existing `composables/useBulkActions.svelte.ts`
3. Add wrapper functions to useBulkActions composable
4. Update BulkActionsOptions interface to include dialogs, duplicateScope, and exportComposable
5. Update BulkActionsReturn interface to include new functions
6. Rename existing confirm functions to confirmBulkDeleteImpl, confirmBulkRestoreImpl, confirmBulkDuplicateImpl
7. Update EntityListTable.svelte to pass dialogs, duplicateScope, and exportComposable to useBulkActions
8. Remove wrapper functions from EntityListTable.svelte (lines 889-1005)
9. Update dialog components to use composable methods
10. Test all bulk actions (delete, restore, duplicate, export)

---

## Testing Checklist

- [ ] Row delete action works correctly (dialog opens, confirmation executes)
- [ ] Row restore action works correctly (dialog opens, confirmation executes)
- [ ] Row duplicate action works correctly (dialog opens, confirmation executes)
- [ ] Row edit action works correctly
- [ ] Row preview action works correctly
- [ ] Row version history works correctly (sheet opens with correct data)
- [ ] Bulk delete action works correctly (dialog opens, confirmation executes)
- [ ] Bulk restore action works correctly (dialog opens, confirmation executes)
- [ ] Bulk duplicate action works correctly (limit check, dialog opens, confirmation executes)
- [ ] Bulk export action works correctly (dialog opens, file downloads)
- [ ] HTML export works correctly (preview dialog opens, content renders)
- [ ] PDF generation works correctly (preview generates)
- [ ] Email HTML preparation works correctly (email format renders)
- [ ] Dialog state management works correctly (open/close/reset)
- [ ] duplicateScope state is correctly shared between row and bulk actions
- [ ] No TypeScript errors: `pnpm run check`
- [ ] Dev server runs without errors: `pnpm run dev`
- [ ] Manual testing of affected features
- [ ] All existing functionality preserved

---

## Success Criteria

- [ ] All action handler wrappers moved to existing composables
- [ ] Main component reduced by ~120 lines (wrapper functions removed)
- [ ] Dialog state variables moved to composables (rowToDelete, rowToRestore, singleRowToDuplicate, duplicateScope)
- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] All features manually tested
- [ ] Code follows existing patterns and conventions
- [ ] duplicateScope state is properly shared between useRowActions and useBulkActions

---

## Project Rules Compliance

This refactoring must follow the rules from `AGENTS.md`:

1. **Svelte 5 Runes**: All state must use `$state<Type>()`, derived values use `$derived()`
2. **TypeScript**: All functions must be properly typed with interfaces
3. **No Automatic Commits**: Never commit changes without explicit user instruction
4. **Documentation**: All changes must preserve existing functionality

### State Management Pattern
When moving state to composables, follow the existing pattern:
```typescript
// Composable state
let someState = $state<Type>(initialValue);

// Return as getter for reactivity
return {
  get someState() { return someState; },
  // ... other methods
};
```

---

## Important Notes

### State Sharing Challenge
The `duplicateScope` state needs to be shared between `useRowActions` and `useBulkActions` composables. Options:

1. **Create a separate composable** for duplicate state management:
   ```typescript
   // composables/useDuplicateState.svelte.ts
   export function useDuplicateState() {
     let duplicateScope = $state<'selected' | 'single'>('selected');
     let singleRowToDuplicate = $state<TRow | null>(null);
     
     return {
       get duplicateScope() { return duplicateScope; },
       get singleRowToDuplicate() { return singleRowToDuplicate; },
       setDuplicateScope: (scope: 'selected' | 'single') => { duplicateScope = scope; },
       setSingleRowToDuplicate: (row: TRow | null) => { singleRowToDuplicate = row; }
     };
   }
   ```

2. **Pass state as reactive parameters** between composables (more complex)

3. **Keep duplicateScope in main component** and pass as parameter to both composables (simpler, less refactoring)

**Recommendation:** Use option 1 (separate composable) for better separation of concerns, or option 3 (keep in main) for simplicity. Given the scope of this refactoring, option 3 is recommended to minimize risk.

---

## Summary of Changes

### Files to Modify:
1. **EntityListTable.svelte** - Remove ~120 lines of wrapper functions and dialog state
2. **useRowActions.svelte.ts** - Add dialog state, wrapper functions, and loadVersionHistory
3. **useBulkActions.svelte.ts** - Add dialog wrapper functions and export-related wrappers

### Lines to Remove from EntityListTable.svelte:
- Lines 627-630: Dialog state variables (rowToDelete, rowToRestore, singleRowToDuplicate, duplicateScope)
- Lines 695-702: loadVersionHistory function
- Lines 733-736: handleEditRow wrapper
- Lines 738-742: handlePreviewRow wrapper
- Lines 857-863: handleDeleteRow wrapper
- Lines 865-871: handleRestoreRow wrapper
- Lines 873-879: confirmDeleteRow wrapper
- Lines 881-887: confirmRestoreRow wrapper
- Lines 889-892: handleBulkDelete wrapper
- Lines 894-898: confirmBulkDelete wrapper
- Lines 900-903: cancelBulkDelete wrapper
- Lines 905-907: handleBulkRestore wrapper
- Lines 909-913: confirmBulkRestore wrapper
- Lines 915-918: cancelBulkRestore wrapper
- Lines 920-925: confirmExportRow wrapper
- Lines 927-930: cancelExportRow wrapper
- Lines 932-944: handleBulkDuplicate wrapper
- Lines 946-955: handleDuplicateRow wrapper
- Lines 957-964: confirmDuplicate wrapper
- Lines 966-969: cancelDuplicate wrapper
- Lines 971-973: handleBulkExport wrapper
- Lines 975-977: handleHtmlExport wrapper
- Lines 979-981: cancelHtmlExport wrapper
- Lines 983-985: confirmHtmlExport wrapper
- Lines 987-989: closeHtmlPreview wrapper
- Lines 991-993: copyHtmlToClipboard wrapper
- Lines 995-997: generatePdfPreview wrapper
- Lines 999-1001: prepareEmailHtml wrapper
- Lines 1003-1005: copyEmailHtmlToClipboard wrapper

**Total lines removed: ~120 lines**

### Expected Result:
- EntityListTable.svelte reduced from 3477 to ~3357 lines
- Better separation of concerns (dialog management in composables)
- Reusable action handlers across components
- Easier to test and maintain individual features

### Dialog State Management
The dialog state variables (`rowToDelete`, `rowToRestore`) are currently in the main component. Moving them to `useRowActions` means the dialog components will need to be updated to read from the composable instead of the main component's state.

### Export Functions
Export-related wrappers are thin passthroughs to `exportComposable`. These could remain in the main component or be moved to `useBulkActions`. Given they're already well-encapsulated in `exportComposable`, keeping them in the main component is acceptable to reduce complexity.
