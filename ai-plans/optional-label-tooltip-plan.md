# Plan: Error Label Key Placeholder + Optional Tooltip

## Problem

1. **Error label key inputs show auto-generated value as actual text**, not as placeholder.
   The builder's `setMin(value, errorLabelKey?)` auto-generates `error_label_key` when
   none is provided and stores it in state. The UI reads it back into `bind:value`,
   so the auto key appears as the input value, not as a placeholder.

2. **Labels don't indicate "(optional)"** — the user can't tell which fields are optional.

3. **No tooltip explains what "optional" means** — the user doesn't know that the
   placeholder value will be auto-generated and enforced as best practice.

4. **Left column `label_key`/`description_key`/`group_key`** also need "(optional)"
   labels with the same tooltip.

## Root Cause Analysis

### Why error_label_key appears as value, not placeholder

The chain is:
1. `builder.setMin(1)` → stores `error_label_key: "config.auth.test_key.errors.min"` in state
2. `ValidationRulesSection` `$effect` reads `v.rules.min.error_label_key` into `minErrorKey`
3. Input `bind:value={minErrorKey}` shows it as the actual text value
4. The `placeholder={autoErrorLabelKey(configKey, 'min')}` is never visible

### Why the serialized JSON must still contain error_label_key

The runtime validation (`config-validation.ts` line 87-88) reads `error_label_key`
directly from the rule:
```ts
const minKey = rules.min.error_label_key;
const minMsg = `${minKey}|{"min": ${minVal}}`;
```
There is NO fallback to auto-generation at runtime. So the serialized JSON MUST
contain the `error_label_key` in each rule.

## Solution Architecture

### Step 1: Builder — don't store auto-generated keys in state

Change the builder mutators to NOT auto-generate `error_label_key` when none is
provided. Instead, store `error_label_key: undefined` (omit it).

**Before** (`type-config-builder.svelte.ts`):
```ts
function setMin(value: number | null, errorLabelKey?: string) {
  v.rules.min = {
    value,
    error_label_key: errorLabelKey || autoErrorLabelKey(_state.configKey, 'min'),
  };
}
```

**After**:
```ts
function setMin(value: number | null, errorLabelKey?: string) {
  v.rules.min = {
    value,
    // Only store if user provided a custom key; auto-generated at serialization time
    ...(errorLabelKey ? { error_label_key: errorLabelKey } : {}),
  };
}
```

Same for `setMax`, `setUrlProtocols`, `setEmail`, `setRegex`.

### Step 2: Builder — inject auto keys at serialization time

In the `sync()` function, before calling `serializeTypeConfig`, inject auto-generated
keys for any rule that doesn't have a custom `error_label_key`:

```ts
function sync() {
  if (_state.advancedMode) return;
  // Inject auto error_label_keys for rules without custom keys
  injectAutoErrorKeys();
  const json = serializeTypeConfig(_state.config);
  _state.rawJson = json;
  onTypeConfigChange(json);
}

function injectAutoErrorKeys() {
  const v = _state.config.validation;
  if (!v || !v.rules) return;
  const rules = v.rules;
  const ruleNames = ['min', 'max', 'url', 'email', 'regex'] as const;
  for (const rule of ruleNames) {
    const r = rules[rule];
    if (r && !r.error_label_key) {
      r.error_label_key = autoErrorLabelKey(_state.configKey, rule);
    }
  }
  // Also handle required_error_label_key
  if (v.required && !v.required_error_label_key) {
    // Don't auto-generate required_error_label_key — use runtime fallback 'validation.required'
    // Only store it if the user explicitly sets one
  }
}
```

**Important**: `injectAutoErrorKeys` mutates state. But since the keys are auto-generated
and the user hasn't customized them, this is safe. When `setConfigKey` changes the key,
the next `sync()` will re-inject with the new key (since the old auto key was injected,
not user-set — we need to detect this).

**Better approach**: Don't mutate state. Instead, create a deep copy with auto keys
injected, serialize that, and keep the original state clean:

```ts
function sync() {
  if (_state.advancedMode) return;
  const configWithAutoKeys = withAutoErrorKeys(_state.config, _state.configKey);
  const json = serializeTypeConfig(configWithAutoKeys);
  _state.rawJson = json;
  onTypeConfigChange(json);
}

function withAutoErrorKeys(config: ParsedTypeConfig, configKey: string): ParsedTypeConfig {
  // Deep clone, inject auto error_label_keys where missing
  const clone = structuredClone(config);
  const v = clone.validation;
  if (!v || !v.rules) return clone;
  // ... inject for each rule
  return clone;
}
```

This keeps state clean. The `$effect` in ValidationRulesSection reads
`v.rules.min.error_label_key` — if it's undefined (no custom key), the local
`minErrorKey` state stays empty, and the placeholder shows the auto key.

### Step 3: Remove `setConfigKey` re-generation logic

Since auto keys are no longer stored in state, `setConfigKey` just updates
`_state.configKey` and calls `sync()` — no need to compare old/new auto keys:

```ts
function setConfigKey(newKey: string) {
  if (newKey === _state.configKey) return;
  _state.configKey = newKey;
  sync(); // re-serialize with new auto keys
}
```

### Step 4: Extend `FormLabelWithPriorityHelp` with optional `labelKey` prop

The existing `FormLabelWithPriorityHelp` always renders a `HelpCircle` icon as
the tooltip trigger. We want to optionally show a text label AFTER the icon,
so the pattern is always: **ICON + LABEL** (icon always present, label optional).

**Refactor** `src/lib/components/forms/FormLabelWithPriorityHelp.svelte` to accept
an optional `labelKey` prop (an i18n key). When provided, the translated text
is rendered after the icon, inside the same trigger button.

**Before**:
```svelte
<button type="button" class="inline-flex" {...props} aria-label="Help" tabindex={-1}>
  <HelpCircle class="size-3.5 text-muted-foreground" />
</button>
```

**After**:
```svelte
<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { PriorityTooltipContent, type TooltipPriority } from '$lib/components/ui/tooltip';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import { t } from '$lib/i18n';

  let {
    text,
    priority,
    title,
    labelKey,
  }: { text: string; priority?: TooltipPriority; title?: string; labelKey?: string } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button type="button" class="inline-flex items-center gap-1" {...props} aria-label="Help" tabindex={-1}>
        <HelpCircle class="size-3.5 text-muted-foreground" />
        {#if labelKey}
          <span class="text-xs font-normal text-muted-foreground italic">
            {$t(labelKey)}
          </span>
        {/if}
      </button>
    {/snippet}
  </Tooltip.Trigger>
  ...
</Tooltip.Root>
```

**Usage for "(optional)"**:
```svelte
<FormLabelWithPriorityHelp
  text={$t('common.optionalTooltipText')}
  priority="INFORMATION"
  title={$t('common.optionalTooltipTitle')}
  labelKey="common.optional"
/>
```

**Existing usage (profile page) is unchanged** — no `labelKey` = icon only, as before.

### Step 5: i18n translations

Add to all 6 locale files under `common`:

```json
"optional": "(optional)",
"optionalTooltipTitle": "Auto-generated value",
"optionalTooltipText": "The placeholder value shown in the input will be automatically used and enforced as a best practice. You can override it with a custom value if needed."
```

