# EntityListTable.svelte Refactoring - Phase 1: Extract Utility Functions

## Overview

This phase focuses on extracting utility functions from the main `EntityListTable.svelte` component. These are pure functions with no side effects, making them low-risk extractions.

**Target Lines:** ~240 lines  
**Risk Level:** Low  
**Estimated Time:** 1-2 hours

---

## Tasks

### 1.1 Search Syntax Parser
**Status:** ✅ ALREADY EXISTS as `search/SearchSyntaxHighlighter.svelte`

**Action:** Move search syntax logic from main component to existing `search/SearchSyntaxHighlighter.svelte` and extract to `search/search-syntax.ts`

**Target:** Lines 1500-1568 (~68 lines)

**New File:** `src/lib/components/entity-list-table/search/search-syntax.ts`

**Original Code (Lines 1500-1568):**
```typescript
/** Visual tokens for list search (aligned with backend customers wildcard rules). */
type SearchSyntaxSeg =
  | { kind: 'plain'; text: string }
  | { kind: 'wAny'; text: string }
  | { kind: 'wOne'; text: string }
  | { kind: 'litStar' | 'litQ'; text: string }
  | { kind: 'sym'; text: string }
  | { kind: 'bsLit'; text: string };

function searchSyntaxSegments(raw: string): SearchSyntaxSeg[] {
  const out: SearchSyntaxSeg[] = [];
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ kind: 'plain', text: buf });
      buf = '';
    }
  };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    const next = raw[i + 1];
    if (ch === '\\' && next === '*') {
      flush();
      out.push({ kind: 'wAny', text: '\\*' });
      i++;
    } else if (ch === '\\' && next === '?') {
      flush();
      out.push({ kind: 'wOne', text: '\\?' });
      i++;
    } else if (ch === '\\' && next !== undefined) {
      flush();
      out.push({ kind: 'bsLit', text: ch + next });
      i++;
    } else if (ch === '*') {
      flush();
      out.push({ kind: 'litStar', text: '*' });
    } else if (ch === '?') {
      flush();
      out.push({ kind: 'litQ', text: '?' });
    } else if (ch === '%' || ch === '_') {
      flush();
      out.push({ kind: 'sym', text: ch });
    } else {
      buf += ch;
    }
  }
  flush();
  return out;
}

const searchSyntaxParts = $derived(searchSyntaxSegments(search));

function searchSyntaxSpanClass(seg: SearchSyntaxSeg): string {
  switch (seg.kind) {
    case 'plain':
      return 'text-foreground';
    case 'wAny':
      return 'font-semibold text-neutral-600 dark:text-neutral-400';
    case 'wOne':
      return 'font-semibold text-violet-600 dark:text-violet-400';
    case 'litStar':
    case 'litQ':
      return 'font-medium text-amber-700/90 dark:text-amber-400/90 bg-amber-50 dark:bg-amber-950/30 rounded px-0.5';
    case 'sym':
      return 'font-medium text-emerald-700/90 dark:text-emerald-400/90';
    case 'bsLit':
      return 'text-muted-foreground';
  }
}
```

**New File Structure:**
```typescript
// src/lib/components/entity-list-table/search/search-syntax.ts
export type SearchSyntaxSeg =
  | { kind: 'plain'; text: string }
  | { kind: 'wAny'; text: string }
  | { kind: 'wOne'; text: string }
  | { kind: 'litStar' | 'litQ'; text: string }
  | { kind: 'sym'; text: string }
  | { kind: 'bsLit'; text: string };

export function searchSyntaxSegments(raw: string): SearchSyntaxSeg[] {
  // ... (same implementation)
}

export function searchSyntaxSpanClass(seg: SearchSyntaxSeg): string {
  // ... (same implementation)
}
```

