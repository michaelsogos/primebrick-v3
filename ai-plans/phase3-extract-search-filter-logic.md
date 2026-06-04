# Phase 3: Extract Search and Filter Logic

## Overview
Extract search input handling, search-in-columns logic, filter value handling, advanced filter handling, and filter reset logic from EntityListTable.svelte into a dedicated useSearchFilter composable.

## Expected Reduction
~400 lines (10%) - from ~3432 to ~3032 lines

## Current State Analysis

### Search and Filter State (Inline)
- search: string (prop)
- searchInKeys: string[] | null (prop)
- filterValues: Record<string, any> (prop)
- advancedFilters: AdvancedFilter[] (prop)
- Related state variables

### Search and Filter Functions (Inline)
- handleSearchInput()
- handleSearchInKeyToggle()
- handleFilterValueChange()
- handleAdvancedFilterAdd()
- handleAdvancedFilterRemove()
- handleAdvancedFilterChange()
- resetAllFilters()
- hasActiveFilters logic

### Template References
- Search input template section
- Search-in-columns UI
- Filter panels
- Advanced filter UI
- Filter reset buttons

## Target State
- Search and filter logic managed by useSearchFilter composable
- Search and filter handlers in useSearchFilter composable
- EntityListTable uses composable methods
- No inline search/filter handler functions remain
- All search/filter functionality works correctly

## Prerequisites
- Phase 1 completed successfully
- Phase 2 completed successfully
- EntityListTable.svelte at ~3432 lines
- Search and filter functionality currently working

## Actions

### 3.1 Create useSearchFilter Composable

#### Step 3.1.1: Create Composable File
**File**: `src/lib/components/entity-list-table/composables/useSearchFilter.svelte.ts`

**Create new file with interface and implementation**:

```typescript
import type { MetaColumn, AdvancedFilter } from '$lib/entity-list/types';

export interface SearchFilterOptions {
  search: string;
  onSearchInput: (value: string) => void;
  searchInKeys: string[] | null;
  onSearchInKeysChange: (keys: string[] | null) => void;
  filterValues: Record<string, any>;
  onFilterValuesChange: (values: Record<string, any>) => void;
  onResetFilters: () => void;
  advancedFilters: AdvancedFilter[];
  onAdvancedFiltersChange: (filters: AdvancedFilter[]) => void;
  columns: MetaColumn[];
  searchableColumns?: MetaColumn[];
}

export interface SearchFilterReturn {
  handleSearchInput: (value: string) => void;
  handleSearchInKeyToggle: (key: string) => void;
  handleFilterValueChange: (field: string, value: any) => void;
  handleAdvancedFilterAdd: () => void;
  handleAdvancedFilterRemove: (index: number) => void;
  handleAdvancedFilterChange: (index: number, filter: AdvancedFilter) => void;
  hasActiveFilters: boolean;
  hasActiveSearch: boolean;
  resetAllFilters: () => void;
  getSearchableColumns: () => MetaColumn[];
}

export function useSearchFilter(options: SearchFilterOptions): SearchFilterReturn {
  const {
    search,
    onSearchInput,
    searchInKeys,
    onSearchInKeysChange,
    filterValues,
    onFilterValuesChange,
    onResetFilters,
    advancedFilters,
    onAdvancedFiltersChange,
    columns,
    searchableColumns: searchableColumnsProp
  } = options;

  function handleSearchInput(value: string) {
    onSearchInput(value);
  }

  function handleSearchInKeyToggle(key: string) {
    if (!searchInKeys) {
      onSearchInKeysChange([key]);
      return;
    }

    if (searchInKeys.includes(key)) {
      const newKeys = searchInKeys.filter(k => k !== key);
      onSearchInKeysChange(newKeys.length > 0 ? newKeys : null);
    } else {
      onSearchInKeysChange([...searchInKeys, key]);
    }
  }

  function handleFilterValueChange(field: string, value: any) {
    onFilterValuesChange({
      ...filterValues,
      [field]: value
    });
  }

  function handleAdvancedFilterAdd() {
    onAdvancedFiltersChange([
      ...advancedFilters,
      {
        field: '',
        operator: '=',
        value: '',
        connector: 'AND'
      }
    ]);
  }

  function handleAdvancedFilterRemove(index: number) {
    const newFilters = advancedFilters.filter((_, i) => i !== index);
    onAdvancedFiltersChange(newFilters);
  }

  function handleAdvancedFilterChange(index: number, filter: AdvancedFilter) {
    const newFilters = [...advancedFilters];
    newFilters[index] = filter;
    onAdvancedFiltersChange(newFilters);
  }

  function resetAllFilters() {
    onFilterValuesChange({});
    onAdvancedFiltersChange([]);
    onResetFilters();
  }

  const hasActiveFilters = $derived(
    Object.keys(filterValues).length > 0 || advancedFilters.length > 0
  );

  const hasActiveSearch = $derived(search.length > 0);

  function getSearchableColumns(): MetaColumn[] {
    if (searchableColumnsProp) {
      return searchableColumnsProp;
    }
    return columns.filter(col => col.searchable !== false);
  }

  return {
    handleSearchInput,
    handleSearchInKeyToggle,
    handleFilterValueChange,
    handleAdvancedFilterAdd,
    handleAdvancedFilterRemove,
    handleAdvancedFilterChange,
    get hasActiveFilters() { return hasActiveFilters; },
    get hasActiveSearch() { return hasActiveSearch; },
    resetAllFilters,
    getSearchableColumns
  };
}
```

