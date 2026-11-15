# Plan: Reusable Selectable Fieldset + Selection Components (DRY)

## Objective

Extract the selection/bulk-action/fieldset pattern from `ConfigList` (used in `/security`) into reusable components + composable, then apply them to the AI settings cache section (`/system/settings/ai`) with TWO independent selectable fieldsets: one for censused models, one for orphaned models.

## Context (empirical findings)

### Current /security pattern (ConfigList.svelte, lines 269-372)
- **Sticky toolbar** at top: select-all checkbox + bulk action CTAs (delete, revert)
- **Ungrouped entries**: rendered as ConfigListRow cards
- **Grouped entries**: wrapped in a fieldset with:
  - Gradient label: `bg-linear-to-br from-sky-400 to-indigo-400 text-white px-3 pt-1 pb-1 rounded-t-md relative z-10 w-fit ml-3`
  - Gradient border container: `border-primary-gradient rounded-lg px-3 pt-3 pb-3 space-y-3`
- **Selection state**: `selectedUuids = $state<Set<string>>(new Set())` with reassignment pattern
- **Select-all**: `allSelected` (derived), `someSelected` (derived, indeterminate), `handleToggleSelectAll`
- **Bulk delete CTA**: appears when `selectedEntries.length > 0`

### Current ConfigListRow.svelte (lines 54-74)
- Container: `grid grid-cols-12 items-center rounded-lg border bg-background p-3 gap-4 border-l-[5px] cursor-pointer select-none`
- Left border color: `{tainted ? 'border-l-warning' : selected ? 'border-l-primary' : 'border-l-border'}`
- Click-to-toggle: `onclick` excludes interactive elements (input, button, a, combobox, etc.)
- Checkbox inside the grid (col-span-6)

### Current AI cache section (ModelCacheSection.svelte)
- Progress bar with refresh CTA
- Flat list of censused model rows (no checkboxes, no selection)
- Flat list of orphaned model rows (no checkboxes, no selection)
- Single "Elimina tutti" button at the bottom
- Per-row delete buttons

### Target AI cache section
- Progress bar with refresh CTA (unchanged)
- **Select-all toolbar** for censused models (below progress bar)
- **SelectableFieldset** "Modelli censiti" containing model rows with checkboxes + left border
- Divider
- **Select-all toolbar** for orphaned models (below divider)
- **SelectableFieldset** "Modelli non censiti" containing orphan rows with checkboxes + left border
- Per-fieldset bulk delete CTA (appears when items selected)
- Per-row delete buttons remain
- Remove the global "Elimina tutti" button (replaced by per-fieldset bulk delete)

## Architecture

### New composable: `useSelection`

**File**: `src/lib/composables/useSelection.svelte.ts`

Generic selection state manager following the composable state exposure pattern (AGENTS.md).

```typescript
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useSelection() {
  const _state = $state({
    selected_ids: new Set<string>(),
  });

  const selected_count = $derived(_state.selected_ids.size);

  function isSelected(id: string): boolean {
    return _state.selected_ids.has(id);
  }

  function toggleSelect(id: string, checked: boolean): void {
    const next = new Set(_state.selected_ids);
    if (checked) next.add(id);
    else next.delete(id);
    _state.selected_ids = next;
  }

  function toggleSelectAll(all_ids: string[], checked: boolean): void {
    _state.selected_ids = checked ? new Set(all_ids) : new Set();
  }

  function clearSelection(): void {
    _state.selected_ids = new Set();
  }

  function getSelectedIds(): string[] {
    return [..._state.selected_ids];
  }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get selected_count() { return selected_count; },
    isSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    getSelectedIds,
  };
}
```

Notes:
- Uses `Set<string>` with reassignment (same pattern as ConfigList line 154)
- `all_selected` and `some_selected` are NOT in the composable because they depend on the total item count, which is page-specific. Consumers compute them as `$derived` from `selection.selected_count` and their item list.
- Follows AGENTS.md composable pattern: `_state` object, `get state()` getter, mutator functions.

### New component: `SelectableFieldset`

**File**: `src/lib/components/ui/selectable-fieldset/SelectableFieldset.svelte`