**Changes in EntityListTable.svelte:**
- **Remove lines 1500-1568** (type definition and functions)
- **Add import at top:** `import { searchSyntaxSegments, searchSyntaxSpanClass } from './search/search-syntax';`
- **Update line 1550:** Change from `const searchSyntaxParts = $derived(searchSyntaxSegments(search));` to use imported function

**Steps:**
1. Create `src/lib/components/entity-list-table/search/search-syntax.ts`
2. Copy type definition and functions from lines 1500-1568
3. Export functions from new file
4. Add import in `EntityListTable.svelte` (around line 1500)
5. Remove original code from lines 1500-1568
6. Update `search/SearchSyntaxHighlighter.svelte` to import from new file if needed
7. Test search syntax highlighting still works

---

### 1.2 Cell Styling Functions
**Target:** Lines 664-765 (~101 lines)

**New File:** `src/lib/components/entity-list-table/utils/cell-styling.ts`

**Original Code (Lines 664-765):**
```typescript
/** Top-align cells that stack datetime value + IANA badge. */
function entityListDataCellValignClass(col: MetaColumn): string | undefined {
  return col.datetimeIanaToggle ? 'align-top' : undefined;
}

/** Amber tint only when showing the record's stored IANA timezone; browser/local mode uses default neutral like other columns. */
function isDatetimeIanaRecordMode(col: MetaColumn): boolean {
  if (col.type !== 'datetime' || !col.datetimeIanaToggle) return false;
  return (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record';
}

/**
 * Datetime columns with IANA toggle: light header band above body (`amber-100` vs cell `amber-50`).
 * Dark: same **Tailwind amber** ramp as body (`amber-950`).
 * `Table.Row` applies `[&>th]:[…]:hover:bg-muted`; repeat the same bg on `hover:` with `!` so the
 * header does not grey out on row hover (hover tint stays on body cells only).
 */
function datetimeIanaHeadHighlightClass(col: MetaColumn): string | undefined {
  if (!isDatetimeIanaRecordMode(col)) return undefined;
  return 'bg-amber-100! hover:bg-amber-100! dark:bg-amber-950! dark:hover:bg-amber-950!';
}

/**
 * Datetime IANA body cells: amber palette only in record (stored timezone) mode. Browser mode: no classes here
 * (standard neutral interaction applies). Light: 50→100 hover, 200→300 when row selected.
 * Dark (Tailwind amber): base `950` → hover `900` → selected `800` → selected+hover `700`.
 */
function datetimeIanaCellHighlightClass(col: MetaColumn, rowSelected: boolean): string | undefined {
  if (!isDatetimeIanaRecordMode(col)) return undefined;
  if (rowSelected) {
    return 'bg-amber-200/95! dark:bg-amber-800! transition-colors group-hover/entity-row:bg-amber-300/95! dark:group-hover/entity-row:bg-amber-700!';
  }
  return 'bg-amber-50! dark:bg-amber-950! transition-colors group-hover/entity-row:bg-amber-100/95! dark:group-hover/entity-row:bg-amber-900!';
}

/** Card view: highlight datetime+IANA fields when record (IANA locale) mode is active. */
function datetimeIanaCardFieldHighlightClass(col: MetaColumn, rowSelected: boolean): string | undefined {
  if (!isDatetimeIanaRecordMode(col)) return undefined;
  if (rowSelected) {
    return 'rounded-md border border-amber-300/70 bg-amber-200/70 p-2 transition-colors group-hover:bg-amber-300/75 dark:border-amber-700 dark:bg-amber-800 dark:group-hover:bg-amber-700';
  }
  return 'rounded-md border border-amber-200/70 bg-amber-50/70 p-2 transition-colors group-hover:bg-amber-100/80 dark:border-amber-900 dark:bg-amber-950 dark:group-hover:bg-amber-900';
}

/**
 * Checkbox / actions (dark): base `900`, hover `800`, selected `700`, selected+hover `600` — same ramp as sticky uuid/code body.
 */
function entityListGrayChromeCellClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
    : 'bg-neutral-100 dark:bg-neutral-900 transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
}

/**
 * Destructive background for deleted rows (light red): base `100`, hover `200`, selected `300`, selected+hover `400`.
 * Dark: base `900`, hover `800`, selected `700`, selected+hover `600`.
 */
function entityListDestructiveChromeCellClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-rose-300! dark:bg-rose-700! transition-colors group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!'
    : 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
}

/**
 * Sticky uuid/code body overlay (dark, not IANA): base from `stickyCellClass`; hover `800`; selected `700` / `600`.
 */
function entityListGrayBandStickyInteractionClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
    : 'transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
}

/**
 * Destructive sticky uuid/code body overlay for deleted rows: base `200`, hover `300`, selected `400` / `500` (slightly darker than chrome).
 * Dark: base `800`, hover `700`, selected `600` / `500`.
 */
function entityListDestructiveBandStickyInteractionClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-rose-400! dark:bg-rose-600! transition-colors group-hover/entity-row:bg-rose-500! dark:group-hover/entity-row:bg-rose-500!'
    : 'bg-rose-200! dark:bg-rose-800! transition-colors group-hover/entity-row:bg-rose-300! dark:group-hover/entity-row:bg-rose-700!';
}

/**
 * Normal (non-sticky) scroll cells — **not** IANA record (IANA uses its own ramp). Light unchanged.
 * Dark: rest `950`, hover `900`, selected `900`, selected+hover `800` (sticky selected resta `700`/`600`).
 */
function entityListDefaultScrollInteractionClass(rowSelected: boolean): string | undefined {
  if (rowSelected) {
    return 'transition-colors bg-neutral-100! dark:bg-neutral-900! group-hover/entity-row:bg-neutral-200! dark:group-hover/entity-row:bg-neutral-800!';
  }
  return 'dark:bg-neutral-950! transition-colors group-hover/entity-row:bg-neutral-50! dark:group-hover/entity-row:bg-neutral-900!';
}

/**
 * Destructive scroll cells for deleted rows: base `100`, hover `200`, selected `300`, selected+hover `400`.
 * Dark: base `900`, hover `800`, selected `700`, selected+hover `600`.
 */
function entityListDestructiveScrollInteractionClass(rowSelected: boolean): string | undefined {
  if (rowSelected) {
    return 'transition-colors bg-rose-300! dark:bg-rose-700! group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!';
  }
  return 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
}
```

