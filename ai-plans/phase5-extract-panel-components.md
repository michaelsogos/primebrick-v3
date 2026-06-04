# Phase 5: Extract Panel Components

## Overview
Extract the FiltersPanel, ColumnSelectorPanel, and SearchInPanel template sections from EntityListTable.svelte into separate panel components.

## Expected Reduction
~300 lines (7%) - from ~2832 to ~2532 lines

## Current State Analysis

### Panel Templates (Inline)
- FiltersPanel template section (~100 lines)
- ColumnSelectorPanel template section (~100 lines)
- SearchInPanel template section (~100 lines)
- Panel-related state management
- Panel-related handlers

### Panel Handlers (Inline)
- Panel-specific event handlers
- Panel state management
- Panel open/close logic

### Template References
- Panel sections in main template
- Panel-related conditional rendering
- Panel props passing

## Target State
- FiltersPanel extracted to separate component
- ColumnSelectorPanel extracted to separate component
- SearchInPanel extracted to separate component
- EntityListTable uses panel components
- No inline panel templates remain
- All panel functionality works correctly

## Prerequisites
- Phase 1 completed successfully
- Phase 2 completed successfully
- Phase 3 completed successfully
- Phase 4 completed successfully
- EntityListTable.svelte at ~2832 lines
- Panel functionality currently working

## Actions

### 5.1 Create FiltersPanel Component

#### Step 5.1.1: Create Component File
**File**: `src/lib/components/entity-list-table/panels/FiltersPanel.svelte`

