# Plan: Frontend Auditable Entity Display Name Fallback

## Problem Statement

The frontend currently has hardcoded logic to handle display name fallback for audit fields (`created_by`, `updated_by`, `deleted_by`). This logic is duplicated in multiple files and is not metadata-driven. The goal is to make this logic dynamic based on the entity metadata's `auditingColumns` configuration.

## Empiric Investigation Results

### Current Implementation

**File**: `src/lib/components/entity-list-table/utils.ts` (Lines 37-59)
```typescript
export function getAuditFieldValue<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn
): string {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // Check if this is an audit field that should have a _name variant
  const auditFields = ['created_by', 'updated_by', 'deleted_by'];
  if (auditFields.includes(col.key)) {
    const nameField = `${col.key}_name`;
    const nameValue = r[nameField];
    // Use _name if present and non-empty, otherwise use original value
    if (!isBlankish(nameValue)) {
      return String(nameValue);
    }
  }

  // For non-audit fields or if _name is empty, use original value
  if (isBlankish(raw)) return '-';

  return String(raw);
}
```

**File**: `src/lib/components/entity-list-table/utils/cell-formatting.ts` (Lines 9-32)
```typescript
export function getAuditFieldValue<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string
): string {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // Check if this is an audit field that should have a _name variant
  const auditFields = ['created_by', 'updated_by', 'deleted_by'];
  if (auditFields.includes(col.key)) {
    const nameField = `${col.key}_name`;
    const nameValue = r[nameField];
    // Use _name if present and non-empty, otherwise use original value
    if (!isBlankish(nameValue)) {
      return String(nameValue);
    }
  }

  // For non-audit fields or if _name is empty, use original value
  if (isBlankish(raw)) return '-';
  return formatListCellValueFn(col, raw, uiLang);
}
```

### Metadata Structure

**File**: `src/lib/entity-list/types.ts` (Lines 47-75)
```typescript
export type EntityListListMeta = {
  searchPlaceholderKey?: string;
  columns?: MetaColumn[];
  stickyColumns?: MetaColumn[];
  /** Auditing columns, ordered for display (rendered last). */
  auditingColumns?: MetaColumn[];
  defaultPageSize?: number[];
  pageSizeOptions?: number[];
  defaultSort?: { key: string; dir: SortDir };
  viewVisibility?: ListMetaViewVisibility;
  filterFields?: MetaColumn[];
  rowActions?: { ... };
  enableCreateAction?: boolean;
};
```

### Key Findings

1. **Duplicate Logic**: The same fallback logic exists in two files with slight variations
2. **Hardcoded Field List**: The list of audit fields is hardcoded as `['created_by', 'updated_by', 'deleted_by']`
3. **Not Metadata-Driven**: The logic doesn't use the `auditingColumns` from metadata to identify audit fields
4. **Existing Pattern**: The pattern of checking for `${field}_name` is already established and working

## Proposed Solution

### Phase 1: Create Centralized Utility

**Objective**: Create a single, metadata-driven utility function to handle display name fallback.

**File**: `src/lib/components/entity-list-table/utils/auditable-fields.ts` (new file)

