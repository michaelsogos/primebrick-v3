# Phase 6: Extract Dialog Components

## Overview
Extract the dialog template sections (BulkDeleteDialog, BulkRestoreDialog, DeleteDialog, RestoreDialog, DuplicateDialog, ExportDialog) from EntityListTable.svelte into separate dialog components.

## Expected Reduction
~200 lines (5%) - from ~2532 to ~2332 lines

## Current State Analysis

### Dialog Templates (Inline)
- BulkDeleteDialog template section (~30 lines)
- BulkRestoreDialog template section (~30 lines)
- DeleteDialog template section (~30 lines)
- RestoreDialog template section (~30 lines)
- DuplicateDialog template section (~40 lines)
- ExportDialog template section (~40 lines)
- Dialog-related state management

### Dialog Handlers (Inline)
- Dialog-specific event handlers
- Dialog state management
- Dialog open/close logic

### Template References
- Dialog sections in main template
- Dialog-related conditional rendering
- Dialog props passing

## Target State
- BulkDeleteDialog extracted to separate component
- BulkRestoreDialog extracted to separate component
- DeleteDialog extracted to separate component
- RestoreDialog extracted to separate component
- DuplicateDialog extracted to separate component
- ExportDialog extracted to separate component
- EntityListTable uses dialog components
- No inline dialog templates remain
- All dialog functionality works correctly

## Prerequisites
- Phase 1 completed successfully
- Phase 2 completed successfully
- Phase 3 completed successfully
- Phase 4 completed successfully
- Phase 5 completed successfully
- EntityListTable.svelte at ~2532 lines
- Dialog functionality currently working

## Actions

### 6.1 Create BulkDeleteDialog Component

#### Step 6.1.1: Create Component File
**File**: `src/lib/components/entity-list-table/dialogs/BulkDeleteDialog.svelte`

**Create new component with bulk delete dialog template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { AlertTriangle, Loader2 } from 'lucide-svelte';

  interface BulkDeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    onOpenChange,
    selectedCount,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    isDeleting,
    onConfirm,
    onCancel
  }: BulkDeleteDialogProps = $props();

  const $t = t;

  const selectionText = $derived(() => {
    if (selectedCount === 1) {
      return selectionLabelSingularText || $t(selectionLabelSingularKey || 'common.item');
    }
    return selectionLabelText || $t(selectionLabelKey || 'common.items', { count: selectedCount });
  });
</script>