**Create new component with filters panel template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { Funnel, X, Plus, Trash2 } from 'lucide-svelte';

  interface FiltersPanelProps {
    columns: MetaColumn[];
    filterValues: Record<string, any>;
    onFilterValueChange: (field: string, value: any) => void;
    onResetFilters: () => void;
    advancedFilters: Array<{
      field: string;
      operator: string;
      value: any;
      connector: string;
    }>;
    onAdvancedFilterAdd: () => void;
    onAdvancedFilterRemove: (index: number) => void;
    onAdvancedFilterChange: (index: number, filter: any) => void;
  }

  let {
    columns,
    filterValues,
    onFilterValueChange,
    onResetFilters,
    advancedFilters,
    onAdvancedFilterAdd,
    onAdvancedFilterRemove,
    onAdvancedFilterChange
  }: FiltersPanelProps = $props();

  const $t = t;

  function getFilterOperators(column: MetaColumn) {
    switch (column.type) {
      case 'text':
        return [
          { value: '=', label: $t('entities.list.operators.equals') },
          { value: '!=', label: $t('entities.list.operators.notEquals') },
          { value: 'contains', label: $t('entities.list.operators.contains') },
          { value: 'startsWith', label: $t('entities.list.operators.startsWith') },
          { value: 'endsWith', label: $t('entities.list.operators.endsWith') }
        ];
      case 'number':
        return [
          { value: '=', label: $t('entities.list.operators.equals') },
          { value: '!=', label: $t('entities.list.operators.notEquals') },
          { value: '>', label: $t('entities.list.operators.greaterThan') },
          { value: '<', label: $t('entities.list.operators.lessThan') },
          { value: '>=', label: $t('entities.list.operators.greaterThanOrEqual') },
          { value: '<=', label: $t('entities.list.operators.lessThanOrEqual') }
        ];
      case 'date':
      case 'datetime':
        return [
          { value: '=', label: $t('entities.list.operators.equals') },
          { value: '!=', label: $t('entities.list.operators.notEquals') },
          { value: '>', label: $t('entities.list.operators.after') },
          { value: '<', label: $t('entities.list.operators.before') },
          { value: 'BETWEEN', label: $t('entities.list.operators.between') }
        ];
      case 'badge':
        return [
          { value: '=', label: $t('entities.list.operators.equals') },
          { value: '!=', label: $t('entities.list.operators.notEquals') }
        ];
      default:
        return [
          { value: '=', label: $t('entities.list.operators.equals') },
          { value: '!=', label: $t('entities.list.operators.notEquals') }
        ];
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold flex items-center gap-2">
      <Funnel class="h-5 w-5" />
      {$t('entities.list.filters')}
    </h3>
    <Button variant="ghost" size="sm" onclick={onResetFilters}>
      <X class="h-4 w-4 mr-2" />
      {$t('common.reset')}
    </Button>
  </div>

  <!-- Basic Filters -->
  <div class="space-y-3">
    {#each columns as column}
      {#if column.filterable !== false}
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium w-32 shrink-0">
            {column.label}
          </label>
          {#if column.type === 'badge' && column.options}
            <div class="flex flex-wrap gap-1">
              {#each column.options as option}
                <Badge
                  variant={filterValues[column.key]?.includes(option.value) ? 'default' : 'outline'}
                  class="cursor-pointer"
                  onclick={() => {
                    const current = filterValues[column.key] || [];
                    const newValue = current.includes(option.value)
                      ? current.filter((v: string) => v !== option.value)
                      : [...current, option.value];
                    onFilterValueChange(column.key, newValue);
                  }}
                >
                  {option.label}
                </Badge>
              {/each}
            </div>
          {:else}
            <Input
              type={column.type === 'number' ? 'number' : 'text'}
              value={filterValues[column.key] || ''}
              onchange={(e) => onFilterValueChange(column.key, e.target.value)}
              class="flex-1"
            />
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <!-- Advanced Filters -->
  <div class="border-t pt-4">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-medium">
        {$t('entities.list.advancedFilters')}
      </h4>
      <Button variant="outline" size="sm" onclick={onAdvancedFilterAdd}>
        <Plus class="h-4 w-4 mr-2" />
        {$t('common.add')}
      </Button>
    </div>

    {#each advancedFilters as filter, index}
      <div class="flex items-center gap-2 mb-2">
        <select
          value={filter.field}
          onchange={(e) => onAdvancedFilterChange(index, { ...filter, field: e.target.value })}
          class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">{$t('entities.list.selectField')}</option>
          {#each columns as column}
            <option value={column.key}>{column.label}</option>
          {/each}
        </select>

        {#if filter.field}
          {@const column = columns.find(c => c.key === filter.field)}
          {#if column}
            <select
              value={filter.operator}
              onchange={(e) => onAdvancedFilterChange(index, { ...filter, operator: e.target.value })}
              class="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {#each getFilterOperators(column) as operator}
                <option value={operator.value}>{operator.label}</option>
              {/each}
            </select>

            <Input
              value={filter.value}
              onchange={(e) => onAdvancedFilterChange(index, { ...filter, value: e.target.value })}
              class="flex-1"
            />

            <Button
              variant="ghost"
              size="sm"
              onclick={() => onAdvancedFilterRemove(index)}
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
</div>
```

#### Step 5.1.2: Export from Panels Index
**File**: `src/lib/components/entity-list-table/panels/index.ts`

**Create or update index file**:
```typescript
export { default as FiltersPanel } from './FiltersPanel.svelte';
```

### 5.2 Create ColumnSelectorPanel Component

#### Step 5.2.1: Create Component File
**File**: `src/lib/components/entity-list-table/panels/ColumnSelectorPanel.svelte`

**Create new component with column selector panel template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Columns3, RotateCcw } from 'lucide-svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  interface ColumnSelectorPanelProps {
    columns: MetaColumn[];
    visibleKeys: string[];
    onVisibleKeysChange: (keys: string[]) => void;
    onResetColumnVisibility: (view: string) => void;
    viewName?: string;
  }

  let {
    columns,
    visibleKeys,
    onVisibleKeysChange,
    onResetColumnVisibility,
    viewName = 'default'
  }: ColumnSelectorPanelProps = $props();

  const $t = t;

  function handleColumnToggle(key: string) {
    if (visibleKeys.includes(key)) {
      onVisibleKeysChange(visibleKeys.filter(k => k !== key));
    } else {
      onVisibleKeysChange([...visibleKeys, key]);
    }
  }

  function handleSelectAll() {
    onVisibleKeysChange(columns.map(col => col.key));
  }

  function handleDeselectAll() {
    onVisibleKeysChange([]);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold flex items-center gap-2">
      <Columns3 class="h-5 w-5" />
      {$t('entities.list.columns')}
    </h3>
    <div class="flex gap-2">
      <Button variant="ghost" size="sm" onclick={handleSelectAll}>
        {$t('common.selectAll')}
      </Button>
      <Button variant="ghost" size="sm" onclick={handleDeselectAll}>
        {$t('common.deselectAll')}
      </Button>
      <Button variant="ghost" size="sm" onclick={() => onResetColumnVisibility(viewName)}>
        <RotateCcw class="h-4 w-4 mr-2" />
        {$t('common.reset')}
      </Button>
    </div>
  </div>

  <div class="space-y-2 max-h-96 overflow-y-auto">
    {#each columns as column}
      <div class="flex items-center gap-2">
        <Checkbox
          checked={visibleKeys.includes(column.key)}
          onchange={() => handleColumnToggle(column.key)}
        />
        <label class="text-sm cursor-pointer flex-1">
          {column.label}
        </label>
      </div>
    {/each}
  </div>
</div>
```

#### Step 5.2.2: Export from Panels Index
**File**: `src/lib/components/entity-list-table/panels/index.ts`

**Add export**:
```typescript
export { default as ColumnSelectorPanel } from './ColumnSelectorPanel.svelte';
```

### 5.3 Create SearchInPanel Component

#### Step 5.3.1: Create Component File
**File**: `src/lib/components/entity-list-table/panels/SearchInPanel.svelte`

**Create new component with search-in panel template**:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Search, X } from 'lucide-svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  interface SearchInPanelProps {
    columns: MetaColumn[];
    searchInKeys: string[] | null;
    onSearchInKeyToggle: (key: string) => void;
  }

  let {
    columns,
    searchInKeys,
    onSearchInKeyToggle
  }: SearchInPanelProps = $props();

  const $t = t;

  const searchableColumns = $derived(columns.filter(col => col.searchable !== false));
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold flex items-center gap-2">
      <Search class="h-5 w-5" />
      {$t('entities.list.searchIn')}
    </h3>
    {#if searchInKeys && searchInKeys.length > 0}
      <Button variant="ghost" size="sm" onclick={() => onSearchInKeyToggle('')}>
        <X class="h-4 w-4 mr-2" />
        {$t('common.clear')}
      </Button>
    {/if}
  </div>

  <div class="flex flex-wrap gap-2">
    {#each searchableColumns as column}
      <Badge
        variant={searchInKeys?.includes(column.key) ? 'default' : 'outline'}
        class="cursor-pointer"
        onclick={() => onSearchInKeyToggle(column.key)}
      >
        {column.label}
      </Badge>
    {/each}
  </div>

  {#if !searchInKeys || searchInKeys.length === 0}
    <p class="text-sm text-muted-foreground">
      {$t('entities.list.searchInAllColumns')}
    </p>
  {:else}
    <p class="text-sm text-muted-foreground">
      {$t('entities.list.searchingInColumns', { count: searchInKeys.length })}
    </p>
  {/if}
</div>
```

#### Step 5.3.2: Export from Panels Index
**File**: `src/lib/components/entity-list-table/panels/index.ts`

**Add export**:
```typescript
export { default as SearchInPanel } from './SearchInPanel.svelte';
```

### 5.4 Integrate Panel Components

#### Step 5.4.1: Import Panel Components
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add import** (after line 25, after existing panels import):
```typescript
import { FiltersPanel, ColumnSelectorPanel, SearchInPanel } from './panels';
```

#### Step 5.4.2: Find FiltersPanel Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find filters panel template**:
```bash
grep -n "FiltersPanel" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the filters panel template section** (approximately lines 2200-2300)

#### Step 5.4.3: Replace FiltersPanel Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the filters panel template section** with:
```svelte
<FiltersPanel
  columns={dataColumns}
  filterValues={filterValues}
  onFilterValueChange={searchFilter.handleFilterValueChange}
  onResetFilters={searchFilter.resetAllFilters}
  advancedFilters={advancedFilters}
  onAdvancedFilterAdd={searchFilter.handleAdvancedFilterAdd}
  onAdvancedFilterRemove={searchFilter.handleAdvancedFilterRemove}
  onAdvancedFilterChange={searchFilter.handleAdvancedFilterChange}
/>
```

#### Step 5.4.4: Find ColumnSelectorPanel Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find column selector panel template**:
```bash
grep -n "ColumnSelectorPanel" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the column selector panel template section** (approximately lines 2300-2400)

#### Step 5.4.5: Replace ColumnSelectorPanel Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the column selector panel template section** with:
```svelte
<ColumnSelectorPanel
  columns={columns}
  visibleKeys={visibleKeys}
  onVisibleKeysChange={onVisibleKeysChange}
  onResetColumnVisibility={onResetColumnVisibility}
  viewName="default"
/>
```

#### Step 5.4.6: Find SearchInPanel Template Section
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find search-in panel template**:
```bash
grep -n "SearchInPanel" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Identify the search-in panel template section** (approximately lines 2400-2500)

#### Step 5.4.7: Replace SearchInPanel Template with Component
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Replace the search-in panel template section** with:
```svelte
<SearchInPanel
  columns={dataColumns}
  searchInKeys={searchInKeys}
  onSearchInKeyToggle={searchFilter.handleSearchInKeyToggle}
/>
```

#### Step 5.4.8: Remove Unused Panel Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find panel-related imports**:
```bash
grep -n "import.*FiltersPanel\|import.*ColumnSelectorPanel\|import.*SearchInPanel" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these imports** (line 25 approximately):
```typescript
import { FiltersPanel, VersionHistoryPanel, SearchInPanel, ColumnSelectorPanel } from './panels';
```

**Replace with**:
```typescript
import { VersionHistoryPanel } from './panels';
import { FiltersPanel, ColumnSelectorPanel, SearchInPanel } from './panels';
```

#### Step 5.4.9: Remove Panel-Related Helper Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for panel-specific helper functions**:
```bash
grep -n "function.*getFilterOperators\|function.*handleColumnToggle" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove any panel-specific helper functions** that are now in the panel components

### 5.5 Cleanup and Verification

#### Step 5.5.1: Remove Unused Panel State
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any panel-specific state variables**:
```bash
grep -n "let.*panel\|panel.*\$state" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove any unused panel-specific state variables**

#### Step 5.5.2: Verify Props Passing
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Verify all required props are passed to each panel component**:

**FiltersPanel**:
- columns ✅
- filterValues ✅
- onFilterValueChange ✅
- onResetFilters ✅
- advancedFilters ✅
- onAdvancedFilterAdd ✅
- onAdvancedFilterRemove ✅
- onAdvancedFilterChange ✅

**ColumnSelectorPanel**:
- columns ✅
- visibleKeys ✅
- onVisibleKeysChange ✅
- onResetColumnVisibility ✅
- viewName ✅

**SearchInPanel**:
- columns ✅
- searchInKeys ✅
- onSearchInKeyToggle ✅

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
Test the following panel functionality:
1. Open filters panel
2. Set basic filters
3. Add advanced filters
4. Remove advanced filters
5. Reset filters
6. Open column selector panel
7. Toggle column visibility
8. Select/deselect all columns
9. Reset column visibility
10. Open search-in panel
11. Toggle search-in columns
12. Clear search-in selection

**Expected**: All panel functionality works correctly

### Step 4: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~2532 lines (reduction of ~300 lines from ~2832)

## Acceptance Criteria
- ✅ FiltersPanel component created
- ✅ ColumnSelectorPanel component created
- ✅ SearchInPanel component created
- ✅ All panel templates extracted to components
- ✅ EntityListTable uses panel components
- ✅ All required props passed correctly
- ✅ No inline panel templates remain
- ✅ Unused panel imports removed
- ✅ No compilation errors
- ✅ All panel functionality works correctly
- ✅ Line count reduced by ~300 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually restore inline panel templates
3. Remove panel components
4. Restore panel imports
5. Document what failed and why

## Notes
- This phase extracts panels to separate components
- Each panel is self-contained with its own template and logic
- Props are passed from parent to child components
- This is a low complexity, low risk extraction
- Panels are well-defined UI sections with clear boundaries
- Test each panel thoroughly as they contain complex UI logic
- Ensure all panel state management still works correctly
- Filter operators logic is now in FiltersPanel component