```typescript
import type { MetaColumn } from '$lib/entity-list/types';
import { isBlankish } from '../utils';

/**
 * Check if a column is an auditable field based on metadata.
 * A column is considered auditable if it appears in the auditingColumns array.
 * 
 * @param col - The column to check
 * @param auditingColumns - The auditing columns from entity metadata
 * @returns true if the column is an auditable field
 */
export function isAuditableColumn(
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): boolean {
  if (!auditingColumns || auditingColumns.length === 0) {
    return false;
  }
  return auditingColumns.some((auditCol) => auditCol.key === col.key);
}

/**
 * Get the display name field key for an auditable field.
 * For example, 'created_by' -> 'created_by_name'
 * 
 * @param fieldKey - The original field key
 * @returns The display name field key
 */
export function getDisplayNameFieldKey(fieldKey: string): string {
  return `${fieldKey}_name`;
}

/**
 * Get the display value for an auditable field with fallback.
 * If the field is auditable and has a corresponding _name field with a non-empty value,
 * use the display name. Otherwise, fall back to the original value.
 * 
 * @param row - The row data
 * @param col - The column definition
 * @param auditingColumns - The auditing columns from entity metadata
 * @param formatValueFn - Optional function to format the raw value
 * @returns The display value (display name or original value)
 */
export function getAuditableDisplayValue<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[],
  formatValueFn?: (value: unknown) => string
): string {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // Check if this is an auditable field based on metadata
  if (isAuditableColumn(col, auditingColumns)) {
    const nameField = getDisplayNameFieldKey(col.key);
    const nameValue = r[nameField];
    
    // Use display name if present and non-empty
    if (!isBlankish(nameValue)) {
      return String(nameValue);
    }
  }

  // Fall back to original value
  if (isBlankish(raw)) return '-';
  
  return formatValueFn ? formatValueFn(raw) : String(raw);
}

/**
 * Check if an auditable field should be considered empty.
 * A field is empty if both the raw value and the display name value are blank.
 * 
 * @param row - The row data
 * @param col - The column definition
 * @param auditingColumns - The auditing columns from entity metadata
 * @returns true if the field is empty
 */
export function isAuditableFieldEmpty<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): boolean {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // For auditable fields, check both raw and display name
  if (isAuditableColumn(col, auditingColumns)) {
    const nameField = getDisplayNameFieldKey(col.key);
    const nameValue = r[nameField];
    return isBlankish(raw) && isBlankish(nameValue);
  }

  // For non-auditable fields, just check the raw value
  return isBlankish(raw);
}
```

### Phase 2: Update utils.ts

**Objective**: Replace the hardcoded `getAuditFieldValue` function with the new metadata-driven utility.

**File**: `src/lib/components/entity-list-table/utils.ts`

**Before** (Lines 37-59):
```typescript
export function getAuditFieldValue<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn
): string {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // Check if this is an audit field that should have a _name variant
  const auditFields = ['created_by', 'updated_by', 'deleted_by'];
  if (auditFields.includes(col.key)) {
    const nameField = `${col.key}_name`;
    const nameValue = r[nameField];
    // Use _name if present and non-empty, otherwise use original value
    if (!isBlankish(nameValue)) {
      return String(nameValue);
    }
  }

  // For non-audit fields or if _name is empty, use original value
  if (isBlankish(raw)) return '-';

  return String(raw);
}
```

**After**:
```typescript
import { getAuditableDisplayValue, isAuditableFieldEmpty } from './utils/auditable-fields';

export function getAuditFieldValue<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): string {
  return getAuditableDisplayValue(row, col, auditingColumns);
}
```

**Update** `isCardFieldEmpty` (Lines 65-83):
```typescript
export function isCardFieldEmpty<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): boolean {
  return isAuditableFieldEmpty(row, col, auditingColumns);
}
```

### Phase 3: Update cell-formatting.ts

**Objective**: Replace the duplicate logic with the centralized utility.

**File**: `src/lib/components/entity-list-table/utils/cell-formatting.ts`

**Before** (Lines 9-32):
```typescript
export function getAuditFieldValue<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string
): string {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // Check if this is an audit field that should have a _name variant
  const auditFields = ['created_by', 'updated_by', 'deleted_by'];
  if (auditFields.includes(col.key)) {
    const nameField = `${col.key}_name`;
    const nameValue = r[nameField];
    // Use _name if present and non-empty, otherwise use original value
    if (!isBlankish(nameValue)) {
      return String(nameValue);
    }
  }

  // For non-audit fields or if _name is empty, use original value
  if (isBlankish(raw)) return '-';
  return formatListCellValueFn(col, raw, uiLang);
}
```