<DialogBordered bind:open={open} color="destructive" class="sm:max-w-md" showCloseButton={false}>
  <div class="flex items-center gap-3 mb-4">
    <div class="p-2 rounded-full bg-destructive/10">
      <AlertTriangle class="h-5 w-5 text-destructive" />
    </div>
    <h3 class="text-lg font-semibold">
      {$t('entities.list.bulkDeleteConfirmTitle')}
    </h3>
  </div>

  <p class="text-sm text-muted-foreground mb-6">
    {$t('entities.list.bulkDeleteConfirmMessage', { count: selectedCount, items: selectionText() })}
  </p>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onCancel} disabled={isDeleting}>
      {$t('common.cancel')}
    </Button>
    <Button
      variant="destructive"
      onclick={onConfirm}
      disabled={isDeleting}
    >
      {#if isDeleting}
        <Loader2 class="h-4 w-4 mr-2 animate-spin" />
        {$t('common.deleting')}
      {:else}
        {$t('common.delete')}
      {/if}
    </Button>
  </div>
</DialogBordered>
```

#### Step 6.1.2: Export from Dialogs Index
**File**: `src/lib/components/entity-list-table/dialogs/index.ts`

**Create or update index file**:
```typescript
export { default as BulkDeleteDialog } from './BulkDeleteDialog.svelte';
```

### 6.2 Create BulkRestoreDialog Component

#### Step 6.2.1: Create Component File
**File**: `src/lib/components/entity-list-table/dialogs/BulkRestoreDialog.svelte`

**Create new component with bulk restore dialog template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { RotateCcw, Loader2 } from 'lucide-svelte';

  interface BulkRestoreDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    isRestoring: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    onOpenChange,
    selectedCount,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    isRestoring,
    onConfirm,
    onCancel
  }: BulkRestoreDialogProps = $props();

  const $t = t;

  const selectionText = $derived(() => {
    if (selectedCount === 1) {
      return selectionLabelSingularText || $t(selectionLabelSingularKey || 'common.item');
    }
    return selectionLabelText || $t(selectionLabelKey || 'common.items', { count: selectedCount });
  });
</script>

<DialogBordered bind:open={open} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <div class="flex items-center gap-3 mb-4">
    <div class="p-2 rounded-full bg-warning/10">
      <RotateCcw class="h-5 w-5 text-warning" />
    </div>
    <h3 class="text-lg font-semibold">
      {$t('entities.list.bulkRestoreConfirmTitle')}
    </h3>
  </div>

  <p class="text-sm text-muted-foreground mb-6">
    {$t('entities.list.bulkRestoreConfirmMessage', { count: selectedCount, items: selectionText() })}
  </p>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onCancel} disabled={isRestoring}>
      {$t('common.cancel')}
    </Button>
    <Button
      variant="warning"
      onclick={onConfirm}
      disabled={isRestoring}
    >
      {#if isRestoring}
        <Loader2 class="h-4 w-4 mr-2 animate-spin" />
        {$t('common.restoring')}
      {:else}
        {$t('common.restore')}
      {/if}
    </Button>
  </div>
</DialogBordered>
```

#### Step 6.2.2: Export from Dialogs Index
**File**: `src/lib/components/entity-list-table/dialogs/index.ts`

**Add export**:
```typescript
export { default as BulkRestoreDialog } from './BulkRestoreDialog.svelte';
```

### 6.3 Create DeleteDialog Component

#### Step 6.3.1: Create Component File
**File**: `src/lib/components/entity-list-table/dialogs/DeleteDialog.svelte`

**Create new component with delete dialog template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { AlertTriangle, Loader2 } from 'lucide-svelte';

  interface DeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    onOpenChange,
    isDeleting,
    onConfirm,
    onCancel
  }: DeleteDialogProps = $props();

  const $t = t;
</script>

<DialogBordered bind:open={open} color="destructive" class="sm:max-w-md" showCloseButton={false}>
  <div class="flex items-center gap-3 mb-4">
    <div class="p-2 rounded-full bg-destructive/10">
      <AlertTriangle class="h-5 w-5 text-destructive" />
    </div>
    <h3 class="text-lg font-semibold">
      {$t('entities.list.deleteConfirmTitle')}
    </h3>
  </div>

  <p class="text-sm text-muted-foreground mb-6">
    {$t('entities.list.deleteConfirmMessage')}
  </p>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onCancel} disabled={isDeleting}>
      {$t('common.cancel')}
    </Button>
    <Button
      variant="destructive"
      onclick={onConfirm}
      disabled={isDeleting}
    >
      {#if isDeleting}
        <Loader2 class="h-4 w-4 mr-2 animate-spin" />
        {$t('common.deleting')}
      {:else}
        {$t('common.delete')}
      {/if}
    </Button>
  </div>
</DialogBordered>
```

#### Step 6.3.2: Export from Dialogs Index
**File**: `src/lib/components/entity-list-table/dialogs/index.ts`

**Add export**:
```typescript
export { default as DeleteDialog } from './DeleteDialog.svelte';
```

### 6.4 Create RestoreDialog Component

#### Step 6.4.1: Create Component File
**File**: `src/lib/components/entity-list-table/dialogs/RestoreDialog.svelte`

**Create new component with restore dialog template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { RotateCcw, Loader2 } from 'lucide-svelte';

  interface RestoreDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isRestoring: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    onOpenChange,
    isRestoring,
    onConfirm,
    onCancel
  }: RestoreDialogProps = $props();

  const $t = t;
</script>

<DialogBordered bind:open={open} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <div class="flex items-center gap-3 mb-4">
    <div class="p-2 rounded-full bg-warning/10">
      <RotateCcw class="h-5 w-5 text-warning" />
    </div>
    <h3 class="text-lg font-semibold">
      {$t('entities.list.restoreConfirmTitle')}
    </h3>
  </div>

  <p class="text-sm text-muted-foreground mb-6">
    {$t('entities.list.restoreConfirmMessage')}
  </p>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onCancel} disabled={isRestoring}>
      {$t('common.cancel')}
    </Button>
    <Button
      variant="warning"
      onclick={onConfirm}
      disabled={isRestoring}
    >
      {#if isRestoring}
        <Loader2 class="h-4 w-4 mr-2 animate-spin" />
        {$t('common.restoring')}
      {:else}
        {$t('common.restore')}
      {/if}
    </Button>
  </div>
</DialogBordered>
```

#### Step 6.4.2: Export from Dialogs Index
**File**: `src/lib/components/entity-list-table/dialogs/index.ts`

**Add export**:
```typescript
export { default as RestoreDialog } from './RestoreDialog.svelte';
```

### 6.5 Create DuplicateDialog Component

#### Step 6.5.1: Create Component File
**File**: `src/lib/components/entity-list-table/dialogs/DuplicateDialog.svelte`

**Create new component with duplicate dialog template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { Copy, Loader2 } from 'lucide-svelte';

  interface DuplicateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scope: 'selected' | 'single';
    selectedCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    isDuplicating: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    onOpenChange,
    scope,
    selectedCount,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    isDuplicating,
    onConfirm,
    onCancel
  }: DuplicateDialogProps = $props();

  const $t = t;

  const selectionText = $derived(() => {
    if (selectedCount === 1) {
      return selectionLabelSingularText || $t(selectionLabelSingularKey || 'common.item');
    }
    return selectionLabelText || $t(selectionLabelKey || 'common.items', { count: selectedCount });
  });