Visual wrapper: gradient label + gradient border container. Matches ConfigList group pattern (lines 351-371).

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    children,
    class: klass = '',
  }: {
    label: string;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<div class="pt-4 first:pt-0">
  <h3 class="self-start text-xs font-semibold uppercase tracking-wide bg-linear-to-br from-sky-400 to-indigo-400 text-white px-3 pt-1 pb-1 rounded-t-md relative z-10 w-fit ml-3">
    {label}
  </h3>
  <div class="border-primary-gradient rounded-lg px-3 pt-3 pb-3 space-y-3 {klass}">
    {@render children()}
  </div>
</div>
```

### New component: `SelectableToolbar`

**File**: `src/lib/components/ui/selectable-fieldset/SelectableToolbar.svelte`

Select-all checkbox + bulk action area. Matches ConfigList toolbar pattern (lines 270-331) but **position-agnostic** — no `position: sticky` baked in. The parent layout decides whether the toolbar is pinned or scrolls with content.

**Empirical scroll behavior (verified via Playwright):**

- **/security**: The toolbar is a `shrink-0` flex sibling OUTSIDE the `flex-1 overflow-auto` scroll container (`ConfigList.svelte` line 269-334). It stays at top naturally via flex layout — no `position: sticky` needed. The scroll container is the sibling below it.
- **/ai**: The cache section (2279px tall) is INSIDE the `flex-1 overflow-auto p-4` scroll container (729px viewport). Everything scrolls together. There is no separate `shrink-0` toolbar sibling.

**Conclusion**: `SelectableToolbar` must NOT impose `position: sticky` or any sticky-like behavior. It is a plain flex row. The consumer's layout determines whether it is pinned (flex sibling outside scroll container, like /security) or inline (inside scroll container, like /ai).

**ConfigList usage** (preserves current behavior):
```svelte
<!-- toolbar as shrink-0 sibling OUTSIDE the overflow-auto div -->
<div class="shrink-0 border-b bg-background/90 ...">
  <SelectableToolbar ...>
    <Button ...>Bulk delete</Button>
  </SelectableToolbar>
</div>
<div class="flex-1 overflow-auto p-4">
  <!-- rows -->
</div>
```

**AI cache section usage** (inline, scrolls with content):
```svelte
<!-- toolbar inline inside the scrollable content -->
<SelectableToolbar ...>
  <Button ...>Bulk delete</Button>
</SelectableToolbar>
<SelectableFieldset label="Modelli censiti">
  <!-- rows -->
</SelectableFieldset>
```

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import type { Snippet } from 'svelte';

  let {
    all_selected,
    some_selected,
    selected_count,
    on_toggle_select_all,
    children,
    class: klass = '',
  }: {
    all_selected: boolean;
    some_selected: boolean;
    selected_count: number;
    on_toggle_select_all: (checked: boolean) => void;
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 {klass}">
  <Checkbox
    checked={all_selected}
    indeterminate={some_selected}
    onCheckedChange={() => on_toggle_select_all(!all_selected)}
    data-testid="selectable-toolbar-select-all"
  />
  <span class="text-sm text-muted-foreground select-none mr-1">
    {#if all_selected}
      {$t('app.common.deselectAll')}
    {:else}
      {$t('app.common.selectAll')}
    {/if}
  </span>
  {#if selected_count > 0}
    <div class="h-5 w-px bg-border mx-1" aria-hidden="true"></div>
    {@render children?.()}
  {/if}
</div>
```

### New component: `SelectableRow`

**File**: `src/lib/components/ui/selectable-fieldset/SelectableRow.svelte`

Row container with left border coloring + click-to-toggle. Matches ConfigListRow pattern (lines 54-74) but generic — content goes in a slot.

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    id,
    selected = false,
    warning = false,
    disabled = false,
    on_toggle_select,
    children,
    class: klass = '',
  }: {
    id: string;
    selected?: boolean;
    warning?: boolean;
    disabled?: boolean;
    on_toggle_select: (id: string, checked: boolean) => void;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<div
  class="rounded-lg border bg-background p-3 border-l-[5px] cursor-pointer select-none {warning ? 'border-l-warning' : selected ? 'border-l-primary' : 'border-l-border'} {klass}"
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-pressed={selected}
  data-testid={`selectable-row-${id}`}
  onclick={(e) => {
    if (disabled) return;
    const target = e.target as HTMLElement;
    const interactive = target.closest('input, button, a, [role="combobox"], [role="listbox"], [role="option"], textarea, select, [data-no-row-toggle]');
    if (interactive && interactive !== e.currentTarget) return;
    on_toggle_select(id, !selected);
  }}
  onkeydown={(e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      on_toggle_select(id, !selected);
    }
  }}
>
  {@render children()}
