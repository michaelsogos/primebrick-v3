# Refactor: Extract NumericInput Component + Composable

## Objective

Extract the numeric input logic (unsigned parsing, character filtering, effective min, input mode) currently inline in `ConfigValueInput.svelte` into a reusable `NumericInput` component + `useNumericInput` composable. The component must follow the existing form component patterns to support attribute passthrough (`aria-*`, `data-*`, `name`, `id`, etc.) for Zod + SuperForms + Formsnap + SvelteKit 5 integration.

## Analysis of Existing Patterns

### Pattern 1: `TextInput` (spreads restProps)

```svelte
<!-- src/lib/components/ui/input/text-input.svelte -->
type Props = WithElementRef<
  Omit<HTMLInputAttributes, "type" | "files"> & {
    type?: InputType;
    value?: string;
    onClear?: () => void;
    // ...custom props
  }
>;

let {
  ref = $bindable(null),
  value = $bindable(""),
  type,
  readonly = false,
  disabled = false,
  class: className,
  ...restProps  // ← catches aria-*, data-*, name, id, etc.
}: Props = $props();

<Input bind:ref bind:value {type} {readonly} {disabled} class={inputClass} {...restProps} />
```

### Pattern 2: `AsyncValidatedInput` (explicit aria-* destructuring)

```svelte
<!-- src/lib/components/ui/input/async-validated-input.svelte -->
type Props = {
  value?: string;
  onChange?: (value: string) => void;
  // ...custom props
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  class?: string;
  type?: HTMLInputTypeAttribute;
  required?: boolean;
  "aria-invalid"?: string | boolean;
  "aria-describedby"?: string;
  "aria-required"?: string | boolean;
  "data-fs-error"?: string;
  "data-testid"?: string;
  oninput?: (e: Event) => void;
  onblur?: (e: FocusEvent) => void;
  onchange?: (e: Event) => void;
};

let {
  value = $bindable(""),
  // ...custom props
  name,
  id,
  placeholder,
  disabled = false,
  class: className,
  type = "text",
  required,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
  "aria-required": ariaRequired,
  "data-fs-error": dataFsError,
  "data-testid": dataTestId,
  oninput,
  onblur,
  onchange,
}: Props = $props();

<TextInput
  {id} {name} bind:value {placeholder} {disabled} {type}
  {required} aria-invalid={...} aria-describedby={...} aria-required={...}
  data-fs-error={dataFsError} data-testid={dataTestId}
  oninput={handleInputChange} onblur={handleBlur} onchange={handleChange}
/>
```

### Pattern 3: `ComboSelect` (explicit aria-* + index signature)

```svelte
type Props = {
  mode: ComboSelectMode;
  value: string | string[];
  // ...custom props
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  "aria-required"?: boolean | "true" | "false";
  "data-fs-error"?: string;
  [key: string]: unknown;  // ← allows any additional props
};
```

### Pattern 4: `Input` (base component)

```svelte
type Props = WithElementRef<
  Omit<HTMLInputAttributes, "type"> &
    ({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
>;

let {
  ref = $bindable(null),
  value = $bindable(),
  type,
  files = $bindable(),
  class: className,
  "data-slot": dataSlot = "input",
  ...restProps
}: Props = $props();

<input bind:this={ref} data-slot={dataSlot} class={cn(...)} {type} bind:value {...restProps} />
```

### How FormControl provides props

The create page uses:
```svelte
<FormField form={superFormObj} name="value">
  <FormControl>
    {#snippet children({ props })}
      <ConfigValueInput
        type={$form.type as ConfigEntryType}
        type_config={$form.type_config || null}
        fieldKey="create"
        bind:value={$form.value}
        errors={valueErrors}
      />
    {/snippet}
  </FormControl>
</FormField>
```

The `props` object from `FormControl` contains: `name`, `id`, `aria-invalid`, `aria-describedby`, `aria-required`, `data-fs-error`, and other form-related attributes. Currently `ConfigValueInput` does NOT spread `{...props}` — it only uses `bind:value` and `errors`. This is a gap: the numeric input inside `ConfigValueInput` doesn't receive `name`, `id`, or `aria-*` from formsnap.

