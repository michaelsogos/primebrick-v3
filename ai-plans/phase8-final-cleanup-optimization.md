# Phase 8: Final Cleanup and Optimization

## Overview
Perform final cleanup and optimization of EntityListTable.svelte by removing dead code, optimizing template structure, and consolidating state.

## Expected Reduction
~200 lines (5%) - from ~2232 to ~2032 lines

## Current State Analysis

### Potential Issues
- Unused imports
- Unused variables
- Commented-out code
- Redundant code
- Complex template nesting
- Redundant state variables
- Inefficient derived state

### Optimization Opportunities
- Template pattern extraction
- Conditional logic simplification
- State consolidation
- Import cleanup
- Code deduplication

## Target State
- No dead code remains
- Template is optimized
- State is consolidated
- Imports are clean
- Code is deduplicated
- All functionality works correctly
- Component is maintainable

## Prerequisites
- Phase 1 completed successfully
- Phase 2 completed successfully
- Phase 3 completed successfully
- Phase 4 completed successfully
- Phase 5 completed successfully
- Phase 6 completed successfully
- Phase 7 completed successfully
- EntityListTable.svelte at ~2232 lines
- All functionality currently working

## Actions

### 8.1 Remove Dead Code

#### Step 8.1.1: Identify Unused Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Import locations (lines 2-111)**:
- Line 3: `import { onMount, onDestroy, untrack } from 'svelte';` - **CHECK**: `onDestroy` appears unused (only `onMount` used at line 430, `untrack` used at line 1489)
- Line 51: `import XIcon from '@lucide/svelte/icons/x';` - **USED** at lines 1831, 2206, 2245
- Lines 52-92: Icon imports from lucide-svelte - **CHECK**: `TriangleAlert` (line 59) used at lines 2367, 2377, 3007, 3021
- Lines 93-97: Bootstrap icon imports - **CHECK**: All appear to be used in export functionality
- Lines 98-102: Choicebox components - **CHECK**: Verify if still used after toolbar extraction
- Line 103: `DialogBordered` - **CHECK**: Verify usage
- Lines 104-111: UI component imports - **CHECK**: Verify each for usage

**Specific imports to investigate**:
- **Line 3**: `onDestroy` - appears unused (search shows no usage)
- **Lines 98-102**: Choicebox components - may have been moved to toolbar
- **Line 103**: `DialogBordered` - verify if still used
- **Line 18**: `Dialog as DialogPrimitive` - verify if still used after dialog extraction

**Action**: Remove unused imports after verification

#### Step 8.1.2: Identify Unused Variables
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**State variables to investigate (lines 276-1284)**:
- **Line 276**: `let viewMode = $state<ViewMode>('table');` - **USED** throughout template
- **Line 310**: `let deletionFilterMode = $state<DeletionFilterMode>(...)` - **USED** in filters
- **Line 498**: `let lastPanelId = $state<string | null>(null);` - **USED** in sheet management
- **Line 779**: `let dropdownMenuRow = $state<TRow | null>(null);` - **USED** for row dropdown
- **Line 781**: `let previewDropdownOpen = $state(false);` - **CHECK** - may be unused after preview panel extraction
- **Line 784**: `let rowToDelete: TRow | null = $state(null);` - **USED** in delete dialog
- **Line 785**: `let rowToRestore: TRow | null = $state(null);` - **USED** in restore dialog
- **Line 786**: `let singleRowToDuplicate: TRow | null = $state(null);` - **USED** in duplicate dialog
- **Line 787**: `let duplicateScope = $state<'selected' | 'single'>('selected');` - **USED** in duplicate dialog
- **Line 801**: `let navigatingToNextPage = $state(false);` - **CHECK** - may be redundant
- **Line 802**: `let navigatingToPrevPage = $state(false);` - **CHECK** - may be redundant
- **Line 803**: `let previewPanelWidth = $state<number>(...)` - **USED** for panel resizing
- **Line 804**: `let isResizing = $state(false);` - **USED** for panel resizing
- **Line 805**: `let _previewRestoredKey = $state<string | null>(...)` - **USED** for preview restoration
- **Line 829**: `let resizeStartX = $state(0);` - **USED** for panel resizing
- **Line 830**: `let resizeStartWidth = $state(0);` - **USED** for panel resizing
- **Line 1233**: `let showSelectedOnly = $state(false);` - **USED** for selected-only view
- **Line 1234**: `let clientSelectedPage = $state(1);` - **USED** for selected-only pagination
- **Line 1235**: `let selectedRowByKey = $state(new Map<string, TRow>());` - **USED** for selected-only view
- **Line 1281**: `let tableRef = $state<HTMLTableElement | null>(null);` - **USED** for table reference
- **Line 1284**: `let prevRowsLoadingForServerList = $state(false);` - **CHECK** - may be unused