#### Step 3.1.2: Export from Composables Index
**File**: `src/lib/components/entity-list-table/composables/index.ts`

**Add export**:
```typescript
export { useSearchFilter } from './useSearchFilter.svelte.js';
export type { SearchFilterOptions, SearchFilterReturn } from './useSearchFilter.svelte.js';
```

### 3.2 Integrate useSearchFilter

#### Step 3.2.1: Import Composable
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add import** (after line 37, after existing composables import):
```typescript
import { useSearchFilter } from './composables/useSearchFilter.svelte.js';
```

#### Step 3.2.2: Initialize Composable
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add initialization** (after previewPanel initialization, around line 1910):
```typescript
const searchFilter = useSearchFilter({
  search: search,
  onSearchInput: onSearchInput,
  searchInKeys: searchInKeys,
  onSearchInKeysChange: onSearchInKeysChange,
  filterValues: filterValues,
  onFilterValuesChange: onFilterValuesChange,
  onResetFilters: onResetFilters,
  advancedFilters: advancedFilters,
  onAdvancedFiltersChange: onAdvancedFiltersChange,
  columns: columns,
  searchableColumns: dataColumns
});
```

#### Step 3.2.3: Remove Inline Search Handler Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find and remove search handler functions**:
```bash
grep -n "function handleSearchInput" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "function handleSearchInKeyToggle" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these functions** (approximately lines 950-980):
```typescript
function handleSearchInput(value: string) {
  onSearchInput(value);
}

function handleSearchInKeyToggle(key: string) {
  if (!searchInKeys) {
    onSearchInKeysChange([key]);
    return;
  }

  if (searchInKeys.includes(key)) {
    const newKeys = searchInKeys.filter(k => k !== key);
    onSearchInKeysChange(newKeys.length > 0 ? newKeys : null);
  } else {
    onSearchInKeysChange([...searchInKeys, key]);
  }
}
```

#### Step 3.2.4: Remove Inline Filter Handler Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find and remove filter handler functions**:
```bash
grep -n "function handleFilterValueChange" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "function handleAdvancedFilterAdd" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "function handleAdvancedFilterRemove" src/lib/components/entity-list-table/EntityListTable.svelte
grep -n "function handleAdvancedFilterChange" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove these functions** (approximately lines 980-1050):
```typescript
function handleFilterValueChange(field: string, value: any) {
  onFilterValuesChange({
    ...filterValues,
    [field]: value
  });
}

function handleAdvancedFilterAdd() {
  onAdvancedFiltersChange([
    ...advancedFilters,
    {
      field: '',
      operator: '=',
      value: '',
      connector: 'AND'
    }
  ]);
}

function handleAdvancedFilterRemove(index: number) {
  const newFilters = advancedFilters.filter((_, i) => i !== index);
  onAdvancedFiltersChange(newFilters);
}

function handleAdvancedFilterChange(index: number, filter: AdvancedFilter) {
  const newFilters = [...advancedFilters];
  newFilters[index] = filter;
  onAdvancedFiltersChange(newFilters);
}
```

#### Step 3.2.5: Remove Inline Filter Reset Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find and remove filter reset function**:
```bash
grep -n "function resetAllFilters" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove this function** (approximately lines 1050-1060):
```typescript
function resetAllFilters() {
  onFilterValuesChange({});
  onAdvancedFiltersChange([]);
  onResetFilters();
}
```

#### Step 3.2.6: Remove Inline hasActiveFilters Logic
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find and remove hasActiveFilters derived state**:
```bash
grep -n "hasActiveFilters" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove this derived state** (approximately lines 700-710):
```typescript
const hasActiveFilters = $derived(
  Object.keys(filterValues).length > 0 || advancedFilters.length > 0
);
```

#### Step 3.2.7: Update Template References - Search Input
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find search input template**:
```bash
grep -n "handleSearchInput" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable handler**:
```svelte
<!-- Before -->
<SearchBar
  search={search}
  onSearchInput={handleSearchInput}
  ...
/>

<!-- After -->
<SearchBar
  search={search}
  onSearchInput={searchFilter.handleSearchInput}
  ...
