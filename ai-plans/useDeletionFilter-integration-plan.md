# useDeletionFilter Composable Integration Plan

## Overview
This plan details the step-by-step refactoring to integrate the `useDeletionFilter` composable into `EntityListTable.svelte`, replacing manual deletion filter state management with the composable.

## File Location
`D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte`

---

## Step 1: Add Import (Line 54)

**OLD (Line 54):**
```typescript
import { useDeletionFilter } from './composables/useDeletionFilter.svelte';
```

**NEW (Line 54):**
```typescript
import { useDeletionFilter } from './composables/useDeletionFilter.svelte';
```

**Status:** ✅ Already completed in previous attempts

---

## Step 2: Remove Local Type Definition (Line 321)

**OLD (Line 321):**
```typescript
  type DeletionFilterMode = 'non_deleted' | 'deleted' | 'all';
```

**NEW (Line 321):**
```typescript
  // Type already imported from types.ts
```

**Action:** Delete line 321 entirely

---

## Step 3: Replace Manual State and Functions (Lines 322-353)

**OLD (Lines 322-353):**
```typescript
  const deletionFilterStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:deletionFilter` : `pb.entityList:${uid}:deletionFilter`
  );
  // Read from sessionStorage eagerly (before effects run) to avoid the effect overwriting the stored value
  const _rawDeletion = (() => {
    if (typeof window === 'undefined') return null;
    const key = columnOrderStorageKey ? `${columnOrderStorageKey}:deletionFilter` : `pb.entityList:${uid}:deletionFilter`;
    return window.sessionStorage.getItem(key);
  })();
  const _initialDeletionMode: DeletionFilterMode | null =
    _rawDeletion === 'non_deleted' || _rawDeletion === 'deleted' || _rawDeletion === 'all' ? _rawDeletion : null;
  let deletionFilterMode = $state<DeletionFilterMode>(_initialDeletionMode ?? deletionFilterModeProp ?? 'non_deleted');

  function readDeletionFilter(): DeletionFilterMode | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(deletionFilterStorageKey);
      if (raw === 'non_deleted' || raw === 'deleted' || raw === 'all') return raw;
      return null;
    } catch {
      return null;
    }
  }

  function writeDeletionFilter(next: DeletionFilterMode) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(deletionFilterStorageKey, next);
    } catch {
      // ignore quota / blocked storage
    }
  }
```

**NEW (Lines 322-327):**
```typescript
  // Deletion filter management using composable
  const deletionFilterComposable = useDeletionFilter(
    uid,
    columnOrderStorageKey,
    deletionFilterModeProp ?? 'non_deleted',
    onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);
```

**Action:** Replace lines 322-353 with the composable initialization

---

## Step 4: Remove onMount Initialization (Lines 426-433)

**OLD (Lines 426-433):**
```typescript
    const storedDeletionFilter = readDeletionFilter();
    if (storedDeletionFilter) {
      deletionFilterMode = storedDeletionFilter;
      // If the restored value differs from what the parent passed, notify the parent so it re-fetches
      if (storedDeletionFilter !== (deletionFilterModeProp ?? 'non_deleted')) {
        onDeletionFilterModeChange?.(storedDeletionFilter);
      }
    }
```

**NEW (Lines 426-427):**
```typescript
    // Deletion filter initialization handled by composable
```

**Action:** Delete lines 426-433 entirely

**Note:** The onMount function starts at line 417. Only remove the deletion filter block, keep the column order and view mode initialization.

---

## Step 5: Remove Manual $effect (Lines 441-450)

**OLD (Lines 441-450):**
```typescript
  let lastDeletionFilterMode: typeof deletionFilterMode | null = null;
  $effect(() => {
    void deletionFilterMode;
    writeDeletionFilter(deletionFilterMode);
    // Skip the initial firing so we don't trigger an extra refresh on mount when the
    // value didn't actually change (the parent already holds the same value).
    if (lastDeletionFilterMode !== null && lastDeletionFilterMode !== deletionFilterMode) {
      onDeletionFilterModeChange?.(deletionFilterMode);
    }
    lastDeletionFilterMode = deletionFilterMode;
  });
```

**NEW (Lines 441-442):**
```typescript
  // Deletion filter persistence handled by composable
```

**Action:** Delete lines 441-450 entirely

---

## Step 6: Replace Toolbar Handler (Line 1250)

**OLD (Line 1250):**
```typescript
    onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}
```

**NEW (Line 1250):**
```typescript
    onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}
```

**Action:** Replace the inline handler with the composable method

---

## Summary of Changes

| Step | Lines | Action | Complexity |
|------|-------|--------|------------|
| 1 | 54 | ✅ Already done | Low |
| 2 | 321 | Delete line | Low |
| 3 | 322-353 | Replace with composable | Medium |
| 4 | 426-433 | Delete block | Low |
| 5 | 441-450 | Delete block | Low |
| 6 | 1250 | Replace handler | Low |

**Total Lines Modified:** ~45 lines deleted, ~6 lines added

**Risk Level:** Low - The composable handles all the same logic (sessionStorage persistence, initialization, parent notification)

---

## Verification Steps

After completing all steps:

1. Run type check: `pnpm run check`
2. Verify no new errors in EntityListTable.svelte
3. The composable should handle:
   - SessionStorage persistence automatically
   - Initial value restoration on mount
   - Parent notification when value changes
   - All edge cases (window undefined, quota exceeded, etc.)

---

## Notes

- The `useDeletionFilter` composable is located at: `src/lib/components/entity-list-table/composables/useDeletionFilter.svelte.ts`
- The composable accepts: `uid`, `columnOrderStorageKey`, `deletionFilterModeProp`, and `onDeletionFilterModeChange`
- It returns: `{ deletionFilterMode, setDeletionFilterMode }`
- The composable handles all sessionStorage operations internally
- The composable handles onMount initialization internally
- The composable handles parent notification internally via the callback