**Derived state to investigate**:
- **Line 598**: `const compactRows = $derived(true);` - **CHECK** - always true, could be removed
- **Line 599**: `const rowChromeH = $derived(compactRows ? 'h-6' : 'h-10');` - **DEPENDS** on compactRows
- **Line 601**: `const tableDensityClass = $derived(...)` - **USED** in template
- **Line 1169**: `const defaultSortDir = $derived(...)` - **USED** in sorting
- **Line 1170**: `const effectiveSortKey = $derived(...)` - **USED** in sorting
- **Line 1171**: `const pageSizeOptions = $derived(...)` - **USED** in pagination
- **Line 1172**: `const totalPages = $derived(...)` - **USED** in pagination
- **Line 1173**: `const allColumns = $derived(...)` - **USED** throughout
- **Line 1195**: `const datetimeIanaToggleColumns = $derived(...)` - **USED** for IANA toggle
- **Line 1196**: `const sortableColumns = $derived(...)` - **USED** for sorting
- **Line 1197**: `const searchableColumns = $derived(...)` - **USED** for search
- **Line 1198**: `const filterableColumns = $derived(...)` - **USED** for filters
- **Line 1199**: `const shownColumns = $derived(...)` - **USED** in template
- **Line 1200**: `const renderColumns = $derived(shownColumns)` - **REDUNDANT** - same as shownColumns
- **Line 1201**: `const stickyColumnsGroup = $derived(...)` - **USED** for sticky columns
- **Line 1237**: `const orderedSelectedRows = $derived(...)` - **USED** for selected-only view
- **Line 1562**: `const searchSyntaxParts = $derived(...)` - **USED** for search syntax highlighting
- **Line 1663**: `const loadingText = $derived(...)` - **USED** in template
- **Line 1664**: `const emptyText = $derived(...)` - **USED** in template
- **Line 1666**: `const selectionCount = $derived(...)` - **USED** in template
- **Line 1667**: `const selectionPastParticipleKey = $derived(...)` - **USED** in template

**Variables to potentially remove**:
- **Line 1200**: `const renderColumns = $derived(shownColumns)` - **REDUNDANT**, can use shownColumns directly
- **Line 598**: `const compactRows = $derived(true)` - **ALWAYS TRUE**, could be removed and inline the value
- **Line 781**: `let previewDropdownOpen = $state(false)` - **CHECK** if used after preview panel extraction
- **Line 801-802**: Navigation state variables - **CHECK** if redundant with preview panel composable
- **Line 1284**: `let prevRowsLoadingForServerList = $state(false)` - **CHECK** if still needed

#### Step 8.1.3: Remove Commented-Out Code
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Comment locations (69 comments found)**:
- **Line 261**: `// Utility functions moved to utils.ts` - **KEEP** - documents extraction
- **Line 294**: `// ignore quota / blocked storage` - **KEEP** - explains error handling
- **Line 302**: `// Read from sessionStorage eagerly...` - **KEEP** - documents timing
- **Line 328**: `// ignore quota / blocked storage` - **KEEP** - explains error handling
- **Line 361**: `// ignore quota / blocked storage` - **KEEP** - explains error handling
- **Line 368**: `// Reset column visual order...` - **KEEP** - documents reset logic
- **Line 373**: `// Reset sorting to default` - **KEEP** - documents reset logic
- **Line 442**: `// If the restored value differs...` - **KEEP** - explains parent notification
- **Line 448-451**: Multi-line comment about filter initialization - **KEEP** - documents timing
- **Line 478-479**: Comment about skipping initial firing - **KEEP** - explains effect behavior
- **Line 497**: `// Bridge the legacy filtersOpen boolean...` - **KEEP** - documents bridge
- **Line 503-504**: Comment about infinite reopen loop - **KEEP** - explains bug prevention
- **Line 514-516**: Multi-line comment about sheet panel props - **KEEP** - explains reactivity
- **Line 607**: `// Panels are mounted via global SheetHost...` - **KEEP** - documents architecture
- **Line 627**: `// Check if this is an audit field...` - **KEEP** - explains logic
- **Line 632**: `// Use _name if present...` - **KEEP** - explains fallback
- **Line 638**: `// For non-audit fields...` - **KEEP** - explains logic
- **Line 657**: `// In record mode we may show an IANA badge...` - **KEEP** - explains edge case
- **Line 790**: `// Export state is now managed by exportComposable` - **KEEP** - documents extraction
- **Line 800**: `// Preview panel state is now managed by previewPanel composable` - **KEEP** - documents extraction
- **Line 809**: `// While restoring, preserve the key...` - **KEEP** - explains restoration logic
- **Line 862**: `// Reset previewRowIndex when page changes` - **KEEP** - documents behavior
- **Lines 866, 870, 874**: Navigation comments - **KEEP** - explain pagination logic
- **Line 909**: `// Trigger next page when reaching end...` - **KEEP** - explains auto-pagination
- **Line 917**: `// Trigger previous page when at start...` - **KEEP** - explains auto-pagination
- **Line 941**: `// Skip table row navigation if any dropdown...` - **KEEP** - explains priority
- **Lines 961, 963, 965, 979, 981, 983**: Preview panel comments - **KEEP** - document composable usage
- **Line 1004-1005**: Focus removal comments - **KEEP** - explain bug prevention
- **Line 1016**: `// Open confirmation dialog instead of deleting directly` - **KEEP** - explains UX
- **Line 1024**: `// Open confirmation dialog instead of restoring directly` - **KEEP** - explains UX
- **Line 1118**: `// Bulk duplicate is handled separately...` - **KEEP** - explains separation
- **Line 1184**: `// Deduplicate by key, preserving order.` - **KEEP** - explains algorithm
- **Line 1205**: `// Back-compat: use sticky flag...` - **KEEP** - explains compatibility
- **Line 1241**: `// Check if any selected records are deleted` - **KEEP** - explains logic
- **Line 1246**: `// Check if all selected records are deleted` - **KEEP** - explains logic
- **Line 1294**: `// Sticky offsets (measured widths...)` - **KEEP** - documents purpose
- **Line 1301**: `// Scroll preservation` - **KEEP** - documents composable
- **Line 1307**: `// Row range selection` - **KEEP** - documents composable
- **Lines 1311, 1322, 1325, 1327, 1329**: Svelte ignore comments - **KEEP** - required for linting
- **Line 1333**: `// Toolbar mode` - **KEEP** - documents composable
- **Lines 1353, 1356, 1359**: Export callback comments - **KEEP** - document extension points
- **Lines 1367, 1370, 1373**: Bulk action callback comments - **KEEP** - document extension points
- **Line 1403**: `// Handle field change if needed` - **KEEP** - documents extension point
- **Line 1423-1424**: Multi-line comment about bg-clip-border - **KEEP** - explains CSS detail
- **Line 1631**: `// Avoid stray document-level handlers...` - **KEEP** - explains event handling

