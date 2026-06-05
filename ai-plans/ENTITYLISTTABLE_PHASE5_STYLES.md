# EntityListTable.svelte Refactoring - Phase 5: Extract Styles

## Overview

This phase focuses on extracting CSS animations from the main `EntityListTable.svelte` component to a separate CSS file. These are static styles that can be moved to a separate file for better organization.

**Target Lines:** ~58 lines  
**Risk Level:** Low  
**Estimated Time:** 30 minutes

---

## Tasks

### 5.1 Extract CSS to Separate File
**Target:** Lines 3636-3694 (~58 lines)

**New File:** `src/lib/components/entity-list-table/EntityListTable.css`

**Extract:**
- `@keyframes pb-watermark-pulse`
- `@keyframes pb-watermark-hourglass`
- `@keyframes pb-watermark-error`
- `.pb-watermark-empty` class
- `.pb-watermark-loading` class
- `.pb-watermark-error` class

**Action:**
- Import CSS file in main component: `<style src="./EntityListTable.css" />`

**Steps:**
1. Read `EntityListTable.svelte` lines 3636-3694
2. Extract all CSS animations and classes
3. Create `src/lib/components/entity-list-table/EntityListTable.css`
4. Add extracted CSS to new file
5. Update `EntityListTable.svelte` to import CSS file
6. Remove extracted CSS from main component
7. Test animations still work correctly

---

## Testing Checklist

- [ ] Watermark pulse animation works correctly
- [ ] Watermark hourglass animation works correctly
- [ ] Watermark error animation works correctly
- [ ] Empty state watermark displays correctly
- [ ] Loading state watermark displays correctly
- [ ] Error state watermark displays correctly
- [ ] No TypeScript errors: `pnpm run check`
- [ ] Dev server runs without errors: `pnpm run dev`
- [ ] Manual testing of affected features
- [ ] All existing functionality preserved

---

## Success Criteria

- [ ] CSS extracted to separate file
- [ ] Main component reduced by ~58 lines
- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] All features manually tested
- [ ] Code follows existing patterns and conventions
