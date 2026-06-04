# Step 1.5: Fix Compilation Errors

## Overview
Fix the compilation errors found in EntityListTable.svelte after Step 1 (Import and Initialize Composables).

## Current State
- Step 1 completed: Composables imported and initialized
- Compilation found 2 errors in EntityListTable.svelte (pre-existing, not caused by Step 1)
- 7 other errors in other files (pre-existing, not in scope)

## Errors to Fix

### Error 1: toolbarMode read-only property (Line 1232)
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 1232
**Error**: Cannot assign to 'toolbarMode' because it is a read-only property

**Current code at lines 1230-1232**:
```typescript
      // Clear selection after successful deletion
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toolbarMode = 'filters';
```

**Root cause**: `toolbarMode` is a read-only property in the useToolbarMode composable

**Solution**: Use the toggle() method instead of direct assignment

### Error 2: toolbarMode read-only property (Line 1307)
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 1307
**Error**: Cannot assign to 'toolbarMode' because it is a read-only property

**Current code at lines 1305-1307**:
```typescript
      // Clear selection after successful restore
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toolbarMode = 'filters';
```

**Root cause**: Same as Error 1

**Solution**: Use the toggle() method instead of direct assignment

## Actions

### Step 1.5.1: Fix toolbarMode assignment at Line 1232
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 1232

**Current code at lines 1230-1232**:
```typescript
      // Clear selection after successful deletion
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toolbarMode = 'filters';
```

**Replace**:
```typescript
      // Clear selection after successful deletion
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toggle();
```

**With**:
```typescript
      // Clear selection after successful deletion
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toggle();
```

### Step 1.5.2: Fix toolbarMode assignment at Line 1307
**File**: `primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte`
**Location**: Line 1307

**Current code at lines 1305-1307**:
```typescript
      // Clear selection after successful restore
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toolbarMode = 'filters';
```

**Replace**:
```typescript
      // Clear selection after successful restore
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toggle();
```

**With**:
```typescript
      // Clear selection after successful restore
      selectedKeys = [];
      // Switch back to filters mode
      toolbarModeState.toggle();
```

### Step 1.5.3: Verify Compilation
Run `pnpm run check` to ensure no compilation errors in EntityListTable.svelte.

## Expected Outcome
- toolbarMode assignment errors fixed
- EntityListTable.svelte compiles without errors
- Other pre-existing errors in other files remain (not in scope)
- Ready for commit and push

## Notes
- These errors are pre-existing and not caused by Step 1 modifications
- The fix uses the proper setter method from useToolbarMode composable
- This ensures the composable's internal state management is respected