## Chosen Pattern: `WithElementRef` + `restProps` spread (Pattern 1)

The `NumericInput` component will follow the `TextInput` pattern because:
1. It's the most DRY — `...restProps` catches all `aria-*`, `data-*`, `name`, `id` without explicit listing
2. It's type-safe via `WithElementRef<Omit<HTMLInputAttributes, ...>>`
3. It's the same pattern used by the base `Input` component that `NumericInput` will wrap
4. It supports both standalone usage (`bind:value`) and form usage (`{...props}` spread from `FormControl`)

## Architecture

### 1. Composable: `useNumericInput.svelte.ts`

**Location**: `src/lib/composables/useNumericInput.svelte.ts`

**Responsibility**: Encapsulate all numeric input state and logic (filtering, unsigned parsing, effective min, input mode, native conversion).

```ts
import type { ConfigEntryType } from '$lib/api-types';

type NumericType = 'bigint' | 'number' | 'money';

interface UseNumericInputOptions {
  /** Reactive getter for the numeric type */
  type: () => NumericType;
  /** Reactive getter for type_config JSON string */
  type_config: () => string | null;
  /** Reactive getter for the external value (prop) */
  value: () => string | bigint | number;
}

interface UseNumericInputReturn {
  /** Bindable local string state for the input element */
  localValue: string;
  /** Whether the input is unsigned (derived from type_config.validation.unsigned) */
  isUnsigned: boolean;
  /** Effective min for the HTML min attribute: explicit rules.min, or 0 for unsigned, or null */
  effectiveMin: string | null;
  /** inputmode attribute: 'numeric' for bigint, 'decimal' for number/money */
  inputMode: 'numeric' | 'decimal';
  /** oninput handler — strips invalid characters in real-time */
  filterInput: () => void;
  /** Sync localValue from the external prop (call on external value change) */
  syncFromProp: () => void;
  /** Convert localValue to native JS type (bigint/number/string) */
  toNative: () => string | bigint | number;
}
```

**Implementation details**:

- `localValue` is `$state<string>` initialized from `String(value())`
- `isUnsigned` is `$derived` — parses `type_config` JSON, checks `validation.unsigned === true`
- `effectiveMin` is `$derived` — parses `type_config` for `validation.rules.min.value`, falls back to `'0'` if unsigned, else `null`
- `inputMode` is `$derived` — `'numeric'` for `bigint`, `'decimal'` for `number`/`money`
- `filterInput()` calls the character filter function (same logic as current `filterNumericInput`)
- `syncFromProp()` sets `localValue = String(value())` when the external prop changes
- `toNative()` converts `localValue` to `bigint` (for bigint type) or `number` (for number/money) or `string` (if conversion fails)

**Character filter logic** (moved from `ConfigValueInput.svelte`):

```ts
function filterNumericInput(raw: string, type: NumericType, isUnsigned: boolean): string {
  if (type === 'bigint') {
    if (isUnsigned) return raw.replace(/[^\d]/g, '');
    const negative = raw.startsWith('-');
    const digits = raw.replace(/[^\d]/g, '');
    return digits === '' ? (negative ? '-' : '') : (negative ? '-' : '') + digits;
  }
  // number / money — allow one decimal point
  if (isUnsigned) {
    const cleaned = raw.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    return parts.length <= 1 ? parts[0] : parts[0] + '.' + parts.slice(1).join('');
  }
  const negative = raw.startsWith('-');
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  const body = parts.length <= 1 ? parts[0] : parts[0] + '.' + parts.slice(1).join('');
  if (body === '') return negative ? '-' : '';
  return (negative ? '-' : '') + body;
}
```

### 2. Component: `NumericInput.svelte`

**Location**: `src/lib/components/ui/numeric-input/NumericInput.svelte`

**Pattern**: `WithElementRef<Omit<HTMLInputAttributes, "type"> & { custom props }>` + `...restProps` spread

