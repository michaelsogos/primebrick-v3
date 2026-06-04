# Phase 2: Extract Preview Panel Logic

## Overview
Extract preview panel state management and logic from EntityListTable.svelte into a dedicated usePreviewPanel composable.

## Expected Reduction
~300 lines (7%) - from ~3732 to ~3432 lines

## Current State Analysis

### Preview Panel State (Inline)
- previewRow: TRow | null
- previewRowIndex: number
- previewEditMode: boolean
- previewPanelOpen: boolean
- focusedRowIndex: number
- related state variables

### Preview Panel Functions (Inline)
- closePreviewPanel()
- togglePreviewEditMode()
- handlePreviewFieldChange()
- preview navigation logic
- preview-related handlers

### Template References
- Preview panel template section (~200 lines)
- Preview-related conditional rendering
- Preview mode toggles

## Target State
- Preview panel state managed by usePreviewPanel composable
- Preview panel functions in usePreviewPanel composable
- EntityListTable uses composable state and methods
- Preview panel template uses composable state
- No inline preview state or functions remain
- All preview functionality works correctly

## Prerequisites
- Phase 1 completed successfully
- EntityListTable.svelte at ~3732 lines
- Preview panel functionality currently working

## Actions

### 2.1 Create usePreviewPanel Composable

#### Step 2.1.1: Create Composable File
**File**: `src/lib/components/entity-list-table/composables/usePreviewPanel.svelte.ts`

**Create new file with interface and implementation**:

```typescript
import type { Snippet } from 'svelte';

export interface PreviewPanelOptions<TRow extends Record<string, unknown>> {
  viewRows: () => TRow[];
  rowKey: (row: TRow) => string;
  onFieldChange?: (row: TRow, field: string, value: any) => void;
  onRefresh?: () => void;
}

export interface PreviewPanelReturn<TRow extends Record<string, unknown>> {
  previewRow: TRow | null;
  previewRowIndex: number;
  previewEditMode: boolean;
  previewPanelOpen: boolean;
  focusedRowIndex: number;
  openPreview: (row: TRow) => void;
  closePreview: () => void;
  toggleEditMode: () => void;
  handleFieldChange: (field: string, value: any) => void;
  navigatePreview: (direction: 'next' | 'prev') => void;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
}

export function usePreviewPanel<TRow extends Record<string, unknown>>(
  options: PreviewPanelOptions<TRow>
): PreviewPanelReturn<TRow> {
  const { viewRows: viewRowsFn, rowKey, onFieldChange, onRefresh } = options;

  let previewRow = $state<TRow | null>(null);
  let previewRowIndex = $state(0);
  let previewEditMode = $state(false);
  let previewPanelOpen = $state(false);
  let focusedRowIndex = $state(0);

  function openPreview(row: TRow) {
    previewRow = row;
    previewRowIndex = viewRowsFn().findIndex(r => rowKey(r) === rowKey(row));
    focusedRowIndex = previewRowIndex;
    previewEditMode = false;
    previewPanelOpen = true;
  }

  function closePreview() {
    previewPanelOpen = false;
    previewRow = null;
    previewEditMode = false;
  }

  function toggleEditMode() {
    previewEditMode = !previewEditMode;
  }

  function handleFieldChange(field: string, value: any) {
    if (previewRow) {
      if (onFieldChange) {
        onFieldChange(previewRow, field, value);
      }
      // Update local preview row state
      previewRow = { ...previewRow, [field]: value };
    }
  }

  function navigatePreview(direction: 'next' | 'prev') {
    const rows = viewRowsFn();
    if (rows.length === 0) return;

    if (direction === 'next') {
      const nextIndex = Math.min(previewRowIndex + 1, rows.length - 1);
      if (nextIndex !== previewRowIndex) {
        previewRow = rows[nextIndex];
        previewRowIndex = nextIndex;
        focusedRowIndex = nextIndex;
        previewEditMode = false;
      }
    } else {
      const prevIndex = Math.max(previewRowIndex - 1, 0);
      if (prevIndex !== previewRowIndex) {
        previewRow = rows[prevIndex];
        previewRowIndex = prevIndex;
        focusedRowIndex = prevIndex;
        previewEditMode = false;
      }
    }
  }

  const canNavigateNext = $derived(previewRowIndex < viewRowsFn().length - 1);
  const canNavigatePrev = $derived(previewRowIndex > 0);

  return {
    get previewRow() { return previewRow; },
    get previewRowIndex() { return previewRowIndex; },
    get previewEditMode() { return previewEditMode; },
    get previewPanelOpen() { return previewPanelOpen; },
    get focusedRowIndex() { return focusedRowIndex; },
    get canNavigateNext() { return canNavigateNext; },
    get canNavigatePrev() { return canNavigatePrev; },
    openPreview,
    closePreview,
    toggleEditMode,
    handleFieldChange,
    navigatePreview
  };
}
```

