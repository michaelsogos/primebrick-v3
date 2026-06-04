# Phase 4: Extract Toolbar Component

## Overview
Extract the toolbar template section and related handlers from EntityListTable.svelte into a separate EntityListToolbar.svelte component.

## Expected Reduction
~200 lines (5%) - from ~3032 to ~2832 lines

## Current State Analysis

### Toolbar Template (Inline)
- Toolbar template section (~200 lines)
- Search bar component
- View mode toggle
- Deletion filter toggle
- Bulk actions component
- Filter toggle button
- Refresh button
- Create action button

### Toolbar Handlers (Inline)
- Toolbar-related event handlers
- Toolbar state management
- Toolbar mode switching

### Template References
- Toolbar section in main template
- Toolbar-related conditional rendering
- Toolbar props passing

## Target State
- Toolbar extracted to EntityListToolbar.svelte component
- Toolbar template in separate component
- EntityListTable uses EntityListToolbar component
- No inline toolbar template remains
- All toolbar functionality works correctly

## Prerequisites
- Phase 1 completed successfully
- Phase 2 completed successfully
- Phase 3 completed successfully
- EntityListTable.svelte at ~3032 lines
- Toolbar functionality currently working

## Actions

### 4.1 Create EntityListToolbar Component

#### Step 4.1.1: Create Component File
**File**: `src/lib/components/entity-list-table/toolbar/EntityListToolbar.svelte`

**Create new component with toolbar template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { SearchBar, ViewModeToggle, DeletionFilterToggle, BulkActions } from '../toolbar';
  import {
    Search,
    SlidersHorizontal,
    RefreshCw,
    Plus,
    FilterX,
    ListCheck,
    ListX
  } from 'lucide-svelte';

  interface ToolbarProps {
    search: string;
    onSearchInput: (value: string) => void;
    searchPlaceholderKey?: string;
    selectedKeys: string[];
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    filtersOpen: boolean;
    onFiltersOpenChange: (open: boolean) => void;
    hasActiveFilters: boolean;
    onResetFilters: () => void;
    viewMode: 'table' | 'grid' | 'list';
    onViewModeChange: (mode: 'table' | 'grid' | 'list') => void;
    deletionFilterMode: string;
    onDeletionFilterModeChange: (mode: string) => void;
    toolbarMode: 'filters' | 'selection';
    onToolbarModeChange: (mode: 'filters' | 'selection') => void;
    refreshDisabled?: boolean;
    onRefresh: () => void;
    onCreateAction?: () => void;
    rowActionsEnabled?: boolean;
    bulkActionsEnabled?: boolean;
    exportEnabled?: boolean;
  }

  let {
    search,
    onSearchInput,
    searchPlaceholderKey,
    selectedKeys,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    filtersOpen,
    onFiltersOpenChange,
    hasActiveFilters,
    onResetFilters,
    viewMode,
    onViewModeChange,
    deletionFilterMode,
    onDeletionFilterModeChange,
    toolbarMode,
    onToolbarModeChange,
    refreshDisabled = false,
    onRefresh,
    onCreateAction,
    rowActionsEnabled = false,
    bulkActionsEnabled = true,
    exportEnabled = true
  }: ToolbarProps = $props();

  const $t = t;
</script>