```svelte
<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  import Input from "$lib/components/ui/input/input.svelte";
  import { useNumericInput } from "$lib/composables/useNumericInput.svelte";
  import type { ConfigEntryType } from "$lib/api-types";

  type NumericType = "bigint" | "number" | "money";

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type"> & {
      /** Numeric config type — drives inputmode, filtering, and native conversion */
      type: NumericType;
      /** type_config JSON string — parsed for validation.unsigned and validation.rules.min */
      type_config?: string | null;
      /** Bindable value — accepts string | bigint | number */
      value?: string | bigint | number;
      /** Optional callback fired on value change with native type */
      onChange?: (value: string | bigint | number) => void;
      /** Errors array (string[] of i18n keys) — renders error message below input */
      errors?: string[];
    }
  >;

  let {
    ref = $bindable(null),
    type,
    type_config = null,
    value = $bindable(""),
    onChange,
    errors = [],
    class: className,
    ...restProps
  }: Props = $props();

  const num = useNumericInput({
    type: () => type,
    type_config: () => type_config,
    value: () => value,
  });

  // Sync from prop when external value changes
  let lastValue = $state<string | bigint | number>(value);
  $effect(() => {
    if (value !== lastValue) {
      num.syncFromProp();
      lastValue = value;
    }
  });

  function handleInput() {
    num.filterInput();
  }

  function handleBlur() {
    const native = num.toNative();
    if (native !== lastValue) {
      lastValue = native;
      value = native;
      onChange?.(native);
    }
  }

  // Error rendering (same pattern as ConfigValueInput)
  let firstError = $derived(errors.length > 0 ? errors[0] : "");
  let ariaInvalid = $derived(!!firstError);
</script>

<Input
  bind:ref
  type="text"
  inputmode={num.inputMode}
  min={num.effectiveMin ?? undefined}
  bind:value={num.localValue}
  oninput={handleInput}
  onblur={handleBlur}
  aria-invalid={ariaInvalid || restProps["aria-invalid"]}
  class={cn("w-full", className)}
  {...restProps}
/>
{#if firstError}
  <p class="text-xs text-destructive mt-1">{firstError}</p>
{/if}
```

**Key design decisions**:

1. **`...restProps` spread**: catches `name`, `id`, `aria-describedby`, `aria-required`, `data-fs-error`, `data-testid`, and any other attributes from `FormControl`'s `props` snippet
2. **`bind:value={num.localValue}`**: the composable owns the local string state; the component syncs to native on blur
3. **`aria-invalid`**: derived from `errors` array (same as `ConfigValueInput`), but also respects `restProps["aria-invalid"]` from formsnap
4. **`type="text"` + `inputmode`**: avoids the browser `type="number"` quirk that caused the `--` bug
5. **`min` attribute**: set from `effectiveMin` for spinner down-arrow behavior

### 3. Index file

**Location**: `src/lib/components/ui/numeric-input/index.ts`

```ts
export { default as NumericInput } from "./numeric-input.svelte";
```

### 4. ConfigValueInput.svelte — simplified

The bigint/number and money blocks collapse from ~40 lines each to a single component call. All inline numeric logic (`isUnsigned`, `effectiveMin`, `filterNumericInput`, `handleNumericInput`, `moneyCurrency`, `moneyCurrencySymbol`) is removed or simplified.

**Before** (current, ~90 lines of inline numeric logic):
```svelte
{:else if type === 'bigint' || type === 'number'}
  <div class="w-full">
    <Input type="text" inputmode={...} min={...} bind:value={localValue}
      oninput={handleNumericInput} onblur={handleBlur} ... />
    {#if firstError}<p ...>{translatedError}</p>{/if}
  </div>
{:else if type === 'money'}
  <div class="w-full flex items-center gap-2">
    <Input type="text" inputmode={...} min={...} bind:value={localValue}
      oninput={handleNumericInput} onblur={handleBlur} ... />
    {#if moneyCurrencySymbol}<span ...>{moneyCurrencySymbol}</span>{/if}
    {#if firstError}<p ...>{translatedError}</p>{/if}
  </div>
```

