# Phase 7: Extract Utility Functions

## Overview
Extract helper functions, type utilities, and constants from EntityListTable.svelte into a separate utils.ts file.

## Expected Reduction
~100 lines (2%) - from ~2332 to ~2232 lines

## Current State Analysis

### Utility Functions (Inline)
- rowKey function
- isRowDeleted function
- formatCellValue function
- getCellValue function
- Other helper functions

### Type Utilities (Inline)
- Type guards
- Type assertions
- Type helper functions

### Constants (Inline)
- Default values
- Configuration constants
- Magic numbers

## Target State
- Utility functions extracted to utils.ts
- Type utilities extracted to utils.ts
- Constants extracted to utils.ts
- EntityListTable imports utilities from utils.ts
- No inline utility functions remain
- All functionality works correctly

## Prerequisites
- Phase 1 completed successfully
- Phase 2 completed successfully
- Phase 3 completed successfully
- Phase 4 completed successfully
- Phase 5 completed successfully
- Phase 6 completed successfully
- EntityListTable.svelte at ~2332 lines
- All functionality currently working

## Actions

### 7.1 Create Utils File

#### Step 7.1.1: Create Utils File
**File**: `src/lib/components/entity-list-table/utils.ts`

**Create new file with utility functions**:

```typescript
import type { MetaColumn } from '$lib/entity-list/types';
import { formatListCellValue } from '$lib/i18n/date-format';
import { defaultVisibleColumnKeys, formatDatetimeCellDisplay } from '$lib/entity-list';

/**
 * Get the unique key for a row
 */
export function getRowKey<T extends Record<string, unknown>>(
  row: T,
  uid: string
): string {
  return String(row[uid]);
}

/**
 * Check if a row is deleted
 */
export function isRowDeleted<T extends Record<string, unknown>>(
  row: T,
  deletionFilterMode: string
): boolean {
  if (deletionFilterMode === 'all') {
    return false;
  }
  if (deletionFilterMode === 'deleted_only') {
    return !!(row.deleted_at as boolean);
  }
  // non_deleted (default)
  return !!(row.deleted_at as boolean);
}

/**
 * Get the value for a column from a row
 */
export function getCellValue<T extends Record<string, unknown>>(
  row: T,
  column: MetaColumn
): unknown {
  return row[column.key];
}

/**
 * Format a cell value for display
 */
export function formatCellValue(
  value: unknown,
  column: MetaColumn,
  uiLang: string,
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>,
  datetimeIanaRenderTick: number
): string {
  if (value === null || value === undefined) {
    return '';
  }

  switch (column.type) {
    case 'text':
      return String(value);
    
    case 'number':
      return String(value);
    
    case 'date':
    case 'datetime':
      return formatDatetimeCellDisplay(
        value as string,
        column,
        uiLang,
        datetimeIanaModeByKey,
        datetimeIanaRenderTick
      );
    
    case 'badge':
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    
    case 'boolean':
      return value ? 'Yes' : 'No';
    
    case 'currency':
      return new Intl.NumberFormat(uiLang, {
        style: 'currency',
        currency: (column.currency || 'USD') as string
      }).format(Number(value));
    
    default:
      return String(value);
  }
}

/**
 * Get cell display class based on column type
 */
export function getCellClass(column: MetaColumn): string {
  const baseClass = 'px-4 py-3';
  
  switch (column.type) {
    case 'number':
    case 'currency':
      return `${baseClass} text-right`;
    case 'date':
    case 'datetime':
      return `${baseClass} text-center`;
    default:
      return `${baseClass} text-left`;
  }
}

/**
 * Check if a column is sortable
 */
export function isColumnSortable(column: MetaColumn): boolean {
  return column.sortable !== false;
}

/**
 * Check if a column is filterable
 */
export function isColumnFilterable(column: MetaColumn): boolean {
  return column.filterable !== false;
}

/**
 * Check if a column is searchable
 */
export function isColumnSearchable(column: MetaColumn): boolean {
  return column.searchable !== false;
}

/**
 * Get default sort direction for a column
 */
export function getDefaultSortDir(column: MetaColumn): 'asc' | 'desc' {
  return column.defaultSortDir || 'asc';
}

/**
 * Validate a value against column type
 */
export function validateColumnValue(
  value: unknown,
  column: MetaColumn
): { valid: boolean; error?: string } {
  if (value === null || value === undefined) {
    if (column.required) {
      return { valid: false, error: 'This field is required' };
    }
    return { valid: true };
  }

  switch (column.type) {
    case 'number':
    case 'currency':
      if (isNaN(Number(value))) {
        return { valid: false, error: 'Must be a number' };
      }
      break;
    
    case 'date':
    case 'datetime':
      if (isNaN(Date.parse(value as string))) {
        return { valid: false, error: 'Must be a valid date' };
      }
      break;
    
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'Must be a boolean' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Get column width style
 */
export function getColumnWidth(column: MetaColumn): string {
  if (column.width) {
    return `${column.width}px`;
  }
  if (column.minWidth) {
    return `minmax(${column.minWidth}px, 1fr)`;
  }
  return '1fr';
}

/**
 * Sort rows by column
 */
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  column: MetaColumn,
  dir: 'asc' | 'desc'
): T[] {
  return [...rows].sort((a, b) => {
    const aVal = getCellValue(a, column);
    const bVal = getCellValue(b, column);

    let comparison = 0;
    
    if (aVal === bVal) {
      comparison = 0;
    } else if (aVal === null || aVal === undefined) {
      comparison = 1;
    } else if (bVal === null || bVal === undefined) {
      comparison = -1;
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return dir === 'asc' ? comparison : -comparison;
  });
}

/**
 * Filter rows by search term
 */
export function filterRowsBySearch<T extends Record<string, unknown>>(
  rows: T[],
  search: string,
  searchInKeys: string[] | null,
  columns: MetaColumn[]
): T[] {
  if (!search) {
    return rows;
  }

  const searchLower = search.toLowerCase();
  const keysToSearch = searchInKeys || columns.map(col => col.key);

  return rows.filter(row => {
    return keysToSearch.some(key => {
      const value = row[key];
      if (value === null || value === undefined) {
        return false;
      }
      return String(value).toLowerCase().includes(searchLower);
    });
  });
}

/**
 * Get visible columns based on visible keys
 */
export function getVisibleColumns(
  columns: MetaColumn[],
  visibleKeys: string[]
): MetaColumn[] {
  return columns.filter(col => visibleKeys.includes(col.key));
}

/**
 * Get default visible keys for columns
 */
export function getDefaultVisibleKeys(columns: MetaColumn[]): string[] {
  return defaultVisibleColumnKeys(columns);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if two arrays are equal
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((val, index) => val === b[index]);
}

/**
 * Merge two objects
 */
export function mergeObjects<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>
): T {
  return { ...base, ...override };
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Truncate text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substr(0, maxLength) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(text: string): string {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(text: string): string {
  return text.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
```

