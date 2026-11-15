# Plan: Extract ConfigValueInput for reuse in Create Entry page

## Empirical evidence

### 1. Create page ALREADY uses SuperForms
**File:** `src/routes/(app)/system/settings/security/create/+page.svelte` line 79
```ts
const superFormObj = superForm(defaults(zod4(createSchema)), {
  SPA: true,
  validators: zod4(createSchema),
  ...
});
```
The schema is FIXED (key, type, value, type_config, label_key, etc.). The create page uses the SAME SuperForms pattern as profile, orgs, users.

### 2. Dynamic validation works via `superRefine` — proven by users/create
**File:** `src/routes/(app)/system/settings/users/create/+page.svelte` lines 115-123
```ts
password: z.string()
  .superRefine((val, ctx) => {
    // Validate against the active password policy regex.
    // This runs at validation time (onblur/submit), after onMount has loaded the policy.
    if (val && !passwordPolicy.regex.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: passwordPolicy.state.errorLabelKey,
      });
    }
  })
```
`passwordPolicy` is a composable with `$state`, loaded async in `onMount`. The `superRefine` reads it at validation time. This proves `superRefine` can access dynamic state.

Also at lines 144-153, object-level `superRefine` for cross-field validation:
```ts
}).superRefine((data, ctx) => {
  if (!data.send_invitation && !data.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: 'validation.passwordRequired',
    });
  }
});
```
This is EXACTLY the pattern for the create config page: validate `data.value` based on `data.type` and `data.type_config`.

### 3. `bind:value` with `$state` record + dynamic keys works — proven by FiltersPanel
**File:** `src/lib/components/entity-list-table/panels/FiltersPanel.svelte` lines 64, 611
```ts
let dateDropperValues: Record<string, CalendarDate | CalendarDateTime | null> = $state({});
```
```svelte
<DateWheelPicker
  bind:value={dateDropperValues[col.key]}
  bind:timezone={timezoneValues[col.key]}
  ...
/>
```
This is a `$state` record with dynamic keys inside an `{#each}` loop — the EXACT same pattern as `bind:value={formValues[entry.uuid]}` in the config list.

### 4. `buildEntrySchema` is private — needs extraction
**File:** `src/lib/validation/config-validation.ts` line 54
```ts
function buildEntrySchema(entry: ConfigEntry): z.ZodTypeAny {
  const validation = extractValidation(entry.type_config);
  ...
  if (entry.type === 'integer') { ... }
```
Currently takes `ConfigEntry` and reads `entry.type` / `entry.type_config`. Needs to be extracted to accept `(type, type_config)` directly so the create page's `superRefine` can reuse it.

### 5. SDK has `validateConfigValue` but it throws, doesn't return Zod issues
**File:** `primebrick-v3-sdk/src/config/config-validator.ts` lines 77-164
The SDK validator throws `ConfigValidationError`. For the FE Zod schema, we need the Zod-based `buildEntrySchema` approach, not the SDK throw-based approach.

### 6. `refine` vs `superRefine` — both used in codebase
- **`ChangePasswordCard.svelte` line 40**: `.refine(async (val) => {...}, message)` — field-level, async, single error
- **`ChangePasswordCard.svelte` line 46**: `.refine((data) => data.new_password === data.confirm_password, { path, message })` — object-level, cross-field, single error
- **`users/create/+page.svelte` line 115**: `.superRefine((val, ctx) => {...})` — field-level, multiple issues via `ctx.addIssue()`
- **`users/create/+page.svelte` line 144**: `.superRefine((data, ctx) => {...})` — object-level, cross-field, multiple issues

For the create config page, the `value` field can have MULTIPLE validation errors (required + min + regex). `.refine()` returns only one error per call. `.superRefine()` with `ctx.addIssue()` can forward all issues from `safeParse()`. We use `.superRefine()` at the object level.

## Conclusion

**The create page CAN use SuperForms.** It already does. The dynamic validation for the `value` field is handled via `superRefine` at the object level — the same pattern used in users/create for password policy validation.

**ConfigValueInput uses `bind:value` ($bindable) for both pages.** No `value + onChange` pattern needed. Both pages use `bind:value`:
- Create page: `bind:value={$form.value}` (SuperForms store)
- Config list: `bind:value={formValues[entry.uuid]}` ($state record, proven pattern)

## Detailed steps

### Step 1: Extract `buildConfigValueSchema` from `buildEntrySchema`

**File:** `src/lib/validation/config-validation.ts`

Export a new function that accepts `(type, type_config)` instead of `ConfigEntry`:

```ts
/**
 * Build a Zod schema for a config value based on its type and validation rules.
 * Extracted from buildEntrySchema for reuse in the create page's superRefine.
 */
export function buildConfigValueSchema(
  type: ConfigEntryType,
  type_config?: string | null,
): z.ZodTypeAny {
  const validation = extractValidation(type_config);
  let schema: z.ZodString = z.string();

  if (validation?.required) {
    const requiredKey = validation.required_error_label_key ?? 'validation.required';
    schema = schema.min(1, { message: requiredKey });
  }

  if (type === 'integer') {
    schema = schema.regex(/^-?\d+$/, { message: 'validation.invalidInteger' });
  } else if (type === 'number') {
    schema = schema.regex(/^-?\d*\.?\d+$/, { message: 'validation.invalidNumber' });
  } else if (type === 'boolean') {
    schema = schema.regex(/^(true|false)$/, { message: 'validation.invalidBoolean' });
  } else if (type === 'url') {
    schema = schema.refine((val) => {
      if (!val) return true;
      try { new URL(val); return true; } catch { return false; }
    }, { message: 'validation.invalidUrl' });
  } else if (type === 'json') {
    schema = schema.refine((val) => {
      if (!val) return true;
      try { JSON.parse(val); return true; } catch { return false; }
    }, { message: 'validation.invalidJson' });
  }

  // Apply validation rules from type_config.validation (same as current buildEntrySchema)
  if (validation?.rules) { ... }

  return schema;
}
```

Then refactor `buildEntrySchema` to delegate:
```ts
function buildEntrySchema(entry: ConfigEntry): z.ZodTypeAny {
  return buildConfigValueSchema(entry.type, entry.type_config);
}
```

### Step 2: Refactor ConfigValueInput to use `bind:value` ($bindable)

**File:** `src/lib/components/config-list/ConfigValueInput.svelte`

**Props change:**
```ts
// Before
let { entry, value, errors = [], onChange }: {
  entry: ConfigEntry;
  value: string;
  errors?: string[];
  onChange: (value: string) => void;
} = $props();

// After
let {
  type,
  type_config = null,
  fieldKey = 'field',
  value = $bindable(),
  errors = [],
}: {
  type: ConfigEntryType;
  type_config?: string | null;
  fieldKey?: string;
  value: string;
  errors?: string[];
} = $props();
```

**Remove:**
- `import type { ConfigEntry }` → `import type { ConfigEntryType }`
- `localValue` state, `lastValue` state, `$effect` sync block
- `notifyChange()` function
- `handleInput()` function (empty no-op)

**Update internal references:**
- `entry.type` → `type`
- `entry.type_config` → `type_config`
- `entry.key` → `fieldKey`
- `localValue` → `value` (value is now $bindable)

**Update change handlers:**
- `handleBooleanChange(checked)` → `value = checked ? 'true' : 'false'`
- `handleBadgeChange(val)` → `value = Array.isArray(val) ? val[0] ?? '' : val`
- `handleListChange(val)` → `value = Array.isArray(val) ? val[0] ?? '' : val`
- `handleBlur()` → ensure string: `if (typeof value === 'number') value = String(value)`

**Template:** Replace all `bind:value={localValue}` → `bind:value`, all `value={value}` → `value` (bound).

### Step 3: Update ConfigListRow to use `bind:value`

**File:** `src/lib/components/config-list/ConfigListRow.svelte`

**Props change:**
```ts
// Before
let { entry, selected, tainted, value, errors = [], onChange, onRevert, onDelete, onToggleSelect }: {
  ...
  value: string;
  onChange: (value: string) => void;
  ...
} = $props();

// After
let { entry, selected, tainted, value = $bindable(), errors = [], onRevert, onDelete, onToggleSelect }: {
  ...
  value: string;
  ...
} = $props();
```

Remove `onChange` from props.

**Update ConfigValueInput call (line 153):**
```svelte
<!-- Before -->
<ConfigValueInput {entry} {value} {errors} {onChange} />

<!-- After -->
<ConfigValueInput type={entry.type} type_config={entry.type_config} fieldKey={entry.key} bind:value {errors} />
```

### Step 4: Update ConfigList to use `bind:value` + `$effect` validation

**File:** `src/lib/components/config-list/ConfigList.svelte`

**Update ConfigListRow calls:** Use `bind:value={formValues[entry.uuid]}` instead of `value={...}` + `onChange={...}`:

```svelte
<!-- Before -->
<ConfigListRow
  {entry}
  selected={selectedUuids.has(entry.uuid)}
  tainted={taintedUuids.has(entry.uuid)}
  value={formValues[entry.uuid] ?? ''}
  errors={formErrors[entry.uuid] ?? []}
  onChange={(value) => handleFieldChange(entry.uuid, value)}
  onRevert={() => handleRevert(entry.uuid)}
  {onDelete}
  onToggleSelect={handleToggleSelect}
/>

<!-- After -->
<ConfigListRow
  {entry}
  selected={selectedUuids.has(entry.uuid)}
  tainted={taintedUuids.has(entry.uuid)}
  bind:value={formValues[entry.uuid]}
  errors={formErrors[entry.uuid] ?? []}
  onRevert={() => handleRevert(entry.uuid)}
  {onDelete}
  onToggleSelect={handleToggleSelect}
/>
```