/>
```

#### Step 3.2.8: Update Template References - SearchIn
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find search-in template**:
```bash
grep -n "handleSearchInKeyToggle" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable handler**:
```svelte
<!-- Before -->
<SearchInPanel
  searchInKeys={searchInKeys}
  onSearchInKeyToggle={handleSearchInKeyToggle}
  ...
/>

<!-- After -->
<SearchInPanel
  searchInKeys={searchInKeys}
  onSearchInKeyToggle={searchFilter.handleSearchInKeyToggle}
  ...
/>
```

#### Step 3.2.9: Update Template References - Filter Values
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find filter value handlers**:
```bash
grep -n "handleFilterValueChange" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable handler**:
```svelte
<!-- Before -->
<Input
  value={filterValues[field]}
  onchange={(e) => handleFilterValueChange(field, e.target.value)}
/>

<!-- After -->
<Input
  value={filterValues[field]}
  onchange={(e) => searchFilter.handleFilterValueChange(field, e.target.value)}
/>
```

#### Step 3.2.10: Update Template References - Advanced Filters
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find advanced filter handlers**:
```bash
grep -n "handleAdvancedFilter" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable handlers**:
```svelte
<!-- Before -->
<Button onclick={handleAdvancedFilterAdd}>Add Filter</Button>
<Button onclick={() => handleAdvancedFilterRemove(index)}>Remove</Button>
<AdvancedFilter onchange={(filter) => handleAdvancedFilterChange(index, filter)} />

<!-- After -->
<Button onclick={searchFilter.handleAdvancedFilterAdd}>Add Filter</Button>
<Button onclick={() => searchFilter.handleAdvancedFilterRemove(index)}>Remove</Button>
<AdvancedFilter onchange={(filter) => searchFilter.handleAdvancedFilterChange(index, filter)} />
```

#### Step 3.2.11: Update Template References - Filter Reset
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find filter reset buttons**:
```bash
grep -n "resetAllFilters" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable handler**:
```svelte
<!-- Before -->
<Button onclick={resetAllFilters}>Reset Filters</Button>

<!-- After -->
<Button onclick={searchFilter.resetAllFilters}>Reset Filters</Button>
```

#### Step 3.2.12: Update Template References - hasActiveFilters
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find hasActiveFilters references**:
```bash
grep -n "hasActiveFilters" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable state**:
```svelte
<!-- Before -->
{#if hasActiveFilters}
  <Button onclick={resetAllFilters}>Clear Filters</Button>
{/if}

<!-- After -->
{#if searchFilter.hasActiveFilters}
  <Button onclick={searchFilter.resetAllFilters}>Clear Filters</Button>
{/if}
```

#### Step 3.2.13: Update Searchable Columns Logic
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find searchable columns logic**:
```bash
grep -n "searchableColumns" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace with composable method**:
```svelte
<!-- Before -->
{#each columns.filter(col => col.searchable !== false) as column}
  ...
{/each}

<!-- After -->
{#each searchFilter.getSearchableColumns() as column}
  ...
{/each}
```

### 3.3 Cleanup and Verification

#### Step 3.3.1: Remove Unused Variables
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any remaining search/filter-related variables**:
```bash
grep -n "hasActiveFilters" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove any unused search/filter variables**

#### Step 3.3.2: Remove Unused Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any remaining search/filter-related functions**:
```bash
grep -n "function handleSearch\|function handleFilter\|function resetAllFilters" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove any unused search/filter functions**

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
Test the following search and filter functionality:
1. Type in search input
2. Toggle search-in columns
3. Set filter values
4. Add advanced filters
5. Remove advanced filters
6. Modify advanced filters
7. Reset all filters
8. Verify hasActiveFilters state updates correctly
9. Verify searchable columns are displayed correctly

**Expected**: All search and filter functionality works correctly

### Step 4: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~3032 lines (reduction of ~400 lines from ~3432)

## Acceptance Criteria
- ✅ useSearchFilter composable created and exported
- ✅ Search and filter logic managed by composable
- ✅ Search and filter handlers in composable
- ✅ EntityListTable uses composable methods
- ✅ No inline search/filter handler functions remain
- ✅ No inline hasActiveFilters logic remains
- ✅ Template uses composable methods and state
- ✅ No compilation errors
- ✅ All search and filter functionality works correctly
- ✅ Line count reduced by ~400 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually restore inline search/filter functions
3. Remove useSearchFilter composable
4. Document what failed and why

## Notes
- This phase extracts search and filter logic to a dedicated composable
- The composable manages all search and filter interactions
- Advanced filter logic is included in the composable
- Filter reset logic is abstracted in the composable
- Template updates are moderate due to search/filter references
- Test search and filter functionality thoroughly
- This is considered medium complexity due to filter logic complexity