### 7.2 Integrate Utils

#### Step 7.2.1: Import Utils
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add import** (after line 20, after existing utility imports):
```typescript
import {
  getRowKey,
  isRowDeleted,
  getCellValue,
  formatCellValue,
  getCellClass,
  isColumnSortable,
  isColumnFilterable,
  isColumnSearchable,
  getDefaultSortDir,
  validateColumnValue,
  getColumnWidth,
  sortRows,
  filterRowsBySearch,
  getVisibleColumns,
  getDefaultVisibleKeys,
  debounce,
  throttle
} from './utils';
```

#### Step 7.2.2: Replace rowKey Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find rowKey function**:
```bash
grep -n "function rowKey\|const rowKey" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (approximately lines 700-710):
```typescript
function rowKey(row: TRow): string {
  return String(row[uid]);
}
```

**Replace with**:
```typescript
const rowKey = (row: TRow): string => getRowKey(row, uid);
```

#### Step 7.2.3: Replace isRowDeleted Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find isRowDeleted function**:
```bash
grep -n "function isRowDeleted\|const isRowDeleted" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (approximately lines 710-720):
```typescript
function isRowDeleted(row: TRow): boolean {
  if (deletionFilterMode === 'all') {
    return false;
  }
  if (deletionFilterMode === 'deleted_only') {
    return !!(row.deleted_at as boolean);
  }
  return !!(row.deleted_at as boolean);
}
```

**Replace with**:
```typescript
const isRowDeleted = (row: TRow): boolean => isRowDeleted(row, deletionFilterMode);
```

**Note**: This creates a naming conflict. We need to rename the imported function or the local variable. Let's rename the import:

```typescript
import {
  getRowKey,
  isRowDeleted as isRowDeletedUtil,
  // ... other imports
} from './utils';

const isRowDeleted = (row: TRow): boolean => isRowDeletedUtil(row, deletionFilterMode);
```

#### Step 7.2.4: Replace getCellValue Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find getCellValue function**:
```bash
grep -n "function getCellValue\|const getCellValue" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (if it exists):
```typescript
function getCellValue(row: TRow, column: MetaColumn): unknown {
  return row[column.key];
}
```

**Replace with**:
```typescript
const getCellValueLocal = (row: TRow, column: MetaColumn): unknown => getCellValue(row, column);
```

**Note**: Rename to avoid conflict with imported function

#### Step 7.2.5: Replace formatCellValue Function
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find formatCellValue function**:
```bash
grep -n "function formatCellValue\|const formatCellValue" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Current code** (if it exists):
```typescript
function formatCellValue(value: unknown, column: MetaColumn): string {
  // Implementation...
}
```

**Replace with**:
```typescript
const formatCellValueLocal = (value: unknown, column: MetaColumn): string => 
  formatCellValue(value, column, $uiLang, datetimeIanaModeByKey, datetimeIanaRenderTick);
```

**Note**: Rename to avoid conflict with imported function

#### Step 7.2.6: Replace Other Helper Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find other helper functions**:
```bash
grep -n "function.*Cell\|function.*Column\|function.*Row" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Replace any other helper functions with utility imports**:
- Cell formatting functions → use formatCellValue
- Column validation functions → use validateColumnValue
- Column width functions → use getColumnWidth
- etc.

#### Step 7.2.7: Update Template References
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Find template references to helper functions**:
```bash
grep -n "formatCellValue\|getCellClass\|getColumnWidth" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Update template references to use local wrapper functions**:
```svelte
<!-- Before -->
{formatCellValue(row[column.key], column)}

<!-- After -->
{formatCellValueLocal(row[column.key], column)}
```

#### Step 7.2.8: Remove Inline Helper Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Remove all inline helper functions that have been replaced with utilities**:
- rowKey function
- isRowDeleted function
- getCellValue function
- formatCellValue function
- Any other helper functions

**Find all helper functions**:
```bash
grep -n "^function\|^const.*=.*function" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove the ones that are now in utils.ts**

### 7.3 Cleanup and Verification

#### Step 7.3.1: Remove Unused Constants
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any inline constants**:
```bash
grep -n "const.*=.*[0-9]\|const.*=.*'.*'" src/lib/components/entity-list-table/EntityListTable.svelte | head -20
```

**Move any reusable constants to utils.ts**

#### Step 7.3.2: Remove Unused Type Utilities
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for any inline type utilities**:
```bash
grep -n "type.*=\|interface.*=" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Move any reusable type utilities to utils.ts**

#### Step 7.3.3: Verify All Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Verify all utility imports are used**:
```bash
grep -n "getRowKey\|isRowDeleted\|getCellValue\|formatCellValue" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Remove any unused imports**

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
Test the following functionality:
1. Row key generation
2. Row deletion check
3. Cell value retrieval
4. Cell value formatting
5. Column sorting
6. Column filtering
7. Search functionality
8. All other utility-dependent features

**Expected**: All functionality works correctly

### Step 4: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~2232 lines (reduction of ~100 lines from ~2332)

## Acceptance Criteria
- ✅ utils.ts file created with utility functions
- ✅ Utility functions extracted from EntityListTable
- ✅ Type utilities extracted to utils.ts
- ✅ Constants extracted to utils.ts
- ✅ EntityListTable imports utilities
- ✅ No inline utility functions remain
- ✅ No inline type utilities remain
- ✅ No inline constants remain
- ✅ All imports used correctly
- ✅ No compilation errors
- ✅ All functionality works correctly
- ✅ Line count reduced by ~100 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually restore inline utility functions
3. Remove utils.ts file
4. Remove utility imports
5. Document what failed and why

## Notes
- This phase extracts utility functions to a separate file
- Utilities are shared across the component
- Some functions need local wrappers to avoid naming conflicts
- This is a low complexity, low risk extraction
- Utilities are pure functions with no side effects
- Test all utility-dependent features thoroughly
- Ensure type safety is maintained
- Some utilities may need component-specific parameters
