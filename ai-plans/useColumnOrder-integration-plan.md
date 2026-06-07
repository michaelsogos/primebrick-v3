# useColumnOrder Composable Integration Plan

## Overview
This plan details the step-by-step refactoring to integrate the `useColumnOrder` composable into `EntityListTable.svelte`, replacing manual column order state management with the composable.

## File Location
`D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte`

---

## Step 1: Add Import (After Line 44)

**OLD (After Line 44):**
```typescript
  } from './composables';
  import {
    isRowDeleted as isRowDeletedUtil,
    getRowKey
  } from './utils';
```

**NEW (After Line 44):**
```typescript
  } from './composables';
  import { useColumnOrder } from './composables/useColumnOrder.svelte';
  import {
    isRowDeleted as isRowDeletedUtil,
    getRowKey
  } from './utils';
```

**Action:** Insert the import line after line 44

---

## Step 2: Remove Local Type Definition (Line 227)

**OLD (Line 227):**
```typescript
  type ColumnOrderState = {
    sticky?: string[];
    data?: string[];
    auditing?: string[];
  };
```

**NEW (Line 227):**
```typescript
  // Type already imported from types.ts
```

**Action:** Delete lines 227-231 entirely

---

## Step 3: Replace Manual State Initialization (Line 233)

**OLD (Line 233):**
```typescript
  const orderState = $state<ColumnOrderState>({});
```

**NEW (Lines 233-235):**
```typescript
  // Column order management using composable
  const columnOrder = useColumnOrder(columnOrderStorageKey);
  const orderState = columnOrder.orderState;
```

**Action:** Replace line 233 with the composable initialization

---

## Step 4: Replace applyKeyOrder Calls (Lines 239, 240, 241, 263, 283, 286)

**OLD (Line 239):**
```typescript
        ...applyKeyOrder(stickyColumns ?? [], orderState.sticky),
```

**NEW (Line 239):**
```typescript
        ...columnOrder.applyKeyOrder(stickyColumns ?? [], orderState.sticky),
```

**OLD (Line 240):**
```typescript
        ...applyKeyOrder(dataColumns ?? [], orderState.data),
```

**NEW (Line 240):**
```typescript
        ...columnOrder.applyKeyOrder(dataColumns ?? [], orderState.data),
```

**OLD (Line 241):**
```typescript
        ...applyKeyOrder(auditingColumns ?? [], orderState.auditing)
```

**NEW (Line 241):**
```typescript
        ...columnOrder.applyKeyOrder(auditingColumns ?? [], orderState.auditing)
```

**OLD (Line 263):**
```typescript
    applyKeyOrder(
```

**NEW (Line 263):**
```typescript
    columnOrder.applyKeyOrder(
```

**OLD (Line 283):**
```typescript
  applyKeyOrder(auditingColumns ?? allColumns.filter((c) => auditingKeySet.has(c.key)), orderState.auditing)
```

**NEW (Line 283):**
```typescript
  columnOrder.applyKeyOrder(auditingColumns ?? allColumns.filter((c) => auditingKeySet.has(c.key)), orderState.auditing)
```

**OLD (Line 286):**
```typescript
    applyKeyOrder(
```

**NEW (Line 286):**
```typescript
    columnOrder.applyKeyOrder(
```

**Action:** Replace all 6 occurrences of `applyKeyOrder(` with `columnOrder.applyKeyOrder(`

---

## Step 5: Replace moveKeyWithin Call (Find usage in component)

**OLD (Search for):**
```typescript
moveKeyWithin(
```

**NEW (Replace with):**
```typescript
columnOrder.moveKeyWithin(
```

**Action:** Replace the moveKeyWithin call with columnOrder.moveKeyWithin

**Note:** This is used in the reorder logic, typically in the sheet panel management

---

## Step 6: Replace writeOrderState Calls (Find usage in component)

**OLD (Search for):**
```typescript
writeOrderState(
```

**NEW (Replace with):**
```typescript
columnOrder.writeOrderState(
```

**Action:** Replace all writeOrderState calls with columnOrder.writeOrderState

**Note:** This is used when resetting columns or in other state update logic

---

## Step 7: Remove Manual Function Definitions (Lines 355-415)

