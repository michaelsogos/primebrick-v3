# EntityListTable Refactoring - Phase 14: Event Handler Organization

## Overview

This phase focuses on organizing event handlers in the main component into logical sections. This is a cleanup task to improve code organization and maintainability.

**Target Lines**: ~288 lines (lines 726-1013)  
**Risk Level**: Very Low  
**Estimated Time**: 1 hour  
**Expected Reduction**: 0 lines (organization only)

---

## Tasks

### 14.1 Organize Event Handlers into Logical Sections

**Status**: ❌ NOT STARTED  
**Target**: Lines 726-1013  
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Description**:
Group related event handlers into logical sections with clear comments for better code organization.

**Handler Groups**:

1. **Selection Handlers** (lines 726-740)
   - `toggleRowSelect`
   - `toggleAllOnPage`
   - `selectAllOnPage`
   - `clearSelection`

2. **Preview Handlers** (lines 741-760)
   - `handlePreviewRow`
   - `closePreviewPanel`
   - `navigatePreviewNext`
   - `navigatePreviewPrev`

3. **Export Handlers** (lines 761-780)
   - `handleBulkExport`
   - `handleHtmlExport`
   - `prepareEmailHtml`
   - `copyEmailHtmlToClipboard`

4. **Filter Handlers** (lines 781-820)
   - `resetFilters`
   - `resetColumnsAndSorting`
   - `toggleColumnKey`
   - `toggleSearchKey`

5. **Row Action Handlers** (lines 821-900)
   - `handleEditRow`
   - `handleDuplicateRow`
   - `handleDeleteRow`
   - `handleRestoreRow`
   - `loadVersionHistory`

6. **Toolbar Handlers** (lines 901-920)
   - `toggleToolbarMode`
   - `handleSortClick`
   - `toggleDatetimeIana`

7. **Dropdown Handlers** (lines 921-940)
   - `openRowDropdown`
   - `closeRowDropdown`

**Implementation Steps**:
1. Review all event handlers in the component
2. Group related handlers together
3. Add section comments for each group
4. Ensure consistent naming conventions
5. Add JSDoc comments for complex handlers
6. Verify no functionality is changed

---

### 14.2 Consider Extracting Handler Groups to Composables

**Status**: ❌ NOT STARTED  
**Target**: Large handler groups  
**Description**:
Evaluate if any handler groups are large enough to warrant extraction to separate composables.

**Candidates for Extraction**:
- Row action handlers (if they grow larger)
- Filter handlers (if they grow larger)
- Export handlers (if they grow larger)

**Decision Criteria**:
- Handler group > 50 lines
- Handler group has complex state management
- Handler group is reusable across components

**Implementation Steps**:
1. Evaluate each handler group
2. Identify candidates for extraction
3. Create composables for large groups
4. Update main component to use composables
5. Test extracted functionality

---

## Implementation Guidelines

### Code Style
- Follow existing code patterns in the codebase
- Maintain consistent naming conventions
- Add clear section comments
- Add JSDoc comments for complex functions
- Use consistent indentation and formatting

### Handler Organization
- Group related handlers together
- Use clear section headers
- Maintain alphabetical ordering within groups
- Keep handlers close to their usage

### Translations
- **CRITICAL**: Always add translation keys immediately when adding labels
- Follow existing translation key patterns
- Use `$t()` function for all user-facing text
- Check `docs/ai/i18n.md` for translation rules

### Testing
- Verify existing functionality is preserved
- Check for any broken references
- Test all event handlers
- Run typecheck: `pnpm run check`

### Git Workflow
- **NEVER commit automatically** - wait for explicit user instruction
- Follow GitFlow rules in `docs/gitflow.md`
- Create feature branches for refactoring work
- Get approval before merging

---

## Expected Results

### File Size Reduction
- **Before**: 1454 lines (after Phase 13)
- **After**: 1454 lines (no size change)
- **Reduction**: 0 lines (organization only)

### Code Quality Improvements
- Better code organization
- Improved readability
- Easier navigation
- Clearer handler responsibilities
- Better maintainability

---

## Notes

- This is a cleanup task with no functional changes
- Existing functionality will be preserved
- No breaking changes to component API
- Follow existing AGENTS.md rules
- Update this document as implementation progresses
- Focus on organization, not extraction