**After**:
```typescript
import { getAuditableDisplayValue } from './auditable-fields';

export function getAuditFieldValue<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string,
  auditingColumns?: MetaColumn[]
): string {
  return getAuditableDisplayValue(
    row,
    col,
    auditingColumns,
    (value) => formatListCellValueFn(col, value, uiLang)
  );
}
```

**Update** `isCardFieldEmpty` to accept `auditingColumns` parameter:
```typescript
export function isCardFieldEmpty<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>,
  cell: any,
  formatDatetimeCellDisplayFn: (col: MetaColumn, row: Record<string, unknown>, lang: UiLang, mode: 'browser' | 'record') => { text: string; iana: string | null },
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string,
  isDatetimeIanaRecordModeFn: (col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>) => boolean,
  auditingColumns?: MetaColumn[]
): boolean {
  // Use the centralized utility for auditable fields
  if (isAuditableColumn(col, auditingColumns)) {
    return isAuditableFieldEmpty(row, col, auditingColumns);
  }

  // Existing logic for non-auditable fields
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  if (col.type === 'datetime' && col.datetimeIanaToggle) {
    const mode = datetimeIanaModeByKey[col.key] ?? 'browser';
    const parts = formatDatetimeCellDisplayFn(col, r, uiLang, mode);
    const textEmpty = parts.text.trim().length === 0;
    if (isDatetimeIanaRecordModeFn(col, datetimeIanaModeByKey) && parts.iana && parts.iana.trim().length > 0) return false;
    return textEmpty;
  }

  if (cell) {
    return isBlankish(raw);
  }

  if (isBlankish(raw)) return true;

  const formatted = formatListCellValueFn(col, raw, uiLang).trim();
  return formatted.length === 0;
}
```

### Phase 4: Create Context API for Audit Columns

**Objective**: Use Svelte's Context API to pass `auditingColumns` through the component hierarchy without prop drilling.

**File**: `src/lib/components/entity-list-table/context.ts` (new file)

```typescript
import { getContext, setContext } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';

const AUDIT_COLUMNS_KEY = Symbol('auditColumns');

/**
 * Set the audit columns context for child components.
 * Should be called in the parent component (EntityListTable).
 */
export function setAuditColumnsContext(auditingColumns?: MetaColumn[]) {
  setContext(AUDIT_COLUMNS_KEY, auditingColumns);
}

/**
 * Get the audit columns context from the parent component.
 * Returns undefined if no context is set.
 */
export function getAuditColumnsContext(): MetaColumn[] | undefined {
  return getContext(AUDIT_COLUMNS_KEY);
}
```

**File**: `src/lib/components/entity-list-table/types.ts`

**Update** `EntityListTableProps` (Line 24):
```typescript
export type EntityListTableProps<TRow extends Record<string, unknown>> = {
  // ... existing props
  auditingColumns?: MetaColumn[];
  // ... existing props
};
```

**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Add context setup**:
```svelte
<script>
  import { setAuditColumnsContext } from './context';
  
  let { auditingColumns } = $props();
  
  // Set context for child components
  setAuditColumnsContext(auditingColumns);
</script>
```

### Phase 5: Update Component Usage

**Objective**: Pass `auditingColumns` from page components to `EntityListTable`.

**Files to update**:
- `src/routes/(app)/customers/+page.svelte`
- `src/routes/(app)/system/settings/users/+page.svelte`
- `src/routes/(app)/system/settings/organizations/+page.svelte`

**Example** (customers page):
```svelte
<EntityListTable
  {auditingColumns}
  {stickyColumns}
  {dataColumns}
  columns={columns}
  <!-- other props -->
/>
```

### Phase 6: Update Internal Components to Use Context

**Objective**: Update child components to retrieve `auditingColumns` from context instead of receiving it as a prop.

**Files to update**:
- `src/lib/components/entity-list-table/utils/cell-formatting.ts`
- `src/lib/components/entity-list-table/components/TableRow.svelte`
- `src/lib/components/entity-list-table/panels/PreviewPanel.svelte`

**Pattern**: Import and use `getAuditColumnsContext()` in components that need audit column metadata.