**OLD (Lines 355-415):**
```typescript
  function readOrderState(): ColumnOrderState {
    if (!columnOrderStorageKey) return {};
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.sessionStorage.getItem(columnOrderStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const obj = parsed as any;
      return {
        sticky: Array.isArray(obj.sticky)
          ? obj.sticky.filter((k: unknown) => typeof k === 'string')
          : undefined,
        data: Array.isArray(obj.data) ? obj.data.filter((k: unknown) => typeof k === 'string') : undefined,
        auditing: Array.isArray(obj.auditing)
          ? obj.auditing.filter((k: unknown) => typeof k === 'string')
          : undefined
      };
    } catch {
      return {};
    }
  }

  function writeOrderState(next: ColumnOrderState) {
    if (!columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(columnOrderStorageKey, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }
    function applyKeyOrder(cols: MetaColumn[], keys: string[] | undefined): MetaColumn[] {
    if (!keys || keys.length === 0) return cols;
    const byKey = new Map(cols.map((c) => [c.key, c] as const));
    const out: MetaColumn[] = [];
    const used = new Set<string>();
    for (const k of keys) {
      const c = byKey.get(k);
      if (!c) continue;
      out.push(c);
      used.add(k);
    }
    for (const c of cols) {
      if (used.has(c.key)) continue;
      out.push(c);
    }
    return out;
  }

  function moveKeyWithin(keys: string[], fromKey: string, toKey: string): string[] {
    if (fromKey === toKey) return keys;
    const fromIdx = keys.indexOf(fromKey);
    const toIdx = keys.indexOf(toKey);
    if (fromIdx < 0 || toIdx < 0) return keys;
    const next = keys.slice();
    next.splice(fromIdx, 1);
    const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
    next.splice(insertAt, 0, fromKey);
    return next;
  }
```

**NEW (Lines 355-356):**
```typescript
  // Column order functions provided by composable
```

**Action:** Delete lines 355-415 entirely (all manual function definitions)

---

## Step 8: Remove onMount Initialization (Lines 418-421)

**OLD (Lines 418-421):**
```typescript
    const loaded = readOrderState();
    orderState.sticky = loaded.sticky;
    orderState.data = loaded.data;
    orderState.auditing = loaded.auditing;
```

**NEW (Lines 418-419):**
```typescript
    // Column order initialization handled by composable
```

**Action:** Delete lines 418-421 entirely

**Note:** The onMount function starts at line 417. Only remove the column order block, keep the view mode and deletion filter initialization.

---

## Step 9: Replace resetColumnsAndSorting Function (Find in component)

**OLD (Search for resetColumnsAndSorting function):**
```typescript
function resetColumnsAndSorting() {
  // ... existing reset logic ...
  orderState.sticky = undefined;
  orderState.data = undefined;
  orderState.auditing = undefined;
  writeOrderState({});
  // ... rest of function ...
}
```

**NEW (Replace with):**
```typescript
function resetColumnsAndSorting() {
  // ... existing reset logic ...
  columnOrder.reset();
  // ... rest of function ...
}
```

**Action:** Replace the manual reset logic with columnOrder.reset()

---

## Summary of Changes

| Step | Lines | Action | Complexity |
|------|-------|--------|------------|
| 1 | After 44 | Add import | Low |
| 2 | 227-231 | Delete type definition | Low |
| 3 | 233 | Replace state init | Low |
| 4 | 239,240,241,263,283,286 | Replace applyKeyOrder calls | Medium |
| 5 | Find | Replace moveKeyWithin call | Low |
| 6 | Find | Replace writeOrderState calls | Low |
| 7 | 355-415 | Delete function definitions | Medium |
| 8 | 418-421 | Delete onMount init | Low |
| 9 | Find | Replace reset logic | Low |

**Total Lines Modified:** ~70 lines deleted, ~10 lines added, ~6 lines modified

**Risk Level:** Medium - Multiple usage points need to be updated, but the composable provides the same interface

---

## Verification Steps

After completing all steps:

1. Run type check: `pnpm run check`
2. Verify no new errors in EntityListTable.svelte
3. The composable should handle:
   - SessionStorage persistence automatically
   - Initial value restoration on mount
   - All column ordering operations (applyKeyOrder, moveKeyWithin, reorderGroup)
   - Reset functionality
   - All edge cases (window undefined, quota exceeded, etc.)

---

## Notes

- The `useColumnOrder` composable is located at: `src/lib/components/entity-list-table/composables/useColumnOrder.svelte.ts`
- The composable accepts: `columnOrderStorageKey` (optional string)
- It returns: `{ orderState, applyKeyOrder, moveKeyWithin, reorderGroup, writeOrderState, reset }`
- The composable handles all sessionStorage operations internally
- The composable handles onMount initialization internally
- The composable provides the same methods that were previously defined manually
- All method signatures are identical to the manual implementations