**New File Structure:**
```typescript
// src/lib/components/entity-list-table/utils/cell-styling.ts
import type { MetaColumn } from '../types';

export function entityListDataCellValignClass(col: MetaColumn): string | undefined {
  return col.datetimeIanaToggle ? 'align-top' : undefined;
}

export function isDatetimeIanaRecordMode(col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): boolean {
  if (col.type !== 'datetime' || !col.datetimeIanaToggle) return false;
  return (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record';
}

export function datetimeIanaHeadHighlightClass(col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): string | undefined {
  if (!isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)) return undefined;
  return 'bg-amber-100! hover:bg-amber-100! dark:bg-amber-950! dark:hover:bg-amber-950!';
}

export function datetimeIanaCellHighlightClass(col: MetaColumn, rowSelected: boolean, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): string | undefined {
  if (!isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)) return undefined;
  if (rowSelected) {
    return 'bg-amber-200/95! dark:bg-amber-800! transition-colors group-hover/entity-row:bg-amber-300/95! dark:group-hover/entity-row:bg-amber-700!';
  }
  return 'bg-amber-50! dark:bg-amber-950! transition-colors group-hover/entity-row:bg-amber-100/95! dark:group-hover/entity-row:bg-amber-900!';
}

export function datetimeIanaCardFieldHighlightClass(col: MetaColumn, rowSelected: boolean, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>): string | undefined {
  if (!isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)) return undefined;
  if (rowSelected) {
    return 'rounded-md border border-amber-300/70 bg-amber-200/70 p-2 transition-colors group-hover:bg-amber-300/75 dark:border-amber-700 dark:bg-amber-800 dark:group-hover:bg-amber-700';
  }
  return 'rounded-md border border-amber-200/70 bg-amber-50/70 p-2 transition-colors group-hover:bg-amber-100/80 dark:border-amber-900 dark:bg-amber-950 dark:group-hover:bg-amber-900';
}

export function entityListGrayChromeCellClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
    : 'bg-neutral-100 dark:bg-neutral-900 transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
}

export function entityListDestructiveChromeCellClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-rose-300! dark:bg-rose-700! transition-colors group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!'
    : 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
}

export function entityListGrayBandStickyInteractionClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
    : 'transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
}

export function entityListDestructiveBandStickyInteractionClass(rowSelected: boolean): string {
  return rowSelected
    ? 'bg-rose-400! dark:bg-rose-600! transition-colors group-hover/entity-row:bg-rose-500! dark:group-hover/entity-row:bg-rose-500!'
    : 'bg-rose-200! dark:bg-rose-800! transition-colors group-hover/entity-row:bg-rose-300! dark:group-hover/entity-row:bg-rose-700!';
}

export function entityListDefaultScrollInteractionClass(rowSelected: boolean): string | undefined {
  if (rowSelected) {
    return 'transition-colors bg-neutral-100! dark:bg-neutral-900! group-hover/entity-row:bg-neutral-200! dark:group-hover/entity-row:bg-neutral-800!';
  }
  return 'dark:bg-neutral-950! transition-colors group-hover/entity-row:bg-neutral-50! dark:group-hover/entity-row:bg-neutral-900!';
}

export function entityListDestructiveScrollInteractionClass(rowSelected: boolean): string | undefined {
  if (rowSelected) {
    return 'transition-colors bg-rose-300! dark:bg-rose-700! group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!';
  }
  return 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
}
```