**Action**: All comments appear to be documentation rather than commented-out code. **NO ACTION NEEDED** - keep all comments as they explain complex logic and architectural decisions.

#### Step 8.1.4: Remove Redundant Code
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Redundant derived state (line 1200)**:
```typescript
// Line 1200 - REDUNDANT: same as shownColumns
const renderColumns = $derived(shownColumns);
```
**Action**: Replace all uses of `renderColumns` with `shownColumns` and remove line 1200

**Redundant constant (line 598)**:
```typescript
// Line 598 - ALWAYS TRUE: could be inlined
const compactRows = $derived(true);
```
**Action**: Remove line 598 and inline `true` wherever `compactRows` is used (line 599)

**Duplicate datetime IANA class functions (lines 673-712)**:
- `datetimeIanaCellHighlightClass` (line 699) - similar logic to other highlight functions
- `datetimeIanaCardFieldHighlightClass` (line 712) - similar pattern
**Action**: Consider consolidating these into a single parameterized function

**Duplicate card chrome class functions (lines 1213-1230)**:
- `stickyCardFieldChromeClass` (line 1213)
- `stickyCardFieldDestructiveChromeClass` (line 1223)
**Action**: These could be consolidated into a single function with a `destructive` parameter

**Duplicate navigation state (lines 801-802)**:
```typescript
// Lines 801-802 - May be redundant with preview panel composable
let navigatingToNextPage = $state(false);
let navigatingToPrevPage = $state(false);
```
**Action**: Check if these are still needed after preview panel extraction

### 8.2 Optimize Template

#### Step 8.2.1: Extract Repeated Template Patterns
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Repeated badge rendering pattern (lines 1857-1872, 1903-1918, 1951-1966)**:
```svelte
<!-- Pattern repeated 3 times for sticky/data/auditing columns -->
{#if col.type === 'badge' && col.badge?.values && row[col.key]}
  {#if row[col.key]}
    <Badge class={badgeClassesFromToken(col.badge.values[row[col.key]])}>
      {row[col.key]}
    </Badge>
  {/if}
{/if}
```
**Action**: Extract to a snippet or helper function `renderBadgeCell(col, row)`

**Repeated datetime IANA rendering pattern (lines 1869-1885, 1917-1933, 1965-1981)**:
```svelte
<!-- Pattern repeated 3 times for IANA datetime display -->
{#if isIanaRecordMode && parts.iana}
  <Badge variant="outline" class="text-[10px] h-4 px-1">
    {parts.iana}
  </Badge>
{/if}
```
**Action**: Extract to a snippet or helper function `renderIanaBadge(parts, isIanaRecordMode)`

**Repeated action button pattern in card view (lines 2595-2640, 2721-2766, 3170-3215)**:
```svelte
<!-- Edit/Duplicate/Preview/Delete actions repeated for each card view -->
{#if entityRowActions?.edit !== false}
  <Button onclick={() => onEditAction(r)} variant="ghost" size="icon-sm">
    <Pencil class="size-3.5" />
  </Button>
{/if}
```
**Action**: Extract to a snippet `renderRowActions(row, actionsEnabled)`

**Repeated column header pattern (lines 2830-2925, 3075-3135)**:
```svelte
<!-- Column header with sort indicators repeated in table/card views -->
{#if col.sortable !== false}
  <Button onclick={() => handleSortClick(col)} variant="ghost" size="sm">
    <!-- Sort icons -->
  </Button>
{/if}
```
**Action**: Extract to a snippet `renderColumnHeader(col, sortKey, sortDir)`

#### Step 8.2.2: Simplify Conditional Logic
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Nested conditionals to simplify**:

**Lines 1800-1808** - Nested delete check:
```svelte
{#if entityRowActions?.delete !== false}
  {#if rowDeleted}
    <Button onclick={() => handleRestoreRow(r)} variant="ghost" size="icon-sm">
      <RotateCcw class="size-3.5" />
    </Button>
  {:else}
    <Button onclick={() => handleDeleteRow(r)} variant="ghost" size="icon-sm">
      <Trash class="size-3.5" />
    </Button>
  {/if}
{/if}
```
**Action**: Extract to derived state `canDeleteRow` and `canRestoreRow`

**Lines 1869-1872** - Nested IANA badge check:
```svelte
{#if isIanaRecordMode && parts.iana}
  <Badge variant="outline" class="text-[10px] h-4 px-1">
    {parts.iana}
  </Badge>
{/if}
```
**Action**: Already optimized with logical AND

**Lines 2380-2387** - Complex empty state check:
```svelte
{#if showSelectedOnly && selectionCount > 0 && orderedSelectedRows.length === 0}
  <div class="text-center py-8 text-muted-foreground">
    {$t('entities.list.noSelectedRecords')}
  </div>
{/if}
```
**Action**: Extract to derived state `hasNoSelectedRecordsToShow`