**Example** (cell-formatting.ts):
```typescript
import { getAuditColumnsContext } from '../context';

export function getAuditFieldValue<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string
): string {
  const auditingColumns = getAuditColumnsContext();
  return getAuditableDisplayValue(
    row,
    col,
    auditingColumns,
    (value) => formatListCellValueFn(col, value, uiLang)
  );
}
```

**Example** (TableRow.svelte):
```svelte
<script>
  import { getAuditColumnsContext } from '../context';
  
  const auditingColumns = getAuditColumnsContext();
</script>
```

### Phase 7: Empiric Verification

**Test Cases**:

1. **Test with auditable entity** (e.g., customers):
   - Verify that `created_by_name` is displayed when available
   - Verify that it falls back to `created_by` UUID when `created_by_name` is null/undefined
   - Verify that it falls back to `created_by` when the value is "system"

2. **Test with non-auditable entity**:
   - Verify that regular fields are not affected by the new logic
   - Verify that the display works as before

3. **Test with missing auditingColumns metadata**:
   - Verify that the logic gracefully handles undefined `auditingColumns`
   - Verify that it falls back to treating no fields as auditable

4. **Test in different views** (table, cards, cards_list):
   - Verify that the fallback works in all view modes
   - Verify that card view correctly hides empty auditable fields

## Implementation Order

1. **Phase 1**: Create centralized utility file (`auditable-fields.ts`)
2. **Phase 2**: Update `utils.ts` to use the new utility
3. **Phase 3**: Update `cell-formatting.ts` to use the new utility
4. **Phase 4**: Create Context API (`context.ts`) and update `EntityListTable.svelte`
5. **Phase 5**: Update page components to pass `auditingColumns` to `EntityListTable`
6. **Phase 6**: Update internal components to use `getAuditColumnsContext()`
7. **Phase 7**: Empiric verification with test cases

## Acceptance Criteria

- [ ] Centralized utility file created with metadata-driven logic
- [ ] Duplicate logic removed from `utils.ts` and `cell-formatting.ts`
- [ ] Context API created and `auditingColumns` set in `EntityListTable.svelte`
- [ ] All page components pass `auditingColumns` to `EntityListTable`
- [ ] Internal components use `getAuditColumnsContext()` to retrieve metadata
- [ ] Display name fallback works for all auditable entities
- [ ] Fallback to original UUID works when display name is null/undefined
- [ ] Non-auditable entities are not affected
- [ ] All view modes (table, cards, cards_list) work correctly
- [ ] No regression in existing functionality

## Risk Mitigation

- **Breaking Changes**: None - this is a refactoring that maintains existing behavior
- **Performance**: Minimal impact - just adding a prop pass-through
- **Type Safety**: TypeScript ensures compile-time checking of the new props
- **Backward Compatibility**: The logic gracefully handles undefined `auditingColumns`

## Files to Modify

### New Files
- `src/lib/components/entity-list-table/utils/auditable-fields.ts`

### Modified Files
- `src/lib/components/entity-list-table/utils.ts`
- `src/lib/components/entity-list-table/utils/cell-formatting.ts`
- `src/lib/components/entity-list-table/types.ts`
- `src/lib/components/entity-list-table/EntityListTable.svelte`
- `src/lib/components/entity-list-table/components/EntityListTableContent.svelte`
- `src/lib/components/entity-list-table/components/EntityListTableTableView.svelte`
- `src/lib/components/entity-list-table/components/TableRow.svelte`
- `src/lib/components/entity-list-table/panels/PreviewPanel.svelte`
- `src/routes/(app)/customers/+page.svelte`
- `src/routes/(app)/system/settings/users/+page.svelte`
- `src/routes/(app)/system/settings/organizations/+page.svelte`

## Notes

- The existing pattern of checking for `${field}_name` is preserved
- The logic is now metadata-driven instead of hardcoded
- Duplicate code is eliminated
- The solution is extensible for future audit fields
- The fallback logic is consistent across all components