**Changes in EntityListTable.svelte:**
- **Remove lines 664-765** (all cell styling functions)
- **Add import at top:** `import { entityListDataCellValignClass, isDatetimeIanaRecordMode, datetimeIanaHeadHighlightClass, datetimeIanaCellHighlightClass, datetimeIanaCardFieldHighlightClass, entityListGrayChromeCellClass, entityListDestructiveChromeCellClass, entityListGrayBandStickyInteractionClass, entityListDestructiveBandStickyInteractionClass, entityListDefaultScrollInteractionClass, entityListDestructiveScrollInteractionClass } from './utils/cell-styling';`
- **Update function calls:** Pass `datetimeIanaModeByKey` as parameter to functions that need it (e.g., `isDatetimeIanaRecordMode(col)` → `isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)`)

**Steps:**
1. Create `src/lib/components/entity-list-table/utils/cell-styling.ts`
2. Copy functions from lines 664-765
3. Update functions to accept `datetimeIanaModeByKey` as parameter where needed
4. Export functions from new file
5. Add import in `EntityListTable.svelte` (around line 1-50)
6. Remove original code from lines 664-765
7. Update all function calls to pass `datetimeIanaModeByKey` parameter
8. Test cell styling still works in table and card views

---

### 1.3 Cell Formatting Functions
**Target:** Lines 607-661 (~54 lines)

**New File:** `src/lib/components/entity-list-table/utils/cell-formatting.ts`