**After** (simplified):
```svelte
{:else if type === 'bigint' || type === 'number'}
  <NumericInput
    {type}
    {type_config}
    {fieldKey}
    bind:value
    errors={errors}
    {onChange}
    data-testid={`config-input-number-${fieldKey}`}
  />
{:else if type === 'money'}
  <div class="w-full flex items-center gap-2">
    <NumericInput
      {type}
      {type_config}
      {fieldKey}
      bind:value
      errors={errors}
      {onChange}
      data-testid={`config-input-money-${fieldKey}`}
    />
    {#if moneyCurrencySymbol}
      <span class="text-sm text-muted-foreground whitespace-nowrap">{moneyCurrencySymbol}</span>
    {/if}
  </div>
```

**Removed from ConfigValueInput.svelte**:
- `isUnsigned` derived
- `effectiveMin` derived
- `filterNumericInput` function
- `handleNumericInput` function
- The `Input` import is still needed for other types (string, url, time)

**Kept in ConfigValueInput.svelte**:
- `moneyCurrency` and `moneyCurrencySymbol` (still needed for the currency symbol span next to money input)
- `localValue` and `notifyChange` (still needed for non-numeric types)
- All other type blocks (boolean, badge, list, date, datetime, time, secret, url, text, json, string)

### 5. Create page — optional improvement

The create page currently does NOT spread `{...props}` from `FormControl` to `ConfigValueInput`. This means the numeric input doesn't receive `name`, `id`, or `aria-describedby` from formsnap. After the refactor, we can optionally update the create page to spread props:

```svelte
<ConfigValueInput
  type={$form.type as ConfigEntryType}
  type_config={$form.type_config || null}
  fieldKey="create"
  bind:value={$form.value}
  errors={valueErrors}
  {...props}  // ← NEW: pass formsnap attributes
/>
```

This requires `ConfigValueInput` to also accept and forward `...restProps` to its child inputs. This is a **secondary improvement** — the primary refactor is the `NumericInput` component extraction.

## Impacted Files

| File | Action | Description |
|------|--------|-------------|
| `src/lib/composables/useNumericInput.svelte.ts` | **CREATE** | Composable with numeric input state/logic |
| `src/lib/components/ui/numeric-input/numeric-input.svelte` | **CREATE** | Reusable numeric input component |
| `src/lib/components/ui/numeric-input/index.ts` | **CREATE** | Export index |
| `src/lib/components/config-list/ConfigValueInput.svelte` | **MODIFY** | Replace inline numeric logic with `<NumericInput>` calls |
| `src/lib/__tests__/useNumericInput.test.ts` | **CREATE** | Unit tests for the composable (filtering, unsigned, min, inputMode) |

## Acceptance Criteria

1. `NumericInput` component accepts all standard `HTMLInputAttributes` via `...restProps` and passes them to the underlying `<Input>`
2. `NumericInput` works with `{...props}` spread from `FormControl` (formsnap) — receives `name`, `id`, `aria-invalid`, `aria-describedby`, etc.
3. `useNumericInput` composable encapsulates: local string state, unsigned parsing, effective min, input mode, character filtering, native conversion
4. `ConfigValueInput.svelte` bigint/number/money blocks use `<NumericInput>` instead of inline `<Input type="text">` + inline filter logic
5. All inline numeric logic (`isUnsigned`, `effectiveMin`, `filterNumericInput`, `handleNumericInput`) is removed from `ConfigValueInput.svelte`
6. The `--` bug remains fixed (character filtering still works via the composable)
7. Unsigned behavior remains correct (no sign chars, min=0 default, explicit min override)
8. Existing FE tests pass (90 tests)
9. New composable unit tests pass
10. `svelte-check` passes with 0 errors

## Non-Goals

- Do NOT change the `ConfigValueInput` prop interface (it still accepts `type`, `type_config`, `fieldKey`, `value`, `errors`, `onChange`)
- Do NOT change the create page form structure (secondary improvement is optional)
- Do NOT change the SDK or backend (this is a FE-only refactor)
- Do NOT change the validation logic in `config-validation.ts` (already correct)
