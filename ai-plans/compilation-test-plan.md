# Compilation Test Plan

## Overview
Run compilation test to verify that all Phase 2a refactoring changes compile successfully without errors.

## Current State
- ✅ Export state/functions refactored to useExport composable
- ⏳ Bulk actions refactor - NOT YET DONE
- ⏳ Row actions refactor - NOT YET DONE
- ⏳ Dialog state refactor - NOT YET DONE

## Pre-Test Verification

### Step 1: Check Current Compilation Status
Run typecheck to see current errors:
```bash
cd d:/git/primebrick-fe-v3
pnpm run check
```

**Expected**: May have errors from incomplete refactoring or pre-existing issues.

### Step 2: Document Pre-Test Errors
Record any errors found before completing the remaining refactors:
- Export-related errors (should be resolved if export refactor is complete)
- Bulk actions errors (expected if not yet refactored)
- Row actions errors (expected if not yet refactored)
- Dialog state errors (expected if not yet refactored)
- Pre-existing errors in other files (template-interpolate.ts, wheel-picker-group.svelte, etc.)

## Test Procedure

### Step 3: Run Typecheck
Execute the typecheck command:
```bash
cd d:/git/primebrick-fe-v3
pnpm run check
```

### Step 4: Analyze Results
Categorize errors by type:
1. **EntityListTable.svelte errors** - These are the ones we care about
2. **Composable errors** - useExport, useBulkActions, useRowActions, useDialogs
3. **Other file errors** - Pre-existing issues unrelated to our refactoring

### Step 5: Fix EntityListTable.svelte Errors
If there are errors in EntityListTable.svelte:
- Identify the error location (line number)
- Determine if it's related to the refactoring
- Apply targeted fixes
- Re-run typecheck

### Step 6: Fix Composable Errors
If there are errors in the composables:
- Identify which composable has the error
- Check the error type (type mismatch, missing import, etc.)
- Apply targeted fixes
- Re-run typecheck

### Step 7: Verify No New Errors
After fixing all refactoring-related errors:
- Run typecheck again
- Ensure no new errors were introduced
- Document any remaining pre-existing errors

## Expected Outcomes

### Success Criteria
- ✅ No errors in EntityListTable.svelte
- ✅ No errors in the composables (useExport, useBulkActions, useRowActions, useDialogs)
- ✅ All refactoring-related errors resolved
- ⚠️ Pre-existing errors in other files may remain (document these)

### Potential Issues
1. **Type mismatches** - Composable return types may not match expected types
2. **Missing imports** - Composables may not be properly imported
3. **Reactivity issues** - State may not be properly reactive
4. **Function signature mismatches** - Callback signatures may not match

## Rollback Plan

If critical errors cannot be resolved:
1. Document the errors
2. Revert the problematic changes
3. Report the issues to the user
4. Suggest alternative approaches

## Post-Test Actions

### If Successful
- Document the successful completion
- Update the todo list
- Proceed to next phase (Phase 2b or Phase 2c)

### If Unsuccessful
- Document the errors
- Create a plan to fix the errors
- Present the plan to the user for approval
