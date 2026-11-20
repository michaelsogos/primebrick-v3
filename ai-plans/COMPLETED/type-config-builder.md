# Type Config Builder — Visual editor + JSON override for type_config

## Problem

The `type_config` JSON is hand-written in a textarea. Users must know the exact shape
per type (validation rules, widget config, error_label_keys). This is error-prone and
not DRY — the same `JSON.parse(type_config)` pattern is duplicated in 4+ places:

| Location | What it parses |
|----------|---------------|
| `ConfigValueInput.svelte` | badge values, select config, money currency, currency change handler |
| `useNumericInput.svelte.ts` | unsigned flag, min/max rules, currency |
| `config-validation.ts` | validation rules for Zod schema building |
| `create/+page.svelte` | passes raw string to SuperForms |

The FE also duplicates the SDK's `ConfigValidation` interface (defined locally in
`config-validation.ts` instead of importing from `@primebrick/sdk`).

## DRY Analysis

### Current duplication

1. **`ConfigValidation` interface** — defined in SDK (`iconfig-entity.ts`) AND duplicated
   in FE (`config-validation.ts` line 21-33). Same shape, same fields, same comments.

2. **`type_config` JSON parsing** — `JSON.parse(type_config)` with try/catch appears in:
   - `ConfigValueInput.svelte` (4 times: badge, select, money, currency change)
   - `useNumericInput.svelte.ts` (1 time: `parseTypeConfig`)
   - `config-validation.ts` (1 time: `extractValidation`)

3. **Type-specific config shape knowledge** — each parser knows a different slice:
   - `ConfigValueInput` knows about `values`, `api_url`, `values_source`, `currency`
   - `useNumericInput` knows about `validation.unsigned`, `validation.rules.min/max`, `currency`
   - `config-validation` knows about `validation.required`, `validation.rules.*`

4. **error_label_key convention** — `config.auth.{key}.errors.{rule}` is used everywhere
   but never formalized.

### Why the FE can't import from the SDK

