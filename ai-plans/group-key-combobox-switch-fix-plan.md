# Plan: group_key Combobox via ComboSelect + Switch Consistency Fix

## Problem

### 1. group_key placeholder is wrong
Current placeholder generates `config.auth.{key}.group` (a full i18n path).
But `group_key` in the DB is a **partial i18n path** — ConfigList.svelte
(line 354) composes it as `$t(`config.auth.group.${groupKey}`)`.

Existing group_key values: `idp_parameters`, `oidc_parameters`,
`security_parameters`, `advanced_features`, `system_settings` — all
snake_case, NOT full i18n paths.

### 2. group_key should use ComboSelect (like roles) with creatable support
The user wants the same component used in user create/update for role
assignment (ComboSelect), adapted to:
- Show existing group keys as selectable options
- Allow typing a NEW group key that doesn't exist yet
- Show a badge in a different color when the value is "new" (not in the
  existing options list)
- Work in **single selection mode** (one group per config entry)
- Each item should show BOTH the translated group name AND the raw
  group_key value (so the user sees what they're selecting)

### 3. Switch rendering is inconsistent
`JsonPreviewEditor.svelte` line 23 still uses the old pattern
(`flex items-center justify-between` + Label left, Switch right).
Must match the unified pattern used by Reserved/Required/Unsigned/Email.

Also: `BadgeValueRow.svelte` imports `Switch` but never uses it — dead import.

## Source of group keys

Two sources, merged:

1. **API**: Fetch `/api/v1/entities/config_entries/list` on mount, extract
   unique `group_key` values from all rows. This gives us the **actual**
   groups in use, including any created by users that don't have i18n
   translations yet.

2. **i18n**: The translations under `config.auth.group.*` define the known
   groups with their display names. We can read these to get the translated
   label for each group.

**Strategy**: Fetch from API (source of truth for what exists), then for
each group_key, use `$t(`config.auth.group.${gk}`)` as the display label.
If the translation key doesn't exist, the i18n system returns the key
itself — which is fine, it shows the raw group_key as fallback.

This is the same pattern used by ComboSelect with `isLabelTranslated={true}`
and `labelField` pointing to a translation key.

## ComboSelect Extension: `allowCreate` mode

ComboSelect currently does NOT support creating new values. When
`filteredOptions.length === 0`, it shows "No results found." and there's
no way to add a new item.

### New prop: `allowCreate?: boolean`

When `allowCreate` is true:
- If `search` is non-empty AND no exact match exists in `filteredOptions`,
  show a "Create '{search}'" item at the top of the list
- Clicking it calls `handleSelectSingle` (or `handleToggleMulti`) with a
  synthetic option whose `value` = `search` and `label` = `search`
- The `onCreate?: (value: string) => void` callback is fired, allowing
  the parent to add the new value to the options list

### New prop: `onCreate?: (value: string) => void`

Called when a new value is created. The parent can use this to add the
new value to its options array so it appears as a "known" option from
then on.

### New prop: `isNewValue?: (value: string) => boolean`

Optional function that determines if a value is "new" (not in the
original options). Used by the trigger display to render a different
badge color for new values.

When `isNewValue?.(value)` returns true in single mode, the trigger
shows the value with a distinct badge (e.g. `text-warning` border)
instead of the normal display.

### Changes to combo-select.svelte

```ts
// New props added to Props type
allowCreate?: boolean;
onCreate?: (value: string) => void;
isNewValue?: (value: string) => boolean;
```

In the script:
```ts
// Check if search matches an existing option exactly
let exactMatchExists = $derived(
  search.trim() !== '' &&
  normalizedOptions.some((o) =>
    o.value.toLowerCase() === search.trim().toLowerCase() ||
    o.label.toLowerCase() === search.trim().toLowerCase()
  )
);

// Show "Create" item when allowCreate is on, search is non-empty, and no exact match
let showCreateItem = $derived(allowCreate && search.trim() !== '' && !exactMatchExists);

function handleCreate() {
  const newKey = search.trim();
  if (!newKey) return;
  if (mode === 'single') {
    syncChange(newKey);
    open = false;
    search = '';
  } else {
    if (!selectedValues.includes(newKey)) {
      syncChange([...selectedValues, newKey]);
    }
  }
  onCreate?.(newKey);
}
```

In the template, before the `{#each filteredOptions}` block:
```svelte
{#if showCreateItem}
  <Command.Item
    value={`__create__${search.trim()}`}
    class="..."
    onSelect={() => handleCreate()}
  >
    <div class="flex items-center gap-2 w-full">
      {#if mode === "multi"}
        <div class="combo-select-checkbox h-4 w-4 rounded border border-input shrink-0" />
      {/if}
      <span class="flex-1 truncate text-left">
        {$t('common.create')} <span class="font-medium">"{search.trim()}"</span>
      </span>
    </div>
  </Command.Item>
{/if}
```

In the single-mode trigger display, add a "new" badge:
```svelte
{#if selectedNormalized}
  {#if selectedSnippet}
    {@render selectedSnippet(...)}
  {:else if isNewValue?.(selectedNormalized.value)}
    <Badge variant="outline" class="gap-1 text-warning border-warning/30">
      {selectedNormalized.label}
    </Badge>
  {:else}
    <span class="flex-1 truncate text-left">
      {selectedNormalized.label}
    </span>
  {/if}
```

## group_key field in create page

### Composable: `useExistingGroupKeys`

New composable following the `useActiveRoles` pattern:

```ts
// src/lib/composables/useExistingGroupKeys.svelte.ts
import type { DeepReadonly } from "$lib/types/deep-readonly";
import { apiFetch } from "$lib/api";
import { onMount } from "svelte";

export function useExistingGroupKeys() {
  const _state = $state({ groupKeys: [] as string[], loading: true });

  onMount(async () => {
    try {
      const res = await apiFetch("/api/v1/entities/config_entries/list");
      if (res.ok) {
        const data = (await res.json()) as { rows: Array<{ group_key?: string | null }> };
        const groups = new Set<string>();
        for (const row of data.rows) {
          if (row.group_key && row.group_key.trim()) {
            groups.add(row.group_key.trim());
          }
        }
        _state.groupKeys = [...groups].sort();
      }
    } catch (e) {
      console.error("Failed to load group keys", e);
    } finally {
      _state.loading = false;
    }
  });

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get groupKeys() { return _state.groupKeys; },
    get loading() { return _state.loading; },
  };
}
```

### ComboSelect usage for group_key

```svelte
<ComboSelect
  {...props}
  mode="single"
  data-testid="config-create-group-key"
  bind:value={$form.group_key}
  options={existingGroupKeys.map((gk) => ({ group_key: gk }))}
  valueField="group_key"
  labelField="group_key"
  isLabelTranslated={true}
  // Translate via config.auth.group.{group_key}
  // But isLabelTranslated calls $t(label) — so we need the label to be
  // the full i18n key. Adjust: labelField points to a computed full key.
  allowCreate={true}
  isNewValue={(val) => !existingGroupKeys.includes(val)}
  placeholder={$t('shell.settings.security.create.groupKeyPlaceholder')}
  searchPlaceholder={$t('shell.settings.security.create.groupKeySearch')}
>
  {#snippet itemSnippet({ option, resolvedLabel, resolvedValue })}
    {@const gk = (option as Record<string, any>).group_key}
    <div class="flex flex-col min-w-0 flex-1 gap-0.5">
      <span class="font-medium truncate">{resolvedLabel}</span>
      <span class="text-xs text-muted-foreground truncate font-mono">{gk}</span>
    </div>
  {/snippet}
</ComboSelect>
```

**Problem**: `isLabelTranslated` calls `$t(label)` where `label` is the
raw `group_key` value (e.g. `idp_parameters`). But the i18n key is
`config.auth.group.idp_parameters`, not just `idp_parameters`.

**Solution**: Options should be objects with the full i18n key:
```ts
const groupKeyOptions = $derived(
  existingGroupKeys.map((gk) => ({
    group_key: gk,
    label_key: `config.auth.group.${gk}`,
  }))
);
```

Then:
```svelte
<ComboSelect
  options={groupKeyOptions}
  valueField="group_key"
  labelField="label_key"
  isLabelTranslated={true}
  ...
/>
```

This way:
- `value` = the raw group_key (e.g. `idp_parameters`) — stored in the form
- `label` = `$t('config.auth.group.idp_parameters')` = "IDP Parameters"
- The `itemSnippet` shows both: translated name + raw group_key

### i18n: `common.create`

Add to all 6 locales:
- en-GB: "Create"
- it-IT: "Crea"
- fr-FR: "Créer"
- es-ES: "Crear"
- de-DE: "Erstellen"
- pt-PT: "Criar"

### group_key placeholder

Change from the wrong `config.auth.{key}.group` to `my_group` (static,
snake_case, matches the expected format).

### group_key Zod validation

Add snake_case regex (same as `key` field):
```ts
group_key: z.string()
  .max(100, { message: maxMsg(100) })
  .regex(/^[a-z][a-z0-9_]*$/, { message: 'validation.invalidFormat' })
  .default(''),
```

### group_key label

Change from "Chiave di traduzione per il Gruppo" to "Group key" /
"Chiave di raggruppamento" — it's a grouping identifier, not a
translation key.

## Switch consistency fix

### JsonPreviewEditor.svelte

Change from:
```svelte
<div class="flex items-center justify-between">
  <Label for="tcb-advanced">{$t('config.typeConfig.advancedMode')}</Label>
  <Switch ... />
</div>
```

To the unified pattern:
```svelte
<div class="space-y-2">
  <div class="flex items-center gap-3">
    <Switch ... />
    <span class="text-sm font-medium leading-none">
      {$t('config.typeConfig.advancedMode')}
    </span>
  </div>
  <p class="text-xs text-muted-foreground">{$t('config.typeConfig.advancedModeHelp')}</p>
</div>
```

Remove unused `Label` import if no longer needed.

### BadgeValueRow.svelte

Remove dead `Switch` import.

### i18n: `advancedModeHelp`

Add to all 6 locales:
- en-GB: "When enabled, edit the raw JSON configuration directly instead of using the visual builder."
- it-IT: "Se attivo, modifica direttamente la configurazione JSON grezza invece di usare il builder visuale."
- fr-FR: "Si activé, modifiez directement la configuration JSON brute au lieu d'utiliser le constructeur visuel."
- es-ES: "Si está activado, edita la configuración JSON sin procesar directamente en lugar de usar el constructor visual."
- de-DE: "Wenn aktiviert, bearbeiten Sie die rohe JSON-Konfiguration direkt anstelle des visuellen Builders."
- pt-PT: "Se ativado, edita a configuração JSON bruta diretamente em vez de usar o construtor visual."

## Impacted Files

| File | Change |
|------|--------|
| `src/lib/components/ui/combo-select/combo-select.svelte` | Add `allowCreate`, `onCreate`, `isNewValue` props + "Create" item |
| `src/lib/composables/useExistingGroupKeys.svelte.ts` | **NEW** — fetches unique group_keys from API |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | Replace group_key TextInput with ComboSelect, fix placeholder, add snake_case regex |
| `src/lib/components/config-builder/JsonPreviewEditor.svelte` | Fix switch rendering to unified pattern |
| `src/lib/components/config-builder/BadgeValueRow.svelte` | Remove dead Switch import |
| `src/lib/i18n/messages/en-GB.json` | groupKey label, groupKeyPlaceholder, groupKeySearch, common.create, advancedModeHelp |
| `src/lib/i18n/messages/it-IT.json` | Same |
| `src/lib/i18n/messages/fr-FR.json` | Same |
| `src/lib/i18n/messages/es-ES.json` | Same |
| `src/lib/i18n/messages/de-DE.json` | Same |
| `src/lib/i18n/messages/pt-PT.json` | Same |

## Acceptance Criteria

1. group_key field uses ComboSelect in single mode (same component as roles)
2. Existing group keys appear as selectable options with translated label + raw key
3. User can type a new group key and a "Create '{search}'" item appears
4. New (non-existing) group keys show with a distinct badge color in the trigger
5. group_key validates as snake_case + max 100 chars
6. group_key placeholder shows `my_group`
7. group_key label says "Group key" / "Chiave di raggruppamento"
8. Advanced Mode switch in JsonPreviewEditor uses the unified pattern
9. BadgeValueRow no longer imports unused Switch
10. All tests pass
11. svelte-check: 0 errors