Translations:
- **en-GB**: as above
- **it-IT**: "(opzionale)" / "Valore generato automaticamente" / "Il valore mostrato nel placeholder verrà utilizzato automaticamente e applicato come best practice. Puoi sovrascriverlo con un valore personalizzato se necessario."
- **fr-FR**: "(optionnel)" / "Valeur générée automatiquement" / "La valeur affichée dans le placeholder sera automatiquement utilisée et appliquée comme meilleure pratique. Vous pouvez la remplacer par une valeur personnalisée si nécessaire."
- **es-ES**: "(opcional)" / "Valor generado automáticamente" / "El valor mostrado en el placeholder se utilizará automáticamente y se aplicará como mejor práctica. Puedes sobrescribirlo con un valor personalizado si es necesario."
- **de-DE**: "(optional)" / "Automatisch generierter Wert" / "Der im Placeholder angezeigte Wert wird automatisch verwendet und als Best Practice durchgesetzt. Sie können ihn bei Bedarf mit einem benutzerdefinierten Wert überschreiben."
- **pt-PT**: "(opcional)" / "Valor gerado automaticamente" / "O valor mostrado no placeholder será utilizado automaticamente e aplicado como melhor prática. Pode substituí-lo por um valor personalizado, se necessário."

### Step 6: Update ValidationRulesSection labels

Each error_label_key label gets icon + "(optional)" appended with the tooltip:

```svelte
<Label for="tcb-min-error-key" class="text-xs text-muted-foreground">
  {$t('config.typeConfig.errorLabelKey')}
  <FormLabelWithPriorityHelp
    text={$t('common.optionalTooltipText')}
    priority="INFORMATION"
    title={$t('common.optionalTooltipTitle')}
    labelKey="common.optional"
  />
</Label>
```

Also update the `requiredErrorLabelKey` label.

### Step 7: Update create page left column labels

`label_key`, `description_key`, `group_key` FormLabels get icon + "(optional)" appended:

```svelte
<FormLabel for={props.id}>
  {$t('shell.settings.security.create.labelKey')}
  <FormLabelWithPriorityHelp
    text={$t('common.optionalTooltipText')}
    priority="INFORMATION"
    title={$t('common.optionalTooltipTitle')}
    labelKey="common.optional"
  />
</FormLabel>
```

## Impacted Files

| File | Change |
|------|--------|
| `src/lib/config/type-config-builder.svelte.ts` | Don't store auto keys; inject at serialization; simplify `setConfigKey` |
| `src/lib/components/forms/FormLabelWithPriorityHelp.svelte` | Add optional `trigger` snippet prop (backward compatible) |
| `src/lib/components/config-builder/ValidationRulesSection.svelte` | Use `FormLabelWithPriorityHelp` with trigger snippet on error_label_key labels |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | Use `FormLabelWithPriorityHelp` with trigger snippet on left column *_key labels |
| `src/lib/i18n/messages/en-GB.json` | Add `common.optional`, `common.optionalTooltipTitle`, `common.optionalTooltipText` |
| `src/lib/i18n/messages/it-IT.json` | Same |
| `src/lib/i18n/messages/fr-FR.json` | Same |
| `src/lib/i18n/messages/es-ES.json` | Same |
| `src/lib/i18n/messages/de-DE.json` | Same |
| `src/lib/i18n/messages/pt-PT.json` | Same |
| `src/lib/__tests__/type-config-builder.test.ts` | Update tests for new auto-key behavior |

## Test Changes

Tests that assert `error_label_key` is auto-generated in the serialized JSON
still pass (the key IS in the JSON, just injected at serialization time, not
stored in state). Tests that check the builder state directly need updating.

New tests:
- `setMin(1)` without custom key → serialized JSON has auto key, but
  `builder.validation.rules.min.error_label_key` is undefined
- `setMin(1, 'custom.key')` → serialized JSON has custom key, state has custom key
- `setConfigKey('new')` → serialized JSON auto key updates to new key

## Acceptance Criteria

1. Error label key inputs are **empty** by default, showing the auto-generated
   key as **placeholder** (gray, disappears on focus/type)
2. Serialized JSON still contains `error_label_key` in every rule (auto-injected)
3. Labels for optional fields show "(optional)" with an info tooltip on hover
4. Tooltip uses `PriorityTooltipContent` with `INFORMATION` priority (same as profile page)
5. Tooltip text is translated in all 6 locales
6. `setConfigKey` reactivity still works — placeholder updates when key changes
7. All 206+ tests pass
8. svelte-check: 0 errors
