# EntityListTable.svelte Refactoring - Phase 5: Extract Styles

## Overview

This phase focuses on extracting CSS animations from the main `EntityListTable.svelte` component to a separate CSS file. These are static styles that can be moved to a separate file for better organization.

**Target Lines:** 2826-2884 (59 lines)  
**Risk Level:** Low  
**Estimated Time:** 30 minutes

---

## Tasks

### 5.1 Extract CSS to Separate File
**Target:** Lines 2826-2884 (59 lines)

**New File:** `src/lib/components/entity-list-table/EntityListTable.css`

**Extract:**
- `@keyframes pb-watermark-pulse` (lines 2827-2837)
- `@keyframes pb-watermark-hourglass` (lines 2839-2856)
- `@keyframes pb-watermark-error` (lines 2868-2878)
- `.pb-watermark-empty` class (lines 2858-2861)
- `.pb-watermark-loading` class (lines 2863-2866)
- `.pb-watermark-error` class (lines 2880-2883)

**Current CSS in EntityListTable.svelte (lines 2826-2884):**
```css
<style>
  @keyframes pb-watermark-pulse {
    0%,
    100% {
      opacity: 0.12;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 0.22;
      transform: translateY(-6px) scale(1.06);
    }
  }

  @keyframes pb-watermark-hourglass {
    0% {
      transform: rotate(0deg) scale(1);
      opacity: 0.12;
    }
    45% {
      transform: rotate(0deg) scale(1.06);
      opacity: 0.22;
    }
    55% {
      transform: rotate(180deg) scale(1.06);
      opacity: 0.22;
    }
    100% {
      transform: rotate(180deg) scale(1);
      opacity: 0.12;
    }
  }

  .pb-watermark-empty {
    transform-origin: center;
    animation: pb-watermark-pulse 2.6s ease-in-out infinite;
  }

  .pb-watermark-loading {
    transform-origin: center;
    animation: pb-watermark-hourglass 1.8s ease-in-out infinite alternate;
  }

  @keyframes pb-watermark-error {
    0%,
    100% {
      opacity: 0.1;
      transform: scale(1);
    }
    50% {
      opacity: 0.18;
      transform: scale(1.05);
    }
  }

  .pb-watermark-error {
    transform-origin: center;
    animation: pb-watermark-error 2.2s ease-in-out infinite;
  }
</style>
```

**Action:**
- Import CSS file in main component: `<style src="./EntityListTable.css" />`

**Usage locations in EntityListTable.svelte:**
- Line 1642: `<div class="pb-watermark-loading">` (loading state in cards view)
- Line 1658: `<div class="pb-watermark-error">` (error state in cards view)
- Line 1673: `<div class="pb-watermark-loading">` (loading state in cards view with LoadingBar)
- Line 1687: `<div class="pb-watermark-empty">` (empty state in cards view)
- Line 1697: `<div class="pb-watermark-empty">` (empty state in cards view with custom message)
- Line 2290: `<div class="pb-watermark-error">` (error state in table view)
- Line 2309: `<div class="pb-watermark-loading">` (loading state in table view)
- Line 2327: `<div class="pb-watermark-empty">` (empty state in table view)
- Line 2341: `<div class="pb-watermark-empty">` (empty state in table view with custom message)

**Steps:**
1. Read `EntityListTable.svelte` lines 2826-2884 to verify CSS content
2. Create `src/lib/components/entity-list-table/EntityListTable.css` with extracted CSS
3. Update `EntityListTable.svelte` line 2826 to import CSS file: `<style src="./EntityListTable.css" />`
4. Remove lines 2827-2884 (the extracted CSS) from main component
5. Test animations still work correctly in all usage locations

**Refactoring Approach:**
- The CSS animations are static and have no component-specific dependencies
- They are used across multiple view modes (table and cards)
- Extracting to a separate CSS file follows Svelte best practices for shared styles
- The `<style src="./EntityListTable.css" />` directive is the standard Svelte way to import external CSS files
- This refactoring reduces the main component size by 59 lines without any functional changes

---

## Testing Checklist

- [ ] Watermark pulse animation works correctly (empty states)
- [ ] Watermark hourglass animation works correctly (loading states)
- [ ] Watermark error animation works correctly (error states)
- [ ] Cards view empty state displays correctly (lines 1687, 1697)
- [ ] Cards view loading state displays correctly (lines 1642, 1673)
- [ ] Cards view error state displays correctly (line 1658)
- [ ] Table view empty state displays correctly (lines 2327, 2341)
- [ ] Table view loading state displays correctly (line 2309)
- [ ] Table view error state displays correctly (line 2290)
- [ ] No TypeScript errors: `pnpm run check`
- [ ] Dev server runs without errors: `pnpm run dev`
- [ ] Manual testing of affected features
- [ ] All existing functionality preserved

---

## Success Criteria

- [ ] CSS extracted to separate file (`EntityListTable.css`)
- [ ] Main component reduced by 59 lines (2826-2884)
- [ ] CSS import statement added: `<style src="./EntityListTable.css" />`
- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] All watermark animations work correctly in both table and cards views
- [ ] All features manually tested
- [ ] Code follows existing patterns and conventions
