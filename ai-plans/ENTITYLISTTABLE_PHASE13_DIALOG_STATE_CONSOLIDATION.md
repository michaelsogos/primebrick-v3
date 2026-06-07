# EntityListTable Refactoring - Phase 13: Dialog State Consolidation

## Overview

This phase focuses on consolidating dialog state into the existing `useDialogs` composable. Dialog state and handlers are currently scattered throughout the main component.

**Target Lines**: ~50 lines (scattered dialog state and handlers)  
**Risk Level**: Low  
**Estimated Time**: 1-2 hours  
**Expected Reduction**: ~50 lines

---

## Tasks

### 13.1 Consolidate Dialog State in useDialogs Composable

**Status**: ❌ NOT STARTED  
**Target**: Existing `useDialogs.svelte.ts` and main component  
**File**: `src/lib/components/entity-list-table/composables/useDialogs.svelte.ts`

**Description**:
Move dialog-specific state and handlers from the main component to the existing `useDialogs` composable.

**State to Move**:
```typescript
let rowToDelete: TRow | null = $state(null);
let rowToRestore: TRow | null = $state(null);
let singleRowToDuplicate: TRow | null = $state(null);
let duplicateScope = $state<'selected' | 'single'>('selected');
```

**Handlers to Move**:
- Dialog open/close handlers
- Row deletion handlers
- Row restoration handlers
- Row duplication handlers

**Implementation Steps**:
1. Review existing `useDialogs` composable
2. Add dialog state to composable
3. Add dialog handlers to composable
4. Update composable interface
5. Update main component to use enhanced composable
6. Remove extracted state and handlers from main component
7. Test dialog functionality

---

### 13.2 Update Main Component

**Status**: ❌ NOT STARTED  
**Target**: Main component  
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Description**:
Update the main component to use the enhanced dialog composable.

**Changes to Make**:
1. Remove dialog state variables
2. Remove dialog handler functions
3. Use composable state and handlers instead
4. Update dialog component props

**Implementation Steps**:
1. Remove dialog state variables from main component
2. Remove dialog handler functions from main component
3. Update dialog components to use composable state
4. Update dialog components to use composable handlers
5. Test all dialog functionality

---

## Implementation Guidelines

### Svelte 5 Patterns
- Use `$state()` for composable state
- Return functions and state from composable
- Use typed interfaces for composable options

### Code Style
- Follow existing composable patterns in the codebase
- Maintain consistent naming conventions
- Use TypeScript for all new composables
- Add proper JSDoc comments for complex functions

### Dialog Management
- Ensure dialog state is properly managed
- Handle dialog open/close correctly
- Maintain existing dialog behavior
- Handle edge cases (multiple dialogs, rapid open/close)

### Translations
- **CRITICAL**: Always add translation keys immediately when adding labels
- Follow existing translation key patterns
- Use `$t()` function for all user-facing text
- Check `docs/ai/i18n.md` for translation rules

### Testing
- Test each extracted function independently
- Verify existing functionality is preserved
- Check for any broken references
- Test all dialogs (delete, restore, duplicate, export)
- Test dialog state management
- Run typecheck: `pnpm run check`

### Git Workflow
- **NEVER commit automatically** - wait for explicit user instruction
- Follow GitFlow rules in `docs/gitflow.md`
- Create feature branches for refactoring work
- Get approval before merging

---

## Expected Results

### File Size Reduction
- **Before**: 1504 lines (after Phase 12)
- **After**: ~1454 lines
- **Reduction**: ~50 lines (3% from current)

### Code Quality Improvements
- Centralized dialog management
- Better separation of concerns
- Improved maintainability
- Easier testing of dialog functionality
- Clearer component responsibilities
- Consistent dialog patterns

---

## Notes

- All extractions will maintain backward compatibility
- Existing props interface will be preserved
- No breaking changes to component API
- Follow existing AGENTS.md rules
- Update this document as implementation progresses
- Ensure dialog state management works correctly
- Test all dialogs thoroughly