**Replace `handleFieldChange` with `$effect` validation:**
```ts
// Remove handleFieldChange function

// Add $effect that validates all fields when formValues changes
$effect(() => {
  // Read formValues to track changes
  const currentValues = { ...formValues };
  const newErrors: Record<string, string[]> = {};
  for (const entry of entries) {
    const val = currentValues[entry.uuid] ?? '';
    const fieldSchema = (schema as any).shape[entry.uuid];
    if (!fieldSchema) continue;
    const result = fieldSchema.safeParse(val);
    newErrors[entry.uuid] = result.success ? [] : result.error.issues.map((i: any) => i.message);
  }
  // Only update if errors changed (avoid infinite loop)
  if (JSON.stringify(newErrors) !== JSON.stringify(formErrors)) {
    formErrors = newErrors;
  }
});
```

**Keep:** `handleRevert` — sets `formValues[uuid] = originalValues[uuid]`, works with bind:value.

### Step 5: Update create page — dynamic validation via `superRefine`

**File:** `src/routes/(app)/system/settings/security/create/+page.svelte`

**Import ConfigValueInput and buildConfigValueSchema:**
```ts
import ConfigValueInput from '$lib/components/config-list/ConfigValueInput.svelte';
import { buildConfigValueSchema } from '$lib/validation/config-validation';
```

**Add `superRefine` to the create schema for dynamic `value` validation:**
```ts
const createSchema = z.object({
  key: z.string()...,
  type: z.string()...,
  value: z.string().default(''),
  type_config: z.string().default(''),
  label_key: z.string()...,
  description_key: z.string()...,
  group_key: z.string()...,
  reserved: z.boolean()...,
}).superRefine((data, ctx) => {
  // Dynamic validation: validate value based on type and type_config
  // Same pattern as users/create superRefine for password policy
  const valueSchema = buildConfigValueSchema(
    data.type as ConfigEntryType,
    data.type_config || null,
  );
  const result = valueSchema.safeParse(data.value);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: issue.message,
      });
    }
  }
});
```

**Replace the Value field with ConfigValueInput:**
```svelte
<!-- Before -->
<FormField form={superFormObj} name="value">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.security.create.value')}</FormLabel>
        <TextInput
          {...props}
          bind:value={$form.value}
          placeholder={$t('shell.settings.security.create.valuePlaceholder')}
          data-testid="config-create-value"
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>

<!-- After -->
<FormField form={superFormObj} name="value">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.security.create.value')}</FormLabel>
        <ConfigValueInput
          type={$form.type as ConfigEntryType}
          type_config={$form.type_config || null}
          fieldKey="create"
          bind:value={$form.value}
          errors={valueErrors}
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**Extract SuperForms errors for the `value` field:**
```ts
let valueErrors = $derived(
  $errors?.value
    ? Array.isArray($errors.value) ? $errors.value.map(String) : [String($errors.value)]
    : []
);
```

**Keep `TextInput` import** — still used for key, label_key, description_key, group_key fields.

### Step 6: Verify

- Run `pnpm run check` — must have 0 errors
- Test empirically via Playwright:
  1. Config list page: verify all input types still render and edit correctly
  2. Config list page: verify taint tracking still works (change a value → warning border)
  3. Config list page: verify validation errors display
  4. Create page: change Type dropdown → Value field widget changes accordingly
  5. Create page: type invalid value → validation error appears
  6. Create page: submit valid form → entry created, parent refreshes

## Files impacted

| File | Change |
|------|--------|
| `src/lib/validation/config-validation.ts` | Export `buildConfigValueSchema(type, type_config)`, refactor `buildEntrySchema` to delegate |
| `src/lib/components/config-list/ConfigValueInput.svelte` | Props: `entry` → `type` + `type_config` + `fieldKey`; `value` → `$bindable`; remove `onChange` |
| `src/lib/components/config-list/ConfigListRow.svelte` | `value` → `$bindable`; remove `onChange`; update ConfigValueInput call |
| `src/lib/components/config-list/ConfigList.svelte` | Use `bind:value={formValues[entry.uuid]}`; replace `handleFieldChange` with `$effect` validation |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | Add `superRefine` for dynamic value validation; replace TextInput with ConfigValueInput using `bind:value={$form.value}` |

## Risks

1. **$effect validation loop**: The `$effect` reads `formValues` and writes `formErrors`. These are separate `$state` objects. The `JSON.stringify` comparison prevents unnecessary writes. No infinite loop because `formErrors` is not read in the effect.

2. **bind:value with $state record**: Proven by FiltersPanel.svelte (`bind:value={dateDropperValues[col.key]}` with `Record<string, ...> = $state({})`). Same pattern.

3. **superRefine reading form data**: The `superRefine` reads `data.type` and `data.type_config` from the form data. SuperForms passes the form data to the validator. Proven by users/create line 144 which reads `data.send_invitation` and `data.password` inside superRefine.

4. **Number input string conversion**: `bind:value` on `<Input type="number">` may produce a `number`. The `handleBlur` must ensure string conversion. Since `value` is typed as `string`, we need to handle this in the blur handler.