**Original Code (Lines 607-661):**
```typescript
const isBlankish = (value: unknown): boolean => isBlankishUtil(value);

/**
 * Get audit field value with _name fallback.
 * For audit fields (created_by, updated_by, deleted_by), checks for the corresponding
 * _name field (e.g., created_by_name) and uses it as fallback to show human-readable names.
 */
function getAuditFieldValue(row: TRow, col: MetaColumn): string {
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
  return formatListCellValue(col, raw, $uiLang);
}

/**
 * Card view empty-state detection.
 *
 * Note: when a route provides `{#snippet cell}`, we cannot reliably infer rendered emptiness;
 * in that case we only apply this heuristic for scalar-ish values on the row key.
 */
function isCardFieldEmpty(row: TRow, col: MetaColumn): boolean {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  if (col.type === 'datetime' && col.datetimeIanaToggle) {
    const mode = datetimeIanaModeByKey[col.key] ?? 'browser';
    const parts = formatDatetimeCellDisplay(col, r, $uiLang, mode);
    const textEmpty = parts.text.trim().length === 0;
    // In record mode we may show an IANA badge even if the datetime text is empty; treat as non-empty.
    if (isDatetimeIanaRecordMode(col) && parts.iana && parts.iana.trim().length > 0) return false;
    return textEmpty;
  }

  if (cell) {
    return isBlankish(raw);
  }

  if (isBlankish(raw)) return true;

  const formatted = formatListCellValue(col, raw, $uiLang).trim();
  return formatted.length === 0;
}
```

**New File Structure:**
```typescript
// src/lib/components/entity-list-table/utils/cell-formatting.ts
import type { MetaColumn } from '../types';
import { isBlankish as isBlankishUtil } from '@core/utils/isBlankish';
import { formatListCellValue } from '@core/utils/formatListCellValue';
import { formatDatetimeCellDisplay } from '@core/utils/formatDatetimeCellDisplay';

export const isBlankish = (value: unknown): boolean => isBlankishUtil(value);

export function getAuditFieldValue<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: string,
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: string) => string
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

export function isCardFieldEmpty<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: string,
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>,
  cell: any,
  formatDatetimeCellDisplayFn: (col: MetaColumn, row: Record<string, unknown>, lang: string, mode: 'browser' | 'record') => { text: string; iana?: string },
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: string) => string,
  isDatetimeIanaRecordModeFn: (col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>) => boolean
): boolean {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  if (col.type === 'datetime' && col.datetimeIanaToggle) {
    const mode = datetimeIanaModeByKey[col.key] ?? 'browser';
    const parts = formatDatetimeCellDisplayFn(col, r, uiLang, mode);
    const textEmpty = parts.text.trim().length === 0;
    // In record mode we may show an IANA badge even if the datetime text is empty; treat as non-empty.
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

**Changes in EntityListTable.svelte:**
- **Remove lines 607-661** (cell formatting functions)
- **Add import at top:** `import { isBlankish, getAuditFieldValue, isCardFieldEmpty } from './utils/cell-formatting';`
- **Update function calls:**
  - `getAuditFieldValue(row, col)` → `getAuditFieldValue(row, col, $uiLang, formatListCellValue)`
  - `isCardFieldEmpty(row, col)` → `isCardFieldEmpty(row, col, $uiLang, datetimeIanaModeByKey, cell, formatDatetimeCellDisplay, formatListCellValue, isDatetimeIanaRecordMode)`

**Steps:**
1. Create `src/lib/components/entity-list-table/utils/cell-formatting.ts`
2. Copy functions from lines 607-661
3. Update functions to accept dependencies as parameters (uiLang, datetimeIanaModeByKey, cell, formatting functions)
4. Export functions from new file
5. Add import in `EntityListTable.svelte` (around line 1-50)
6. Remove original code from lines 607-661
7. Update all function calls to pass required parameters
8. Test cell formatting still works correctly

---

## Testing Checklist

- [ ] Search syntax highlighting works correctly
- [ ] Cell styling functions work in table view
- [ ] Cell styling functions work in card view
- [ ] Cell formatting functions work correctly
- [ ] No TypeScript errors: `pnpm run check`
- [ ] Dev server runs without errors: `pnpm run dev`
- [ ] Manual testing of affected features
- [ ] All existing functionality preserved

---

## Success Criteria

- [ ] All utility functions extracted to separate files
- [ ] Main component reduced by ~240 lines
- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] All features manually tested
- [ ] Code follows existing patterns and conventions