**Lines 3024-3031** - Duplicate of above empty state check:
```svelte
{#if showSelectedOnly && selectionCount > 0 && orderedSelectedRows.length === 0}
  <div class="text-center py-8 text-muted-foreground">
    {$t('entities.list.noSelectedRecords')}
  </div>
{/if}
```
**Action**: Extract to snippet to avoid duplication

#### Step 8.2.3: Reduce Template Nesting
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Deeply nested structures to address**:

**Lines 1696-1888** - Preview panel snippet (very deep nesting):
```svelte
{#snippet entityPreviewPanel(row: TRow)}
  <div class="flex h-full flex-col bg-background">
    {#snippet headerTitle()}
      <div class="relative flex items-center">
        <!-- 4+ levels of nesting -->
      </div>
    {/snippet}
    <!-- More deeply nested content -->
  </div>
{/snippet}
```
**Action**: Already extracted as snippet, but could be further broken down

**Lines 1844-1888** - Sticky columns rendering (deep nesting):
```svelte
{#if stickyColumns && stickyColumns.length > 0}
  <div class="grid grid-cols-1 gap-2">
    {#each stickyColumnsGroup as col}
      <div class="flex items-start gap-2">
        {#if col.type === 'badge' && col.badge?.values && row[col.key]}
          {#if row[col.key]}
            <!-- 5+ levels of nesting -->
          {/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}
```
**Action**: Extract badge rendering to helper function to reduce nesting

**Lines 2538-2780** - Card list view rendering (very deep nesting):
```svelte
{#if viewMode === 'cards_list'}
  <div class="grid grid-cols-1 gap-3">
    {#each viewRows as r (rowKey(r))}
      <div class="group/entity-row relative">
        {#if rowSelectionEnabled}
          <div class="absolute left-2 top-2">
            <!-- 6+ levels of nesting -->
          </div>
        {/if}
        <!-- More deeply nested content -->
      </div>
    {/each}
  </div>
{/if}
```
**Action**: Extract card content to separate component or snippet

**Lines 3075-3240** - Table view cell rendering (deep nesting):
```svelte
{#each shownColumns as col (col.key)}
  <TableCell class={...}>
    {#if cell}
      {#render cell({ row: r, column: col })}
    {:else}
      {#if col.type === 'badge'}
        {#if col.badge?.values && r[col.key]}
          <!-- 5+ levels of nesting -->
        {/if}
      {/if}
    {/if}
  </TableCell>
{/each}
```
**Action**: Extract cell type rendering to helper functions