</script>

<DialogBordered bind:open={open} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <div class="flex items-center gap-3 mb-4">
    <div class="p-2 rounded-full bg-warning/10">
      <Copy class="h-5 w-5 text-warning" />
    </div>
    <h3 class="text-lg font-semibold">
      {$t('entities.list.duplicateConfirmTitle')}
    </h3>
  </div>

  <div class="space-y-3 mb-6">
    <p class="text-sm text-muted-foreground">
      {#if scope === 'selected'}
        {$t('entities.list.duplicateSelectedMessage', { count: selectedCount, items: selectionText() })}
      {:else}
        {$t('entities.list.duplicateSingleMessage')}
      {/if}
    </p>

    {#if scope === 'selected' && selectedCount > 50}
      <div class="flex items-center gap-2 p-3 bg-warning/10 rounded-md">
        <Badge variant="warning">{$t('common.warning')}</Badge>
        <span class="text-sm">
          {$t('entities.list.duplicateMaxLimitWarning')}
        </span>
      </div>
    {/if}
  </div>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onCancel} disabled={isDuplicating}>
      {$t('common.cancel')}
    </Button>
    <Button
      variant="warning"
      onclick={onConfirm}
      disabled={isDuplicating || (scope === 'selected' && selectedCount > 50)}
    >
      {#if isDuplicating}
        <Loader2 class="h-4 w-4 mr-2 animate-spin" />
        {$t('common.duplicating')}
      {:else}
        {$t('common.duplicate')}
      {/if}
    </Button>
  </div>
</DialogBordered>
```

#### Step 6.5.2: Export from Dialogs Index
**File**: `src/lib/components/entity-list-table/dialogs/index.ts`

**Add export**:
```typescript
export { default as DuplicateDialog } from './DuplicateDialog.svelte';
```

### 6.6 Create ExportDialog Component

#### Step 6.6.1: Create Component File
**File**: `src/lib/components/entity-list-table/dialogs/ExportDialog.svelte`

**Create new component with export dialog template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { Download, Loader2, FileText, Table } from 'lucide-svelte';
  import BsFiletypeXlsx from '~icons/bi/filetype-xlsx';
  import BsFiletypeCsv from '~icons/bi/filetype-csv';

  interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    exportScope: 'selected' | 'all';
    onExportScopeChange: (scope: 'selected' | 'all') => void;
    selectedCount: number;
    totalCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    isExporting: boolean;
    fileType: 'xlsx' | 'csv' | null;
    onFileTypeChange: (type: 'xlsx' | 'csv' | null) => void;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open,
    onOpenChange,
    exportScope,
    onExportScopeChange,
    selectedCount,
    totalCount,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    isExporting,
    fileType,
    onFileTypeChange,
    onConfirm,
    onCancel
  }: ExportDialogProps = $props();

  const $t = t;

  const selectionText = $derived(() => {
    if (selectedCount === 1) {
      return selectionLabelSingularText || $t(selectionLabelSingularKey || 'common.item');
    }
    return selectionLabelText || $t(selectionLabelKey || 'common.items', { count: selectedCount });
  });
</script>

<DialogBordered bind:open={open} class="sm:max-w-md" showCloseButton={false}>
  <div class="flex items-center gap-3 mb-4">
    <div class="p-2 rounded-full bg-primary/10">
      <Download class="h-5 w-5 text-primary" />
    </div>
    <h3 class="text-lg font-semibold">
      {$t('entities.list.exportTitle')}
    </h3>
  </div>

  <div class="space-y-4 mb-6">
    <!-- Export Scope -->
    <div>
      <label class="text-sm font-medium mb-2 block">
        {$t('entities.list.exportScope')}
      </label>
      <div class="flex gap-2">
        <Button
          variant={exportScope === 'selected' ? 'default' : 'outline'}
          size="sm"
          onclick={() => onExportScopeChange('selected')}
          disabled={selectedCount === 0}
        >
          <FileText class="h-4 w-4 mr-2" />
          {$t('entities.list.exportSelected')}
          <Badge variant="secondary" class="ml-2">
            {selectedCount}
          </Badge>
        </Button>
        <Button
          variant={exportScope === 'all' ? 'default' : 'outline'}
          size="sm"
          onclick={() => onExportScopeChange('all')}
        >
          <Table class="h-4 w-4 mr-2" />
          {$t('entities.list.exportAll')}
          <Badge variant="secondary" class="ml-2">
            {totalCount}
          </Badge>
        </Button>
      </div>
    </div>

    <!-- File Type -->
    <div>
      <label class="text-sm font-medium mb-2 block">
        {$t('entities.list.fileType')}
      </label>
      <div class="flex gap-2">
        <Button
          variant={fileType === 'xlsx' ? 'default' : 'outline'}
          size="sm"
          onclick={() => onFileTypeChange('xlsx')}
        >
          <BsFiletypeXlsx class="h-4 w-4 mr-2" />
          XLSX
        </Button>
        <Button
          variant={fileType === 'csv' ? 'default' : 'outline'}
          size="sm"
          onclick={() => onFileTypeChange('csv')}
        >
          <BsFiletypeCsv class="h-4 w-4 mr-2" />
          CSV
        </Button>
      </div>
    </div>
  </div>

  <div class="flex justify-end gap-2">
    <Button variant="outline" onclick={onCancel} disabled={isExporting}>
      {$t('common.cancel')}
    </Button>
    <Button
      onclick={onConfirm}
      disabled={isExporting || !fileType}
    >
      {#if isExporting}
        <Loader2 class="h-4 w-4 mr-2 animate-spin" />
        {$t('common.exporting')}
      {:else}
        <Download class="h-4 w-4 mr-2" />
        {$t('common.export')}
      {/if}
    </Button>
  </div>
</DialogBordered>
```

#### Step 6.6.2: Export from Dialogs Index
**File**: `src/lib/components/entity-list-table/dialogs/index.ts`

**Add export**:
```typescript
export { default as ExportDialog } from './ExportDialog.svelte';
```

### 6.7 Integrate Dialog Components

#### Step 6.7.1: Import Dialog Components
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add import** (after line 29, after existing dialogs import):
```typescript
import { BulkDeleteDialog, BulkRestoreDialog, DeleteDialog, RestoreDialog, DuplicateDialog, ExportDialog } from './dialogs';
```

#### Step 6.7.2: Find BulkDeleteDialog Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find bulk delete dialog template**:
```bash
grep -n "BulkDeleteDialog\|bulk delete" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the bulk delete dialog template section** (approximately lines 2500-2530)

#### Step 6.7.3: Replace BulkDeleteDialog Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the bulk delete dialog template section** with:
```svelte
<BulkDeleteDialog
  open={dialogs.deleteDialogOpen}
  onOpenChange={(open) => open ? dialogs.openDeleteDialog() : dialogs.closeDeleteDialog()}
  selectedCount={selectedKeys.length}
  selectionLabelKey={selectionLabelKey}
  selectionLabelSingularKey={selectionLabelSingularKey}
  selectionLabelText={selectionLabelText}
  selectionLabelSingularText={selectionLabelSingularText}
  isDeleting={bulkActions.isDeleting}
  onConfirm={confirmBulkDelete}
  onCancel={() => dialogs.closeDeleteDialog()}
/>
```

#### Step 6.7.4: Find BulkRestoreDialog Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find bulk restore dialog template**:
```bash
grep -n "BulkRestoreDialog\|bulk restore" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the bulk restore dialog template section** (approximately lines 2530-2560)

#### Step 6.7.5: Replace BulkRestoreDialog Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the bulk restore dialog template section** with:
```svelte
<BulkRestoreDialog
  open={dialogs.restoreDialogOpen}
  onOpenChange={(open) => open ? dialogs.openRestoreDialog() : dialogs.closeRestoreDialog()}
  selectedCount={selectedKeys.length}
  selectionLabelKey={selectionLabelKey}
  selectionLabelSingularKey={selectionLabelSingularKey}
  selectionLabelText={selectionLabelText}
  selectionLabelSingularText={selectionLabelSingularText}
  isRestoring={bulkActions.isRestoring}
  onConfirm={confirmBulkRestore}
  onCancel={() => dialogs.closeRestoreDialog()}
/>
```

#### Step 6.7.6: Find DeleteDialog Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find delete dialog template**:
```bash
grep -n "DeleteDialog\|delete.*confirm" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the delete dialog template section** (approximately lines 2560-2590)

#### Step 6.7.7: Replace DeleteDialog Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the delete dialog template section** with:
```svelte
<DeleteDialog
  open={dialogs.deleteDialogOpen}
  onOpenChange={(open) => open ? dialogs.openDeleteDialog() : dialogs.closeDeleteDialog()}
  isDeleting={rowActionsComposable.isDeleting}
  onConfirm={confirmDeleteRow}
  onCancel={() => dialogs.closeDeleteDialog()}
/>
```

#### Step 6.7.8: Find RestoreDialog Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find restore dialog template**:
```bash
grep -n "RestoreDialog\|restore.*confirm" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the restore dialog template section** (approximately lines 2590-2620)

#### Step 6.7.9: Replace RestoreDialog Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the restore dialog template section** with:
```svelte
<RestoreDialog
  open={dialogs.restoreDialogOpen}
  onOpenChange={(open) => open ? dialogs.openRestoreDialog() : dialogs.closeRestoreDialog()}
  isRestoring={rowActionsComposable.isRestoring}
  onConfirm={confirmRestoreRow}
  onCancel={() => dialogs.closeRestoreDialog()}
/>
```

#### Step 6.7.10: Find DuplicateDialog Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find duplicate dialog template**:
```bash
grep -n "DuplicateDialog\|duplicate.*confirm" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the duplicate dialog template section** (approximately lines 2620-2660)

#### Step 6.7.11: Replace DuplicateDialog Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the duplicate dialog template section** with:
```svelte
<DuplicateDialog
  open={dialogs.duplicateDialogOpen}
  onOpenChange={(open) => open ? dialogs.openDuplicateDialog() : dialogs.closeDuplicateDialog()}
  scope={duplicateScope}
  selectedCount={selectedKeys.length}
  selectionLabelKey={selectionLabelKey}
  selectionLabelSingularKey={selectionLabelSingularKey}
  selectionLabelText={selectionLabelText}
  selectionLabelSingularText={selectionLabelSingularText}
  isDuplicating={duplicateScope === 'selected' ? bulkActions.isDuplicating : rowActionsComposable.isDuplicating}
  onConfirm={confirmDuplicate}
  onCancel={() => dialogs.closeDuplicateDialog()}
/>
```

#### Step 6.7.12: Find ExportDialog Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find export dialog template**:
```bash
grep -n "ExportDialog\|export.*dialog" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the export dialog template section** (approximately lines 2660-2720)

#### Step 6.7.13: Replace ExportDialog Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the export dialog template section** with:
```svelte
<ExportDialog
  open={exportComposable.exportOpen}
  onOpenChange={(open) => open ? exportComposable.openExportDialog() : exportComposable.closeExportDialog()}
  exportScope={exportComposable.exportScope}
  onExportScopeChange={exportComposable.setExportScope}
  selectedCount={selectedKeys.length}
  totalCount={total}
  selectionLabelKey={selectionLabelKey}
  selectionLabelSingularKey={selectionLabelSingularKey}
  selectionLabelText={selectionLabelText}
  selectionLabelSingularText={selectionLabelSingularText}
  isExporting={exportComposable.isExporting}
  fileType={exportComposable.fileType}
  onFileTypeChange={exportComposable.setFileType}
  onConfirm={() => exportComposable.handleExport(exportComposable.fileType || 'xlsx')}
  onCancel={() => exportComposable.closeExportDialog()}
/>
```

#### Step 6.7.14: Remove Unused Dialog Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find dialog-related imports**:
```bash
grep -n "import.*DeleteDialog\|import.*RestoreDialog\|import.*DuplicateDialog\|import.*ExportDialog" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these imports** (line 29 approximately):
```typescript
import { DeleteDialog, RestoreDialog, ExportDialog, DuplicateDialog } from './dialogs';
```

**Replace with**:
```typescript
import { BulkDeleteDialog, BulkRestoreDialog, DeleteDialog, RestoreDialog, DuplicateDialog, ExportDialog } from './dialogs';
```

### 6.8 Cleanup and Verification

#### Step 6.8.1: Remove Dialog-Related Icons
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find dialog-related icon imports**:
```bash
grep -n "AlertTriangle\|RotateCcw\|Copy\|Download" src/lib/components/entity-list-table/EntityListTable.svelte | head -10
```

**Remove unused icon imports** if they are only used in dialogs:
```typescript
// Remove these if only used in dialogs:
AlertTriangle,
RotateCcw,
Copy,
Download,
```

**Note**: Keep icons that are used elsewhere in the component

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
Test the following dialog functionality:
1. Open bulk delete dialog
2. Confirm bulk delete
3. Cancel bulk delete
4. Open bulk restore dialog
5. Confirm bulk restore
6. Cancel bulk restore
7. Open delete dialog
8. Confirm delete
9. Cancel delete
10. Open restore dialog
11. Confirm restore
12. Cancel restore
13. Open duplicate dialog
14. Confirm duplicate
15. Cancel duplicate
16. Open export dialog
17. Select export scope
18. Select file type
19. Confirm export
20. Cancel export

**Expected**: All dialog functionality works correctly

### Step 4: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~2332 lines (reduction of ~200 lines from ~2532)

## Acceptance Criteria
- ✅ BulkDeleteDialog component created
- ✅ BulkRestoreDialog component created
- ✅ DeleteDialog component created
- ✅ RestoreDialog component created
- ✅ DuplicateDialog component created
- ✅ ExportDialog component created
- ✅ All dialog templates extracted to components
- ✅ EntityListTable uses dialog components
- ✅ All required props passed correctly
- ✅ No inline dialog templates remain
- ✅ Unused dialog imports removed
- ✅ No compilation errors
- ✅ All dialog functionality works correctly
- ✅ Line count reduced by ~200 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually restore inline dialog templates
3. Remove dialog components
4. Restore dialog imports
5. Document what failed and why

## Notes
- This phase extracts dialogs to separate components
- Each dialog is self-contained with its own template and logic
- Props are passed from parent to child components
- This is a low complexity, low risk extraction
- Dialogs are well-defined UI sections with clear boundaries
- Test each dialog thoroughly as they contain critical user interactions
- Ensure all dialog state management still works correctly
- Dialog loading states are managed by parent composables