</div>
```

Notes:
- `warning` prop: for ConfigListRow tainted state (yellow left border)
- `class` prop: consumer passes layout classes (grid, flex, etc.)
- Click handler: excludes interactive elements (same logic as ConfigListRow line 64)

### New barrel export

**File**: `src/lib/components/ui/selectable-fieldset/index.ts`

```typescript
export { default as SelectableFieldset } from './SelectableFieldset.svelte';
export { default as SelectableToolbar } from './SelectableToolbar.svelte';
export { default as SelectableRow } from './SelectableRow.svelte';
```

## Refactoring: ConfigList (zero behavioral change)

### ConfigList.svelte changes
1. Import `useSelection`, `SelectableToolbar`, `SelectableFieldset`
2. Replace inline `selectedUuids = $state<Set<string>>(new Set())` with `const selection = useSelection()`
3. Replace `allSelected`, `someSelected` derived with local derived using `selection.selected_count`
4. Replace `handleToggleSelect`, `handleToggleSelectAll` with `selection.toggleSelect`, `selection.toggleSelectAll`
5. Replace the inline toolbar markup (lines 270-331) with `<SelectableToolbar>` + bulk action buttons as children
6. Replace the inline group fieldset markup (lines 351-371) with `<SelectableFieldset label={...}>`
7. All `selectedUuids.has(entry.uuid)` calls become `selection.isSelected(entry.uuid)`
8. `selectedEntries` derived becomes `entries.filter((e) => selection.isSelected(e.uuid))`
9. `selectedUuids = new Set()` (clear) becomes `selection.clearSelection()`

### ConfigListRow.svelte changes
1. Import `SelectableRow`
2. Wrap the outer div content in `<SelectableRow>` OR replace the outer div with `<SelectableRow>` passing `class="grid grid-cols-12 items-center gap-4"`
3. Pass `selected`, `warning={tainted}`, `on_toggle_select` props
4. Remove the inline `onclick`/`onkeydown` handlers (SelectableRow handles them)
5. Remove the inline border-l classes (SelectableRow handles them)

## Refactoring: AI cache section (ModelCacheSection.svelte)

### New structure
```
[Error message if any]
[Progress bar + refresh CTA]  (unchanged)
[SelectableToolbar: censused models]  ← select-all for censused
[SelectableFieldset: "Modelli censiti"]
  [SelectableRow: Qwen3 1.7B]  ← checkbox + left border + content
  [SelectableRow: Qwen2.5 1.5B]
  [SelectableRow: Qwen3 4B]
[Divider: border-t]
[SelectableToolbar: orphaned models]  ← select-all for orphans
[SelectableFieldset: "Modelli non censiti"]
  [SelectableRow: Qwen2.5-0.5B]  ← checkbox + left border + content
  [SelectableRow: SmolLM2-360M]
  ...
```

### Two independent `useSelection` instances
```typescript
const censusedSelection = useSelection();
const orphanSelection = useSelection();
```

### Derived: all_selected / some_selected per group
```typescript
const censusedModels = $derived(aiModels.getEnabledModels());
const censusedAllSelected = $derived(
  censusedModels.length > 0 && censusedModels.every((m) => censusedSelection.isSelected(m.model_id))
);
const censusedSomeSelected = $derived(
  censusedSelection.selected_count > 0 && !censusedAllSelected
);

const orphanIds = $derived(Object.keys(cache.state.orphaned_models));
const orphanAllSelected = $derived(
  orphanIds.length > 0 && orphanIds.every((id) => orphanSelection.isSelected(id))
);
const orphanSomeSelected = $derived(
  orphanSelection.selected_count > 0 && !orphanAllSelected
);
```

### Bulk delete per fieldset
- Censured: `deleteModel` for each selected censused model_id
- Orphan: `deleteModel` for each selected orphan model_id
- Remove the global "Elimina tutti" button

### Row content (slot inside SelectableRow)
Each row places:
- Checkbox (bound to selection state)
- Model icon + name + model_id + cache status + size
- Per-row delete button (always visible if cached)

## Translations

### New keys (en-GB-fallback.json)
- `app.smart.regex.ai.cache.censured_title`: "Censured models"
- `app.smart.regex.ai.cache.orphaned_title`: already exists ("Cached models not in catalog")

### BE fire-and-forget (add_ai_model_translations.sql)
Add `app.smart.regex.ai.cache.censured_title` in 6 languages.

## Acceptance criteria

1. `/security` page: visually and functionally identical to current behavior
2. `/system/settings/ai` cache section:
   - Two fieldsets with gradient label + border
   - Each fieldset has its own select-all toolbar
   - Rows have checkbox + left border that colors on selection
   - Per-row delete buttons work
   - Bulk delete CTA appears per fieldset when items are selected
   - Global "Elimina tutti" button removed
3. `useSelection` composable follows the AGENTS.md state exposure pattern
4. `pnpm run check` passes with 0 errors
5. Playwright verification: select items, bulk delete, verify cache updates

## Files

### New (5)
1. `src/lib/composables/useSelection.svelte.ts`
2. `src/lib/components/ui/selectable-fieldset/SelectableFieldset.svelte`
3. `src/lib/components/ui/selectable-fieldset/SelectableToolbar.svelte`
4. `src/lib/components/ui/selectable-fieldset/SelectableRow.svelte`
5. `src/lib/components/ui/selectable-fieldset/index.ts`

### Modified (4)
6. `src/lib/components/config-list/ConfigList.svelte` — refactor to use new components
7. `src/lib/components/config-list/ConfigListRow.svelte` — use SelectableRow wrapper
8. `src/lib/components/ui/smart-regex-input/ModelCacheSection.svelte` — two fieldsets with selection
9. `src/lib/i18n/messages/en-GB-fallback.json` — new translation key

### BE fire-and-forget (1)
10. `db-meta/fire-and-forget/add_ai_model_translations.sql` — add censured_title translation

## Risk mitigation
- ConfigList refactoring is the riskiest part. If any issue arises, the fallback is to keep ConfigList as-is and only apply the new components to the AI cache section.
- The `useSelection` composable uses the same Set-reassignment pattern as the existing ConfigList code, ensuring reactivity.
- SelectableRow's click handler is copied verbatim from ConfigListRow to ensure identical behavior.
