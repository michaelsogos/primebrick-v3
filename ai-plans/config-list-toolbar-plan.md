# Plan: ConfigList Sticky Toolbar with Select-All, Bulk Actions, and Create CTA

## Objective

Add a sticky top toolbar inside the ConfigList content wrapper with:
1. Select-all checkbox (left side)
2. "Add Config Key" CTA (extreme right) — opens create page in `_blank` new tab
3. Bulk Delete and Bulk Revert CTAs — appear when items are selected, with confirm dialog

Inspired by the 3rd toolbar in `CardViewRenderer.svelte` (sticky, select-all, bulk actions).

## Impacted Files

### Frontend (existing files to modify)

| File | Change |
|------|--------|
| `src/lib/components/config-list/ConfigList.svelte` | Add sticky toolbar above scroll area, select-all logic, bulk revert, create CTA callback |
| `src/lib/components/config-list/ConfigBulkActionBar.svelte` | Replace with sticky toolbar component (or repurpose) |
| `src/routes/(app)/system/settings/security/+page.svelte` | Pass `onCreateAction` callback to ConfigList, add `openNewConfig()` function |

### Frontend (new files to create)

| File | Purpose |
|------|---------|
| `src/routes/(app)/system/settings/security/create/+layout@(app).svelte` | Minimal wrapper (renders children only — same as users/orgs create) |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | Create config entry page (FormPageLayout, breadcrumb, form with key/type/value/type_config/label_key/description_key/group_key) |

### i18n (6 locale files)

| File | Change |
|------|--------|
| `src/lib/i18n/messages/{en-GB,it-IT,fr-FR,es-ES,de-DE,pt-PT}.json` | Add toolbar labels, create page title, bulk revert confirm |

## Architecture

### Toolbar Layout

```
ConfigList (flex h-full flex-col min-h-0)
├── STICKY TOOLBAR (shrink-0 border-b bg-muted/50 p-3)  ← NEW
│   ├── Left: Select-all checkbox + label
│   └── Right: [Bulk Revert] [Bulk Delete]  |  [+ Add Config Key]
│       (bulk actions appear only when selectedCount > 0)
├── Scrollable content (flex-1 overflow-auto p-4)
│   ├── Ungrouped entries
│   └── Grouped entries
└── Footer (shrink-0 border-t p-4) — save button
```

The toolbar is **outside** the scroll area (Option B from exploration), matching the footer pattern. This is cleaner than sticky-inside-scroll.

### Select-All Logic

```typescript
let allSelected = $derived(
  entries.length > 0 && entries.every((e) => !e.reserved && selectedUuids.has(e.uuid))
);
let someSelected = $derived(selectedUuids.size > 0 && !allSelected);

function handleToggleSelectAll(checked: boolean) {
  if (checked) {
    // Select all non-reserved entries
    selectedUuids = new Set(entries.filter((e) => !e.reserved).map((e) => e.uuid));
  } else {
    selectedUuids = new Set();
  }
}
```

Checkbox props: `checked={allSelected}`, `indeterminate={someSelected}`.

### Bulk Actions

- **Bulk Delete**: appears when `selectedUuids.size > 0`. Uses existing `onBulkDelete` callback. Confirm dialog already exists in Security page.
- **Bulk Revert**: appears when `selectedUuids.size > 0` AND there are tainted entries among selected. Reverts all selected tainted entries to original values.

```typescript
function handleBulkRevert() {
  for (const uuid of selectedUuids) {
    if (taintedUuids.has(uuid)) {
      handleRevert(uuid);
    }
  }
}
```

### Create CTA Pattern

Following the Users/Orgs pattern:

```typescript
// In Security +page.svelte
function openNewConfig() {
  const url = '/system/settings/security/create';
  const childWindow = window.open(url, '_blank');
  if (childWindow) {
    childWindow.focus();
  }
}
```

ConfigList receives `onCreateAction` prop (optional, same pattern as EntityListTable).

### Create Page

Route: `/system/settings/security/create`

Layout: `+layout@(app).svelte` — minimal wrapper (same as users/orgs create):
```svelte
<script lang="ts">
  let { children } = $props();
</script>
{@render children()}
```

Page: `+page.svelte` — uses `FormPageLayout` with `isCreatePage={true}`:
- Breadcrumb: System > Settings > [tabs dropdown] > Configurations > Create Config
- Form fields: key, type (dropdown), value, type_config (JSON textarea), label_key, description_key, group_key, reserved
- On save: API call to create config entry, then `notifyParentRefresh()` via `useSyncChannel`, then `window.close()`

### Parent-Child Sync

```typescript
// Security list page (receiver)
useSyncChannel('primebrick_config_sync', {
  mode: 'receiver',
  onRefresh: () => void loadEntries(),
});

// Create page (sender)
const { notifyParentRefresh } = useSyncChannel('primebrick_config_sync', { mode: 'sender' });
// After successful create:
notifyParentRefresh();
if (window.opener) window.close();
```

### Confirm Dialog

Reuse existing `DeleteDialog` component (already used in Security page for single + bulk delete). The Security page already has `bulkDeleteDialogOpen` state and `confirmBulkDelete` handler.

For bulk revert — no confirm dialog needed (revert is non-destructive, just restores original values).

## i18n Keys to Add

### `common` section
- `selectAll`: "Select All" / "Seleziona tutto" / etc.
- `deselectAll`: "Deselect All" / "Deseleziona tutto" / etc.
- `bulkRevert`: "Revert selected" / "Ripristina selezionati" / etc.

### `shell.settings.security` section
- `create.title`: "Create Config" / "Crea configurazione" / etc.
- `addConfigKey`: "Add Config Key" / "Aggiungi chiave config" / etc.

## Acceptance Criteria

1. Sticky toolbar visible at top of ConfigList content area, outside scroll region
2. Select-all checkbox toggles all non-reserved entries
3. Select-all shows indeterminate state when some but not all are selected
4. "Add Config Key" CTA on extreme right opens `/system/settings/security/create` in new tab
5. Bulk Delete button appears when items are selected, triggers existing confirm dialog
6. Bulk Revert button appears when selected items include tainted entries
7. Create page opens with correct breadcrumb (System > Settings > Configurations > Create)
8. Create page uses FormPageLayout with isCreatePage=true
9. After create, parent list refreshes via useSyncChannel and child window closes
10. `pnpm run check` passes with 0 errors

## Implementation Order

1. Add i18n keys (6 locales)
2. Create `security/create/+layout@(app).svelte` (minimal wrapper)
3. Create `security/create/+page.svelte` (create form page)
4. Modify `ConfigList.svelte` — add toolbar, select-all, bulk revert, onCreateAction prop
5. Modify `ConfigBulkActionBar.svelte` — repurpose as the toolbar or replace
6. Modify `security/+page.svelte` — pass onCreateAction, add useSyncChannel receiver
7. Run `pnpm run check`