#### Step 2.1.2: Export from Composables Index
**File**: `src/lib/components/entity-list-table/composables/index.ts`

**Add export**:
```typescript
export { usePreviewPanel } from './usePreviewPanel.svelte.js';
export type { PreviewPanelOptions, PreviewPanelReturn } from './usePreviewPanel.svelte.js';
```

### 2.2 Integrate usePreviewPanel

#### Step 2.2.1: Import Composable
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add import** (after line 37, after existing composables import):
```typescript
import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';
```

#### Step 2.2.2: Initialize Composable
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add initialization** (after exportComposable initialization, around line 1900):
```typescript
const previewPanel = usePreviewPanel<TRow>({
  viewRows: () => viewRows,
  rowKey: rowKey,
  onFieldChange: (row, field, value) => {
    // Handle field change if needed
    // This could trigger API updates or local state updates
  },
  onRefresh: onRefresh
});
```

#### Step 2.2.3: Remove Inline Preview State Variables
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find and remove preview state variables**:
```bash
grep -n "let previewRow" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "let previewRowIndex" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "let previewEditMode" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "let previewPanelOpen" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "let focusedRowIndex" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these state variables** (approximately lines 750-770):
```typescript
let previewRow: TRow | null = $state(null);
let previewRowIndex = $state(0);
let previewEditMode = $state(false);
let previewPanelOpen = $state(false);
let focusedRowIndex = $state(0);
```

#### Step 2.2.4: Remove Inline Preview Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find and remove preview functions**:
```bash
grep -n "function closePreviewPanel" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "function togglePreviewEditMode" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "function handlePreviewFieldChange" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these functions** (approximately lines 900-950):
```typescript
function closePreviewPanel() {
  previewPanelOpen = false;
  previewRow = null;
  previewEditMode = false;
}

function togglePreviewEditMode() {
  previewEditMode = !previewEditMode;
}

function handlePreviewFieldChange(field: string, value: any) {
  if (previewRow) {
    previewRow[field] = value;
  }
}
```

#### Step 2.2.5: Update handlePreviewRow to Use Composable
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find handlePreviewRow function**:
```bash
grep -n "function handlePreviewRow" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (from Phase 1):
```typescript
function handlePreviewRow(row: TRow) {
  rowActionsComposable.handlePreviewRow(row);
}
```

**Update to use previewPanel composable**:
```typescript
function handlePreviewRow(row: TRow) {
  previewPanel.openPreview(row);
  closeRowDropdown();
}
```

#### Step 2.2.6: Update useRowActions Initialization
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find useRowActions initialization**:
```bash
grep -n "const rowActionsComposable" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Update onPreviewRow callback**:
```typescript
const rowActionsComposable = useRowActions<TRow>({
  entity: () => entity,
  uid: () => uid,
  onEditAction: onEditAction,
  onRefresh: onRefresh,
  isRowDeleted: isRowDeleted,
  rowKey: rowKey,
  onPreviewRow: (row) => {
    previewPanel.openPreview(row);
  },
  closeRowDropdown: closeRowDropdown,
  t: $t
});
```