#### Step 8.2.4: Optimize Lists and Iterations
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**{#each} blocks to optimize**:

**Lines 1844-1888** - Sticky columns iteration:
```svelte
{#each stickyColumnsGroup as col (col.key)}
  <!-- Column rendering -->
{/each}
```
**Action**: Already has key, but could extract column rendering to helper

**Lines 1857-1872** - Badge values iteration (within each column):
```svelte
{#if col.type === 'badge' && col.badge?.values && row[col.key]}
  {#if row[col.key]}
    <Badge class={badgeClassesFromToken(col.badge.values[row[col.key]])}>
      {row[col.key]}
    </Badge>
  {/if}
{/if}
```
**Action**: Extract to helper function to avoid inline computation

**Lines 2538-2780** - Card list view iteration:
```svelte
{#each viewRows as r (rowKey(r))}
  <!-- Card rendering with complex inline logic -->
{/each}
```
**Action**: Extract card rendering to separate component to reduce template complexity

**Lines 2830-2925** - Table header iteration:
```svelte
{#each shownColumns as col (col.key)}
  <!-- Header rendering with sort logic -->
{/each}
```
**Action**: Extract header rendering to helper function

**Lines 3075-3240** - Table cell iteration:
```svelte
{#each shownColumns as col (col.key)}
  <!-- Cell rendering with type-specific logic -->
{/each}
```
**Action**: Extract cell type rendering to helper functions (already partially done with cell snippet)

**Lines 3492-3646** - Export preview iteration:
```svelte
{#each viewRows as r (rowKey(r))}
  <!-- Export preview rendering -->
{/each}
```
**Action**: Consider if this can be shared with main table rendering

**Find {#each} blocks**:
```bash
grep -n "{#each" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Optimize iterations**:
- Add :key to all {#each} blocks
- Use derived state for computed arrays
- Avoid complex computations in {#each} blocks
- Consider virtualization for large lists

**Example**:
```svelte
<!-- Before -->
{#each rows.filter(row => row.active) as row (row.id)}
  <Row {row} />
{/each}

<!-- After -->
{#each activeRows as row (row.id)}
  <Row {row} />
{/each}

<script>
  const activeRows = $derived(rows.filter(row => row.active));
</script>
```

### 8.3 Consolidate State

#### Step 8.3.1: Review State Variables
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**All state variables (21 found)**:

**Dialog state (lines 784-787)**:
```typescript
let rowToDelete: TRow | null = $state(null);        // Line 784
let rowToRestore: TRow | null = $state(null);       // Line 785
let singleRowToDuplicate: TRow | null = $state(null); // Line 786
let duplicateScope = $state<'selected' | 'single'>('selected'); // Line 787
```
**Action**: These could be consolidated into a single dialog state object

**Navigation state (lines 801-802)**:
```typescript
let navigatingToNextPage = $state(false);  // Line 801
let navigatingToPrevPage = $state(false);  // Line 802
```
**Action**: These could be merged into a single navigation state object or derived from preview panel state

**Preview panel state (lines 803-805, 829-830)**:
```typescript
let previewPanelWidth = $state<number>(...);     // Line 803
let isResizing = $state(false);                   // Line 804
let _previewRestoredKey = $state<string | null>(...); // Line 805
let resizeStartX = $state(0);                      // Line 829
let resizeStartWidth = $state(0);                 // Line 830
```
**Action**: Resize state (lines 804, 829-830) could be consolidated into a resize state object

**Selected-only view state (lines 1233-1235)**:
```typescript
let showSelectedOnly = $state(false);              // Line 1233
let clientSelectedPage = $state(1);                // Line 1234
let selectedRowByKey = $state(new Map<string, TRow>()); // Line 1235
```
**Action**: These are related and could be grouped into a selectedOnlyView state object

**Other state (lines 276, 310, 498, 779, 781, 1281, 1284)**:
```typescript
let viewMode = $state<ViewMode>('table');          // Line 276
let deletionFilterMode = $state<DeletionFilterMode>(...); // Line 310
let lastPanelId = $state<string | null>(null);     // Line 498
let dropdownMenuRow = $state<TRow | null>(null);  // Line 779
let previewDropdownOpen = $state(false);          // Line 781
let tableRef = $state<HTMLTableElement | null>(null); // Line 1281
let prevRowsLoadingForServerList = $state(false);  // Line 1284
```
**Action**: Review each for consolidation opportunities

#### Step 8.3.2: Merge Related State
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**State consolidation opportunities**:

**Dialog state consolidation (lines 784-787)**:
```typescript
// Before - separate dialog state variables
let rowToDelete: TRow | null = $state(null);
let rowToRestore: TRow | null = $state(null);
let singleRowToDuplicate: TRow | null = $state(null);
let duplicateScope = $state<'selected' | 'single'>('selected');

// After - consolidated dialog state
let dialogState = $state({
  rowToDelete: null as TRow | null,
  rowToRestore: null as TRow | null,
  singleRowToDuplicate: null as TRow | null,
  duplicateScope: 'selected' as 'selected' | 'single'
});
```
**Action**: Consolidate dialog state into single object, update all references

**Resize state consolidation (lines 804, 829-830)**:
```typescript
// Before - separate resize state variables
let isResizing = $state(false);
let resizeStartX = $state(0);
let resizeStartWidth = $state(0);

// After - consolidated resize state
let resizeState = $state({
  isResizing: false,
  startX: 0,
  startWidth: 0
});
```
**Action**: Consolidate resize state into single object, update all references

**Selected-only view state consolidation (lines 1233-1235)**:
```typescript
// Before - separate selected-only view state
let showSelectedOnly = $state(false);
let clientSelectedPage = $state(1);
let selectedRowByKey = $state(new Map<string, TRow>());

// After - consolidated selected-only view state
let selectedOnlyView = $state({
  show: false,
  page: 1,
  rowsByKey: new Map<string, TRow>()
});
```
**Action**: Consolidate selected-only view state into single object, update all references

**Navigation state consolidation (lines 801-802)**:
```typescript
// Before - separate navigation state
let navigatingToNextPage = $state(false);
let navigatingToPrevPage = $state(false);

// After - consolidated navigation state
let navigationState = $state({
  toNextPage: false,
  toPrevPage: false
});
```
**Action**: Consolidate navigation state OR consider removing if redundant with preview panel composable

#### Step 8.3.3: Convert Redundant State to Derived
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**State that can be converted to derived**:

**Line 598 - Always true constant**:
```typescript
// Before - state that never changes
const compactRows = $derived(true);

// After - inline the value
// Remove line 598, replace all uses with `true`
```
**Action**: Remove line 598 and inline `true` in line 599

**Line 1200 - Redundant derived state**:
```typescript
// Before - derived state that just copies another derived state
const renderColumns = $derived(shownColumns);

// After - use shownColumns directly
// Remove line 1200, replace all uses with shownColumns
```
**Action**: Remove line 1200 and replace all `renderColumns` references with `shownColumns`

**Lines 801-802 - Navigation state (potential)**:
```typescript
// Before - separate navigation state
let navigatingToNextPage = $state(false);
let navigatingToPrevPage = $state(false);

// After - derive from preview panel state if possible
const navigatingToNextPage = $derived(previewPanel.isNavigatingNext);
const navigatingToPrevPage = $derived(previewPanel.isNavigatingPrev);
```
**Action**: Check if preview panel composable already provides this state, if so convert to derived

**Line 781 - Preview dropdown state (potential)**:
```typescript
// Before - separate dropdown state
let previewDropdownOpen = $state(false);

// After - derive from dropdown menu state if possible
const previewDropdownOpen = $derived(dropdownMenuRow !== null);
```
**Action**: Check if this can be derived from `dropdownMenuRow` state

**Find state that can be derived**:
```bash
# Look for state that is computed from other state
grep -n "let.*\$state.*=" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Convert to derived state**:
- State that is computed from other state
- State that is a simple transformation
- State that is a combination of other state

**Example**:
```typescript
// Before
let hasSelection = $state(false);
let selectionCount = $state(0);

// Update in multiple places
selectedKeys = newKeys;
hasSelection = newKeys.length > 0;
selectionCount = newKeys.length;

// After
const hasSelection = $derived(selectedKeys.length > 0);
const selectionCount = $derived(selectedKeys.length);
```

#### Step 8.3.4: Remove Redundant Derived State
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte**

**Find all derived state**:
```bash
grep -n "\$derived" src/lib/components/entity-list-table/EntityListTable.svelte
```

**Check for redundant derived state**:
- Derived state that is only used once
- Derived state that is simpler to compute inline
- Derived state that duplicates other derived state

**Remove or simplify redundant derived state**

### 8.4 Optimize Imports

#### Step 8.4.1: Remove Unused Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Specific imports to remove**:

**Line 3 - Unused import**:
```typescript
import { onMount, onDestroy, untrack } from 'svelte';
```
**Action**: Change to `import { onMount, untrack } from 'svelte';` (remove `onDestroy` - not used anywhere in file)

**Lines 98-102 - Choicebox components (verify if unused)**:
```typescript
import Choicebox from '$lib/components/ui/choicebox/choicebox.svelte';
import ChoiceboxItem from '$lib/components/ui/choicebox/choicebox-item.svelte';
import ChoiceboxTitle from '$lib/components/ui/choicebox/choicebox-title.svelte';
import ChoiceboxDescription from '$lib/components/ui/choicebox/choicebox-description.svelte';
import ChoiceboxIndicator from '$lib/components/ui/choicebox/choicebox-indicator.svelte';
```
**Action**: Search for usage - these may have been moved to toolbar component during extraction

**Line 18 - DialogPrimitive (verify if unused)**:
```typescript
import { Dialog as DialogPrimitive } from 'bits-ui';
```
**Action**: Search for usage - may have been moved to dialog components during extraction

**Lines 104-111 - UI components (verify each)**:
```typescript
import * as Dock from '$lib/components/ui/dock';
import * as Resizable from '$lib/components/ui/resizable';
import { ScrollArea } from '$lib/components/ui/scroll-area';
import { Skeleton } from '$lib/components/ui/skeleton';
import { Card, CardContent } from '$lib/components/ui/card';
import { Window } from '$lib/components/ui/window';
import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
import * as Timeline from '$lib/components/ui/timeline';
```
**Action**: Verify each for usage in the template

#### Step 8.4.2: Group Related Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Current import structure (lines 2-111)**:
- Lines 2-3: Svelte imports
- Lines 4-5: i18n imports
- Lines 6-24: UI component imports
- Lines 25-30: Local component imports (panels, toolbar, table, cards, dialogs, pagination)
- Lines 31-37: Composable imports
- Lines 38-42: Utility imports
- Lines 43-47: Additional composable imports
- Lines 48-50: Entity-list imports
- Lines 51-97: Icon imports
- Lines 98-111: Additional UI component imports

**Action**: Reorganize imports into logical groups:
1. Svelte imports (lines 2-3)
2. Internal library imports (lines 4-5, 21-24)
3. Type imports (lines 2, 23, 48)
4. Local component imports (lines 25-30)
5. Composable imports (lines 31-37, 43-47)
6. Utility imports (lines 38-42, 20)
7. UI component imports (lines 6-19, 98-111)
8. Icon imports (lines 51-97)

#### Step 8.4.3: Remove Unused Icon Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Icon imports (lines 51-97)**:
- Lines 52-92: Lucide icons (40 icons)
- Lines 93-97: Bootstrap icons (5 icons)

**Action**: Verify each icon for usage:
- **Line 51**: `XIcon` - USED at lines 1831, 2206, 2245
- **Line 59**: `TriangleAlert` - USED at lines 2367, 2377, 3007, 3021
- **Lines 93-97**: Bootstrap icons - USED in export functionality
- **Other icons**: Verify each for usage in template

#### Step 8.4.4: Optimize Type Imports
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Type imports (lines 2, 23, 48)**:
- Line 2: `import type { Snippet } from 'svelte';` - USED throughout
- Line 23: `import type { RFC7807Error } from '$lib/errors/rfc7807';` - VERIFY usage
- Line 48: `import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';` - USED throughout

**Action**: Verify line 23 for usage, may be unused after error handling extraction

### 8.5 Code Deduplication

#### Step 8.5.1: Find Duplicate Functions
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Duplicate class functions (lines 673-712)**:
- `datetimeIanaCellHighlightClass` (line 699)
- `datetimeIanaCardFieldHighlightClass` (line 712)
- `stickyCardFieldChromeClass` (line 1213)
- `stickyCardFieldDestructiveChromeClass` (line 1223)

**Action**: Consolidate into parameterized functions:
```typescript
// Consolidate IANA highlight functions
function datetimeIanaHighlightClass(col: MetaColumn, context: 'cell' | 'card', rowSelected?: boolean): string | undefined {
  if (!isDatetimeIanaRecordMode(col)) return undefined;
  if (context === 'cell' && rowSelected) {
    return 'bg-amber-200/95! dark:bg-amber-800! transition-colors group-hover/entity-row:bg-amber-300/95! dark:group-hover/entity-row:bg-amber-700!';
  }
  if (context === 'cell') {
    return 'bg-amber-50! dark:bg-amber-950! transition-colors group-hover/entity-row:bg-amber-100/95! dark:group-hover/entity-row:bg-amber-900!';
  }
  if (context === 'card' && rowSelected) {
    return 'rounded-md border border-amber-300/80 bg-amber-300/85 p-2 transition-colors group-hover:bg-amber-400/90 dark:border-amber-600 dark:bg-amber-700 dark:group-hover:bg-amber-600';
  }
  if (context === 'card') {
    return 'rounded-md border border-amber-200/80 bg-amber-100/90 p-2 transition-colors group-hover:bg-amber-200/90 dark:border-amber-900 dark:bg-amber-900 dark:group-hover:bg-amber-800';
  }
}

// Consolidate card chrome functions
function cardFieldChromeClass(col: MetaColumn, destructive: boolean, rowSelected: boolean): string | undefined {
  const stickyKeys = new Set(stickyColumnsGroup.map((c) => c.key));
  if (!stickyKeys.has(col.key)) return undefined;

  const baseClass = 'rounded-md border p-2 transition-colors group-hover';
  if (destructive) {
    if (rowSelected) {
      return `${baseClass} border-rose-300/80 bg-rose-300/85 group-hover:bg-rose-400/90 dark:border-rose-600 dark:bg-rose-700 dark:group-hover:bg-rose-600`;
    }
    return `${baseClass} border-rose-200/80 bg-rose-100/90 group-hover:bg-rose-200/90 dark:border-rose-900 dark:bg-rose-900 dark:group-hover:bg-rose-800`;
  }
  if (rowSelected) {
    return `${baseClass} border-gray-300/80 bg-gray-200/85 group-hover:bg-gray-300/90 dark:border-neutral-600 dark:bg-neutral-700 dark:group-hover:bg-neutral-600`;
  }
  return `${baseClass} border-gray-200/80 bg-gray-100/90 group-hover:bg-gray-200/90 dark:border-neutral-800 dark:bg-neutral-900 dark:group-hover:bg-neutral-800`;
}
```

#### Step 8.5.2: Find Duplicate Template Code
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Duplicate badge rendering (lines 1857-1872, 1903-1918, 1951-1966)**:
**Action**: Extract to helper function `renderBadgeCell(col, row)`

**Duplicate IANA badge rendering (lines 1869-1885, 1917-1933, 1965-1981)**:
**Action**: Extract to helper function `renderIanaBadge(parts, isIanaRecordMode)`

**Duplicate action buttons (lines 2595-2640, 2721-2766, 3170-3215)**:
**Action**: Extract to snippet `renderRowActions(row, actionsEnabled)`

**Duplicate empty state (lines 2380-2387, 3024-3031)**:
**Action**: Extract to snippet `renderEmptyState(message)`

#### Step 8.5.3: Find Duplicate Logic
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Duplicate column type checking**:
- Lines 1857, 1903, 1951: `col.type === 'badge' && col.badge?.values && row[col.key]`
- Lines 2036, 2075: `col.type === 'boolean'`, `col.type === 'datetime'`

**Action**: Extract to helper functions:
```typescript
function isBadgeColumn(col: MetaColumn, row: TRow): boolean {
  return col.type === 'badge' && col.badge?.values && row[col.key];
}

function isBooleanColumn(col: MetaColumn): boolean {
  return col.type === 'boolean';
}

function isDatetimeColumn(col: MetaColumn): boolean {
  return col.type === 'datetime';
}
```

### 8.6 Final Verification

#### Step 8.6.1: Code Quality Check
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Perform manual code review**:
- Check for consistent code style
- Verify naming conventions
- Ensure proper error handling
- Check for magic numbers
- Verify proper type usage

**Specific checks**:
- **Line 598**: `const compactRows = $derived(true)` - magic constant, should be removed
- **Line 1200**: `const renderColumns = $derived(shownColumns)` - redundant, should be removed
- **Lines 801-802**: Navigation state - check if still needed after preview panel extraction
- **Line 781**: `previewDropdownOpen` - check if still needed
- **Line 1284**: `prevRowsLoadingForServerList` - check if still needed

#### Step 8.6.2: Line Count Verification
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Expected reduction**: ~200 lines (5%) - from ~2232 to ~2032 lines

**Verify line count after changes**:
```bash
wc -l src/lib/components/entity-list-table/EntityListTable.svelte
```

**Expected sources of reduction**:
- Remove unused imports: ~5-10 lines
- Remove unused variables: ~10-15 lines
- Remove redundant derived state: ~2-5 lines
- Consolidate state variables: ~5-10 lines
- Extract repeated template patterns: ~30-50 lines
- Consolidate duplicate functions: ~20-30 lines
- Remove redundant code: ~10-20 lines
- Import reorganization: ~0 lines (reorganization only)

#### Step 8.6.3: Functionality Verification
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Test all functionality after refactoring**:
- Table view rendering
- Card view rendering
- Column sorting
- Row selection
- Bulk actions
- Filters
- Search
- Export functionality
- Preview panel
- Dialog interactions
- Responsive behavior

**Run typecheck**:
```bash
pnpm run check
```

**Run build**:
```bash
pnpm run build
```

#### Step 8.6.4: Performance Verification
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Verify performance improvements**:
- Check for unnecessary re-renders
- Verify derived state efficiency
- Ensure no performance regressions
- Test with large datasets

#### Step 8.6.5: Maintainability Verification
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Verify maintainability improvements**:
- Code is easier to understand
- Functions are smaller and focused
- State is well-organized
- Template is less nested
- Duplicated code is eliminated
- Comments are preserved where needed

## Summary of Line Number Changes

### Imports to Remove (Lines 2-111)
- **Line 3**: Remove `onDestroy` from svelte imports (-1 line)
- **Lines 98-102**: Remove Choicebox components if unused (-5 lines)
- **Line 18**: Remove `DialogPrimitive` if unused (-1 line)
- **Lines 104-111**: Remove unused UI components (-0 to -8 lines)

### Variables to Remove (Lines 276-1284)
- **Line 598**: Remove `compactRows` derived state (-1 line)
- **Line 1200**: Remove `renderColumns` derived state (-1 line)
- **Line 781**: Remove `previewDropdownOpen` if unused (-1 line)
- **Lines 801-802**: Remove navigation state if redundant (-2 lines)
- **Line 1284**: Remove `prevRowsLoadingForServerList` if unused (-1 line)

### State Consolidation (Lines 784-787, 804, 829-830, 1233-1235)
- **Lines 784-787**: Consolidate dialog state (-3 lines net)
- **Lines 804, 829-830**: Consolidate resize state (-2 lines net)
- **Lines 1233-1235**: Consolidate selected-only view state (-2 lines net)

### Function Consolidation (Lines 673-712, 1213-1230)
- **Lines 673-712**: Consolidate IANA highlight functions (-15 lines net)
- **Lines 1213-1230**: Consolidate card chrome functions (-10 lines net)

### Template Pattern Extraction (Lines 1857-1872, 1903-1918, 1951-1966, 2595-2640, etc.)
- **Lines 1857-1872, 1903-1918, 1951-1966**: Extract badge rendering (-30 lines net)
- **Lines 2595-2640, 2721-2766, 3170-3215**: Extract action buttons (-45 lines net)
- **Lines 2380-2387, 3024-3031**: Extract empty state (-10 lines net)

### Expected Total Reduction
- **Minimum**: ~50 lines (conservative estimates)
- **Expected**: ~150-200 lines (based on analysis)
- **Maximum**: ~250 lines (if all optimizations applied)

### Verification Commands
```bash
# Check current line count
wc -l src/lib/components/entity-list-table/EntityListTable.svelte

# Typecheck after changes
pnpm run check

# Build after changes
pnpm run build
```

## Implementation Order

1. **Step 8.1.1**: Remove unused imports (safest, immediate impact)
2. **Step 8.1.2**: Remove unused variables (safest, immediate impact)
3. **Step 8.3.3**: Convert redundant state to derived (low risk)
4. **Step 8.3.2**: Merge related state (moderate risk, requires testing)
5. **Step 8.5.1**: Consolidate duplicate functions (moderate risk)
6. **Step 8.2.1**: Extract repeated template patterns (moderate risk)
7. **Step 8.2.2**: Simplify conditional logic (moderate risk)
8. **Step 8.2.3**: Reduce template nesting (higher risk, requires testing)
9. **Step 8.2.4**: Optimize lists and iterations (higher risk, requires testing)
10. **Step 8.6**: Final verification (must be done after all changes)

#### Step 8.6.2: Performance Check
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for performance issues**:
- Identify expensive computations in templates
- Check for unnecessary re-renders
- Verify efficient state updates
- Check for memory leaks

#### Step 8.6.3: Accessibility Check
**File**: `src/lib/components/entity-list-table/EntityListTable.svelte`

**Check for accessibility issues**:
- Verify ARIA labels
- Check keyboard navigation
- Ensure proper semantic HTML
- Verify color contrast

## Verification Steps

### Step 1: Type Check
```bash
cd D:\git\primebrick\primebrick-fe-v3
pnpm run check
```

**Expected**: No TypeScript errors

### Step 2: Build Check
```bash
pnpm run build
```

**Expected**: Build succeeds without errors

### Step 3: Lint Check (if available)
```bash
pnpm run lint
```

**Expected**: No linting errors

### Step 4: Manual Testing
Test the following functionality comprehensively:
1. All features from previous phases
2. Component rendering
3. State management
4. Event handling
5. Performance under load
6. Responsive behavior
7. Accessibility features

**Expected**: All functionality works correctly

### Step 5: Line Count Verification
```bash
powershell -Command "(Get-Content 'D:\git\primebrick\primebrick-fe-v3\src\lib\components\entity-list-table\EntityListTable.svelte' | Measure-Object -Line).Lines"
```

**Expected**: ~2032 lines (reduction of ~200 lines from ~2232)

### Step 6: Code Quality Metrics
**Check code quality**:
- Cyclomatic complexity
- Code duplication percentage
- Maintainability index
- Test coverage (if available)

**Expected**: Improved code quality metrics

## Acceptance Criteria
- ✅ No dead code remains
- ✅ No unused imports remain
- ✅ No unused variables remain
- ✅ No commented-out code remains
- ✅ Template is optimized
- ✅ Conditional logic is simplified
- ✅ Template nesting is reduced
- ✅ State is consolidated
- ✅ Redundant state removed
- ✅ Imports are organized
- ✅ Code is deduplicated
- ✅ Code style is consistent
- ✅ No compilation errors
- ✅ All functionality works correctly
- ✅ Performance is maintained or improved
- ✅ Accessibility is maintained
- ✅ Line count reduced by ~200 lines

## Rollback Strategy
If issues occur:
1. Revert to previous commit: `git checkout HEAD~1`
2. Or manually revert specific changes
3. Document what failed and why
4. Create a more conservative cleanup plan

## Notes
- This phase is the final cleanup and optimization
- Changes should be incremental and tested
- Each optimization should be verified independently
- Performance should be monitored during optimization
- Accessibility must be maintained
- This is a low complexity, low risk phase
- Focus on maintainability and code quality
- Some optimizations may require trade-offs
- Document any performance implications
- Consider creating a separate optimization branch

## Post-Phase Summary

After completing Phase 8, the EntityListTable component should be:
- **Reduced in size**: From 4162 lines to ~2032 lines (51% reduction)
- **More maintainable**: Clear separation of concerns
- **Better organized**: Logical component structure
- **More performant**: Optimized state and template
- **Easier to test**: Smaller, focused components
- **More accessible**: Cleaner code structure

The refactoring is complete and the component is now in a much better state for future development and maintenance.