The FE has no `@primebrick/sdk` dependency (it's not in `package.json`). The SDK is a
Node.js library (uses `pg`, `nats`, etc.) — importing it into a SvelteKit browser app
would pull in server-only deps. The FE maintains its own type copies.

**Decision**: Keep the FE's local types. But consolidate the parsing into ONE module
so there's only one place that knows the `type_config` shape.

## Architecture

### New: `$lib/config/type-config-schema.ts`

Single source of truth for the FE's `type_config` knowledge. Replaces all scattered
`JSON.parse(type_config)` calls.

```ts
// ─── Types (mirror SDK, consolidated) ───────────────────────────

export interface ConfigValidation {
  required: boolean;
  required_error_label_key?: string;
  unsigned?: boolean;
  rules: {
    min?: { value: number; error_label_key: string };
    max?: { value: number; error_label_key: string };
    url?: { protocols: string[]; error_label_key: string };
    email?: { error_label_key: string };
    regex?: { pattern: string; error_label_key: string };
  };
}

// ─── Parsed type_config (union of all possible fields) ──────────

export interface ParsedTypeConfig {
  // Validation (all types)
  validation?: ConfigValidation;
  // Money
  currency?: string;
  allowed_currencies?: string[];
  // Badge
  values?: Record<string, { label_key?: string; color?: string }>;
  // single_select / multi_select
  values_source?: string;
  api_url?: string;
  api_verb?: string;
  value_field?: string;
  label_field?: string;
}

// ─── Parse ───────────────────────────────────────────────────────

export function parseTypeConfig(type_config?: string | null): ParsedTypeConfig | null {
  if (!type_config) return null;
  try {
    return JSON.parse(type_config) as ParsedTypeConfig;
  } catch {
    return null;
  }
}

// ─── Serialize ───────────────────────────────────────────────────

export function serializeTypeConfig(config: ParsedTypeConfig): string {
  // Strip undefined values, empty objects, empty arrays
  return JSON.stringify(stripEmpty(config));
}

// ─── error_label_key auto-generation ─────────────────────────────

export function autoErrorLabelKey(configKey: string, rule: string): string {
  return `config.auth.${configKey}.errors.${rule}`;
}

// ─── Built-in values_source registry ─────────────────────────────

export interface ValuesSourceDefinition {
  id: string;           // "currencies", "countries", etc.
  label_key: string;    // i18n key for the dropdown label
  value_field: string;  // default value field
  label_field: string;  // default label field
}

export const BUILTIN_VALUES_SOURCES: ValuesSourceDefinition[] = [
  { id: 'currencies', label_key: 'config.typeConfig.valuesSource.currencies', value_field: 'code', label_field: 'name' },
  // Future: countries, languages, timezones...
];
```

### New: `$lib/config/type-config-builder.svelte.ts`

A composable that manages the structured state and serializes to JSON on every change.

```ts
export function useTypeConfigBuilder(
  type: () => ConfigEntryType,
  configKey: () => string,
  initialTypeConfig: () => string | null,
) {
  // Internal structured state
  let state = $state<ParsedTypeConfig>({});

  // Parse initial value on mount / when type changes
  // Serialize to JSON on every state change → onTypeConfigChange callback

  // Expose granular reactive getters + mutators
  return {
    get validation() { return state.validation; },
    get currency() { return state.currency; },
    get values() { return state.values; },
    get selectConfig() { return /* values_source / api_url / etc */; },
    // Mutators
    setRequired(required: boolean) { ... },
    setUnsigned(unsigned: boolean) { ... },
    setMin(value: number | null) { ... },
    setMax(value: number | null) { ... },
    setCurrency(code: string) { ... },
    setValuesSource(source: string | null) { ... },
    setApiUrl(url: string) { ... },
    addBadgeValue(value: string) { ... },
    removeBadgeValue(value: string) { ... },
    // JSON output
    get json() { return serializeTypeConfig(state); },
    // Override from raw JSON (advanced mode)
    overrideFromJson(json: string) { ... },
  };
}
```

### New: `TypeConfigBuilder.svelte` (the visual UI)

Orchestrator component. Renders sections based on type.

```
TypeConfigBuilder.svelte
├── ValidationRulesSection.svelte     (all types)
│   ├── Required toggle
│   ├── Unsigned toggle (bigint/number/money only)
│   ├── Min input (numeric value OR string length, based on type)
│   ├── Max input (same)
│   ├── URL protocols (url type only)
│   ├── Email toggle (string/text only)
│   └── Regex pattern (string/text/secret only)
│
├── WidgetConfigSection.svelte        (type-specific, conditional)
│   ├── money → CurrencyPicker (reuse existing currency sheet + CTA)
│   ├── badge → BadgeValuesEditor (add/remove rows: value + label_key + color)
│   ├── single_select/multi_select → SelectSourceEditor
│   │   ├── Source mode selector: [built-in source ▾] | [API URL] | [inline values]
│   │   ├── if built-in → dropdown from BUILTIN_VALUES_SOURCES
│   │   ├── if API → URL input + verb + value_field + label_field
│   │   └── if inline → reuse BadgeValuesEditor
│   └── (other types → nothing)
│
└── JsonPreviewEditor.svelte          (collapsible, always present)
    ├── Read-only formatted preview (updates live from builder state)
    └── "Advanced: edit raw JSON" toggle → textarea with schema validation
```

### Layout change in create page

```
┌─────────────────────────────┬──────────────────────────────────┐
│ LEFT COLUMN                 │ RIGHT COLUMN                      │
│                             │                                   │
│ Key           [________]    │ Type Config Builder               │
│ Type          [dropdown]    │ ┌──────────────────────────────┐ │
│ Value         [________]    │ │ Validation Rules             │ │
│                             │ │  [✓] Required                │ │
│ Label key     [________]    │ │  [ ] Unsigned (numeric)      │ │
│ Description   [________]    │ │  Min [__]  Max [__]          │ │
│ Group key     [________]    │ │  [ ] Regex  [pattern______]  │ │
│ Reserved      [switch]      │ │  [ ] Email                   │ │
│                             │ │  [ ] URL protocols [______]  │ │
│                             │ │                              │ │
│                             │ │ Widget Config                │ │
│                             │ │  (type-specific fields)      │ │
│                             │ │                              │ │
│                             │ │ ▸ JSON Preview (collapsible) │ │
│                             │ │   {"validation":{"required": │ │
│                             │ │    true,"rules":{}}}         │ │
│                             │ │  [✓] Advanced: edit raw JSON │ │
│                             │ └──────────────────────────────┘ │
└─────────────────────────────┴──────────────────────────────────┘
```

### JSON override mode

- Default: visual builder is the source of truth, JSON preview is read-only
- Toggle "Advanced: edit raw JSON" → textarea appears, visual builder goes read-only
- On JSON edit: parse with `parseTypeConfig()`, validate shape, sync back to builder state
- If JSON is invalid: show error, don't sync, let user fix
- When user toggles back to visual mode: builder state is the source of truth again
- This gives power users full control while keeping the visual builder as the default path

### Refactoring existing code to use the new module

| File | Current | After |
|------|---------|-------|
| `ConfigValueInput.svelte` | 4× `JSON.parse(type_config)` | `parseTypeConfig(type_config)` from new module |
| `useNumericInput.svelte.ts` | local `parseTypeConfig()` | import from new module |
| `config-validation.ts` | local `extractValidation()` + local `ConfigValidation` interface | import from new module |
| `create/+page.svelte` | raw textarea for `type_config` | `<TypeConfigBuilder>` component |

### error_label_key handling

- Each validation rule field has an optional `error_label_key` input
- Placeholder shows the auto-generated key: `config.auth.{key}.errors.{rule}`
- If user leaves it empty, the builder uses the auto-generated key
- If user types a custom key, it's used as-is
- This removes the need to manually type i18n keys for every rule

### Built-in values_source registry

- `BUILTIN_VALUES_SOURCES` array in `type-config-schema.ts`
- `SelectSourceEditor` renders a dropdown of known sources
- Each source has a default `value_field` and `label_field` (auto-filled when selected)
- Extensible: add new sources (countries, languages, timezones) by adding to the array
- The FE loads the actual data at render time (e.g. `getAllCurrencies()`) — the registry
  only stores the source ID and defaults

## Implementation Plan

### Phase 1: DRY consolidation (no UI change)

1. Create `$lib/config/type-config-schema.ts` with:
   - `ParsedTypeConfig` interface
   - `ConfigValidation` interface (moved from `config-validation.ts`)
   - `parseTypeConfig()` function
   - `serializeTypeConfig()` function
   - `autoErrorLabelKey()` function
   - `BUILTIN_VALUES_SOURCES` array
2. Refactor `config-validation.ts` to import from new module
3. Refactor `ConfigValueInput.svelte` to use `parseTypeConfig()`
4. Refactor `useNumericInput.svelte.ts` to use `parseTypeConfig()` from new module
5. Run tests — all should pass with no behavior change

### Phase 2: Type Config Builder composable

1. Create `$lib/config/type-config-builder.svelte.ts` (the `useTypeConfigBuilder` composable)
2. Handles: parse initial → structured state → serialize on change → JSON override
3. Unit tests for the composable (parse, serialize, override, error_label_key auto-gen)

### Phase 3: Visual builder components

1. `ValidationRulesSection.svelte` — validation fields, adapts to type
2. `WidgetConfigSection.svelte` — type-specific widget config
3. `BadgeValuesEditor.svelte` — add/remove badge value rows (reused by badge + inline select)
4. `SelectSourceEditor.svelte` — source mode selector + fields
5. `JsonPreviewEditor.svelte` — collapsible preview + advanced raw JSON toggle
6. `TypeConfigBuilder.svelte` — orchestrator, renders sections based on type

### Phase 4: Create page integration

1. Move `label_key`, `description_key`, `group_key`, `reserved` to left column (below value)
2. Replace `type_config` textarea in right column with `<TypeConfigBuilder>`
3. Wire builder's `onTypeConfigChange` to SuperForms `$form.type_config`
4. i18n translations for all builder labels
5. Tests + svelte-check

### Phase 5: Edit page (future)

The edit page (ConfigList rows) currently doesn't edit type_config inline.
Future: add a "Configure" button on each row that opens the TypeConfigBuilder in a sheet.
This is out of scope for now — the create page is the priority.

## Impacted Files

| File | Action | Phase |
|------|--------|-------|
| `src/lib/config/type-config-schema.ts` | CREATE | 1 |
| `src/lib/validation/config-validation.ts` | MODIFY (import from new module) | 1 |
| `src/lib/components/config-list/ConfigValueInput.svelte` | MODIFY (use parseTypeConfig) | 1 |
| `src/lib/composables/useNumericInput.svelte.ts` | MODIFY (use parseTypeConfig) | 1 |
| `src/lib/config/type-config-builder.svelte.ts` | CREATE | 2 |
| `src/lib/config/__tests__/type-config-builder.test.ts` | CREATE | 2 |
| `src/lib/components/config-builder/ValidationRulesSection.svelte` | CREATE | 3 |
| `src/lib/components/config-builder/WidgetConfigSection.svelte` | CREATE | 3 |
| `src/lib/components/config-builder/BadgeValuesEditor.svelte` | CREATE | 3 |
| `src/lib/components/config-builder/SelectSourceEditor.svelte` | CREATE | 3 |
| `src/lib/components/config-builder/JsonPreviewEditor.svelte` | CREATE | 3 |
| `src/lib/components/config-builder/TypeConfigBuilder.svelte` | CREATE | 3 |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | MODIFY (layout + builder) | 4 |
| `src/lib/i18n/messages/*.json` (6 files) | MODIFY (builder labels) | 4 |

## Acceptance Criteria

1. `type-config-schema.ts` is the single source of truth for type_config parsing/serialization
2. No `JSON.parse(type_config)` calls outside the new module
3. `ConfigValidation` interface is defined once (in the new module), not duplicated
4. Visual builder generates valid type_config JSON for all types
5. JSON preview is always visible and updates live
6. Advanced raw JSON mode works — user can override, builder syncs back
7. error_label_key auto-generation with override capability
8. Built-in values_source dropdown for select types (currencies, future extensible)
9. Layout: label_key/description_key/group_key/reserved moved to left column
10. All existing tests pass after Phase 1 refactoring
11. New tests for the builder composable
12. `svelte-check` passes with 0 errors