<div class="flex items-center justify-between gap-2 mb-4">
  <div class="flex items-center gap-2 flex-1">
    <SearchBar
      search={search}
      onSearchInput={onSearchInput}
      searchPlaceholderKey={searchPlaceholderKey}
    />

    {#if hasActiveFilters}
      <Button
        variant="ghost"
        size="sm"
        onclick={onResetFilters}
        title={$t('entities.list.clearFilters')}
      >
        <FilterX class="h-4 w-4" />
      </Button>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    {#if onCreateAction}
      <Button onclick={onCreateAction} size="sm">
        <Plus class="h-4 w-4 mr-2" />
        {$t('common.create')}
      </Button>
    {/if}

    <ViewModeToggle
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
    />

    <DeletionFilterToggle
      deletionFilterMode={deletionFilterMode}
      onDeletionFilterModeChange={onDeletionFilterModeChange}
    />

    {#if bulkActionsEnabled && selectedKeys.length > 0}
      <BulkActions
        selectedKeys={selectedKeys}
        selectionLabelKey={selectionLabelKey}
        selectionLabelSingularKey={selectionLabelSingularKey}
        selectionLabelText={selectionLabelText}
        selectionLabelSingularText={selectionLabelSingularText}
        toolbarMode={toolbarMode}
        onToolbarModeChange={onToolbarModeChange}
      />
    {/if}

    <Button
      variant="ghost"
      size="sm"
      onclick={() => onFiltersOpenChange(!filtersOpen)}
      title={$t('entities.list.filters')}
    >
      <SlidersHorizontal class="h-4 w-4" />
      {#if hasActiveFilters}
        <Badge variant="secondary" class="ml-1 h-5 px-1.5 text-xs">
          {$t('common.active')}
        </Badge>
      {/if}
    </Button>

    <Button
      variant="ghost"
      size="sm"
      onclick={onRefresh}
      disabled={refreshDisabled}
      title={$t('common.refresh')}
    >
      <RefreshCw class="h-4 w-4" />
    </Button>
  </div>
</div>
```

#### Step 4.1.2: Export from Toolbar Index
**File**: `src/lib/components/entity-list-table/toolbar/index.ts`

**Create or update index file**:
```typescript
export { default as EntityListToolbar } from './EntityListToolbar.svelte';
```

### 4.2 Integrate EntityListToolbar Component

#### Step 4.2.1: Import Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add import** (after line 26, after existing toolbar imports):
```typescript
import { EntityListToolbar } from './toolbar';
```

#### Step 4.2.2: Find Toolbar Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find toolbar template section**:
```bash
grep -n "SearchBar\|ViewModeToggle\|DeletionFilterToggle" src/lib/components/entity-list-table/EntityListTable.svelte | head -20
```

**Identify the toolbar template section** (approximately lines 2000-2200)

#### Step 4.2.3: Replace Toolbar Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the entire toolbar template section** with:
```svelte
<EntityListToolbar
  search={search}
  onSearchInput={onSearchInput}
  searchPlaceholderKey={searchPlaceholderKey}
  selectedKeys={selectedKeys}
  selectionLabelKey={selectionLabelKey}
  selectionLabelSingularKey={selectionLabelSingularKey}
  selectionLabelText={selectionLabelText}
  selectionLabelSingularText={selectionLabelSingularText}
  filtersOpen={filtersOpen}
  onFiltersOpenChange={(open) => filtersOpen = open}
  hasActiveFilters={searchFilter.hasActiveFilters}
  onResetFilters={searchFilter.resetAllFilters}
  viewMode={viewMode}
  onViewModeChange={onViewModeChange}
  deletionFilterMode={deletionFilterMode}
  onDeletionFilterModeChange={onDeletionFilterModeChange}
  toolbarMode={toolbarMode}
  onToolbarModeChange={(mode) => toolbarMode = mode}
  refreshDisabled={refreshDisabled}
  onRefresh={onRefresh}
  onCreateAction={onCreateAction}
  rowActionsEnabled={rowActionsEnabled}
  bulkActionsEnabled={rowSelectionEnabled}
  exportEnabled={true}
/>
```

#### Step 4.2.4: Remove Unused Toolbar Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find toolbar-related imports**:
```bash
grep -n "import.*SearchBar\|import.*ViewModeToggle\|import.*DeletionFilterToggle\|import.*BulkActions" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these imports** (lines 26-27 approximately):
```typescript
import { SearchBar, ViewModeToggle, DeletionFilterToggle, BulkActions } from './toolbar';
```

**Note**: Keep the EntityListToolbar import, remove the individual component imports

#### Step 4.2.5: Remove Toolbar-Related Icons
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find toolbar-related icon imports**:
```bash
grep -n "Search\|SlidersHorizontal\|RefreshCw\|Plus\|FilterX" src/lib/components/entity-list-table/EntityListTable.svelte | head -10
```

**Remove unused icon imports** if they are only used in the toolbar:
```typescript
// Remove these if only used in toolbar:
Search,
SlidersHorizontal,
RefreshCw,
Plus,
FilterX,
```

**Note**: Keep icons that are used elsewhere in the component

### 4.3 Cleanup and Verification

#### Step 4.3.1: Remove Unused Toolbar Handlers
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any toolbar-specific handler functions**:
```bash
grep -n "function.*toolbar\|handleToolbar" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove any unused toolbar-specific functions**

#### Step 4.3.2: Verify Props Passing
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Verify all required props are passed to EntityListToolbar**:
- search ✅
- onSearchInput ✅
- searchPlaceholderKey ✅
- selectedKeys ✅
- selectionLabelKey ✅
- selectionLabelSingularKey ✅
- selectionLabelText ✅
- selectionLabelSingularText ✅
- filtersOpen ✅
- onFiltersOpenChange ✅
- hasActiveFilters ✅
- onResetFilters ✅
- viewMode ✅
- onViewModeChange ✅
- deletionFilterMode ✅
- onDeletionFilterModeChange ✅
- toolbarMode ✅
- onToolbarModeChange ✅
- refreshDisabled ✅
- onRefresh ✅
- onCreateAction ✅
- rowActionsEnabled ✅
- bulkActionsEnabled ✅
- exportEnabled ✅

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
Test the following toolbar functionality:
1. Search input functionality
2. View mode toggle (table/grid/list)
3. Deletion filter toggle
4. Bulk actions when rows are selected
5. Filter panel toggle
6. Clear filters button
7. Refresh button
8. Create action button (if enabled)
9. Verify toolbar responsive layout
10. Verify toolbar state persistence

**Expected**: All toolbar functionality works correctly

### Step 4: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~2832 lines (reduction of ~200 lines from ~3032)

## Acceptance Criteria
- ✅ EntityListToolbar component created
- ✅ Toolbar template extracted to component
- ✅ EntityListTable uses EntityListToolbar component
- ✅ All required props passed correctly
- ✅ No inline toolbar template remains
- ✅ Unused toolbar imports removed
- ✅ No compilation errors
- ✅ All toolbar functionality works correctly
- ✅ Line count reduced by ~200 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually restore inline toolbar template
3. Remove EntityListToolbar component
4. Restore toolbar imports
5. Document what failed and why

## Notes
- This phase extracts the toolbar to a separate component
- The toolbar component is self-contained with its own template
- Props are passed from parent to child component
- This is a low complexity, low risk extraction
- Toolbar is a well-defined UI section with clear boundaries
- Test toolbar thoroughly as it's a primary user interaction point
- Ensure all toolbar state management still works correctly