#### Step 2.2.7: Update Template References - Preview Panel
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find preview panel template section**:
```bash
grep -n "previewPanelOpen" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace all references**:
- `previewPanelOpen` → `previewPanel.previewPanelOpen`
- `previewRow` → `previewPanel.previewRow`
- `previewEditMode` → `previewPanel.previewEditMode`
- `previewRowIndex` → `previewPanel.previewRowIndex`
- `focusedRowIndex` → `previewPanel.focusedRowIndex`

**Example replacement**:
```svelte
<!-- Before -->
{#if previewPanelOpen}
  <Window bind:open={previewPanelOpen} ...>
    {#if previewRow}
      <!-- Preview content -->
    {/if}
  </Window>
{/if}

<!-- After -->
{#if previewPanel.previewPanelOpen}
  <Window bind:open={previewPanel.previewPanelOpen} ...>
    {#if previewPanel.previewRow}
      <!-- Preview content -->
    {/if}
  </Window>
{/if}
```

#### Step 2.2.8: Update Template References - Preview Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace function calls**:
- `closePreviewPanel()` → `previewPanel.closePreview()`
- `togglePreviewEditMode()` → `previewPanel.toggleEditMode()`
- `handlePreviewFieldChange(field, value)` → `previewPanel.handleFieldChange(field, value)`

**Example replacement**:
```svelte
<!-- Before -->
<Button onclick={closePreviewPanel}>Close</Button>
<Button onclick={togglePreviewEditMode}>Edit</Button>

<!-- After -->
<Button onclick={previewPanel.closePreview}>Close</Button>
<Button onclick={previewPanel.toggleEditMode}>Edit</Button>
```

#### Step 2.2.9: Update Navigation Logic
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find navigation buttons in preview panel**:
```bash
grep -n "previewRowIndex.*1" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable navigation**:
```svelte
<!-- Before -->
<Button disabled={previewRowIndex >= viewRows.length - 1} onclick={() => previewRowIndex++}>
  Next
</Button>

<!-- After -->
<Button disabled={!previewPanel.canNavigateNext} onclick={() => previewPanel.navigatePreview('next')}>
  Next
</Button>
```

```svelte
<!-- Before -->
<Button disabled={previewRowIndex <= 0} onclick={() => previewRowIndex--}>
  Previous
</Button>

<!-- After -->
<Button disabled={!previewPanel.canNavigatePrev} onclick={() => previewPanel.navigatePreview('prev')}>
  Previous
</Button>
```

#### Step 2.2.10: Update Field Change Handlers
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find field change handlers in preview panel**:
```bash
grep -n "handlePreviewFieldChange" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable handler**:
```svelte
<!-- Before -->
<Input value={previewRow[field]} onchange={(e) => handlePreviewFieldChange(field, e.target.value)} />

<!-- After -->
<Input value={previewPanel.previewRow[field]} onchange={(e) => previewPanel.handleFieldChange(field, e.target.value)} />
```

### 2.3 Cleanup and Verification

#### Step 2.3.1: Remove Unused Variables
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any remaining preview-related variables**:
```bash
grep -n "preview" src/lib/components/entity-list-table/EntityListTable.svelte | grep "let "
```

**Remove any unused preview variables**

#### Step 2.3.2: Remove Unused Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any remaining preview-related functions**:
```bash
grep -n "function.*preview" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove any unused preview functions**

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
Test the following preview panel functionality:
1. Open preview panel by clicking on a row
2. Close preview panel
3. Toggle edit mode in preview panel
4. Navigate between rows in preview panel (next/previous)
5. Edit fields in preview panel (if edit mode is enabled)
6. Verify preview panel state persists correctly
7. Verify navigation works correctly at boundaries (first/last row)

**Expected**: All preview functionality works correctly

### Step 4: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~3432 lines (reduction of ~300 lines from ~3732)

## Acceptance Criteria
- ✅ usePreviewPanel composable created and exported
- ✅ Preview panel state managed by composable
- ✅ Preview panel functions in composable
- ✅ EntityListTable uses composable state and methods
- ✅ No inline preview state variables remain
- ✅ No inline preview functions remain
- ✅ Template uses composable state and methods
- ✅ No compilation errors
- ✅ All preview functionality works correctly
- ✅ Line count reduced by ~300 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually restore inline preview state and functions
3. Remove usePreviewPanel composable
4. Document what failed and why

## Notes
- This phase extracts preview panel logic to a dedicated composable
- The composable manages all preview panel state and behavior
- Preview panel navigation logic is included in the composable
- Field change handling is abstracted in the composable
- Template updates are extensive due to many preview references
- Test preview panel thoroughly as it's complex UI functionality
