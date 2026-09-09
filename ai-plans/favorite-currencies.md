# Favorite Currencies + Type Rename: `list` → `single_select` / `multi_select`

## Architecture Decision

The TYPE name must reflect the UX (single vs multi selection), not just the widget.
Both types use ComboSelect — the type name tells the user what selection experience to expect.

### Type vocabulary change

| Before | After | Widget | Mode |
|--------|-------|--------|------|
| `list` | `single_select` | ComboSelect | `mode="single"` |
| _(new)_ | `multi_select` | ComboSelect | `mode="multi"` |

### Breaking change handling

Fire-and-forget SQL patch renames existing `list` rows to `single_select`.
No backward-compat alias — clean break, same as the `integer` → `bigint` rename.

### Config entry for currency favorites

| Field | Value |
|-------|-------|
| `key` | `currency_favorites` |
| `value` | `EUR,USD,GBP,CHF,CNY,JPY` |
| `type` | `multi_select` |
| `type_config` | `{"values_source":"currencies","value_field":"code","label_field":"name","validation":{"required":false,"rules":{}}}` |
| `label_key` | `config.auth.currency_favorites.label` |
| `description_key` | `config.auth.currency_favorites.description` |
| `reserved` | `false` |
| `group_key` | `system_settings` |
| `created_by` | `system` |

**Options source**: FE loads options directly from `getAllCurrencies()` (from `countries-list`,
already a dependency). `type_config` uses `"values_source": "currencies"` — the FE widget
recognizes this and builds options without any API call. No endpoint, no static blob.

**`type_config` for select types** supports two option sources:
- `"values_source": "currencies"` → FE calls `getAllCurrencies()` directly (built-in source)
- `"api_url": "/some/endpoint"` → FE fetches options from BE API (existing behavior)

**Storage**: comma-separated string (`EUR,USD,GBP`). FE converts to/from `string[]` for ComboSelect.

## Implementation

### 1. SDK: Rename `list` → `single_select`, add `multi_select`

**`src/config/iconfig-entity.ts`**:
```ts
export type ConfigType =
  | "string"
  | "text"
  | "boolean"
  | "bigint"
  | "number"
  | "money"
  | "badge"
  | "single_select"   // was "list"
  | "multi_select"    // NEW
  | "url"
  | "secret"
  | "json"
  | "date"
  | "datetime"
  | "time";
```

**`src/config/config-validator.ts`**:
- `case "list":` → `case "single_select":`
- Add `case "multi_select":` — same validation as `single_select` (no base type check, values validated against API)
- `coerceConfigValue`: both `single_select` and `multi_select` → string as-is (comma-separated for multi)

**`docs/user-guide/config-tables.mdx`**:
- Update type table: `list` → `single_select`, add `multi_select` row
- Update `type_config` shape table
- Document CSV storage for `multi_select`

### 2. BE: Rename + seed

**`db-meta/patches/00000000000000_init_database.sql`**:
- Rename all existing `list` seed rows to `single_select`
- Add `currency_favorites` seed row with `type: 'multi_select'`

**`db-meta/fire-and-forget/rename_list_to_single_select.sql`** (NEW):
```sql
BEGIN;
UPDATE "public"."auth_configurations" SET "type" = 'single_select' WHERE "type" = 'list';
COMMIT;
```

**`db-meta/fire-and-forget/seed_currency_favorites_config.sql`** (NEW):
```sql
BEGIN;
INSERT INTO "public"."auth_configurations" ("key", "value", "type", "type_config", "label_key", "description_key", "reserved", "group_key", "created_by")
VALUES ('currency_favorites', 'EUR,USD,GBP,CHF,CNY,JPY', 'multi_select', '{"values_source":"currencies","value_field":"code","label_field":"name","validation":{"required":false,"rules":{}}}', 'config.auth.currency_favorites.label', 'config.auth.currency_favorites.description', false, 'system_settings', 'system')
ON CONFLICT ("key") DO NOTHING;
COMMIT;
```

**`src/index.ts`** (or wherever config types are validated):
- Update type validation to accept `single_select` and `multi_select` instead of `list`

**`src/modules/auth/__tests__/config-entries-router.test.ts`**:
- Update any test rows using `type: 'list'` → `type: 'single_select'`

### 3. FE: Type rename + new multi_select widget

**`src/lib/api-types.ts`**:
```ts
export type ConfigEntryType =
  | 'string'
  | 'text'
  | 'boolean'
  | 'bigint'
  | 'number'
  | 'money'
  | 'badge'
  | 'single_select'   // was 'list'
  | 'multi_select'    // NEW
  | 'url'
  | 'secret'
  | 'json'
  | 'date'
  | 'datetime'
  | 'time';
```

**`src/lib/components/config-list/ConfigValueInput.svelte`**:
- `{:else if type === 'list'}` → `{:else if type === 'single_select'}`
- Add `{:else if type === 'multi_select'}` branch:
  - ComboSelect with `mode="multi"`
  - Convert DB CSV string → `string[]` for ComboSelect value
  - Convert ComboSelect `string[]` → CSV string for DB on change
  - Same `api_url` / `values` / `value_field` / `label_field` parsing as `single_select`

```svelte
{:else if type === 'single_select'}
  <div class="w-full">
    <ComboSelect
      mode="single"
      value={stringValue}
      onChange={handleSingleSelectChange}
      options={selectOptions}
      valueField={selectConfig?.value_field ?? 'value'}
      labelField={selectConfig?.label_field ?? 'label_key'}
      isLabelTranslated
      ...
    />
  </div>
{:else if type === 'multi_select'}
  <div class="w-full">
    <ComboSelect
      mode="multi"
      value={multiSelectValue}
      onChange={handleMultiSelectChange}
      options={selectOptions}
      valueField={selectConfig?.value_field ?? 'value'}
      labelField={selectConfig?.label_field ?? 'label_key'}
      isLabelTranslated
      ...
    />
  </div>
```

**Refactor**: Extract shared logic between `single_select` and `multi_select`:
- `selectConfig` parsing (api_url, values, value_field, label_field)
- `selectOptions` loading (from API or static values)
- Only the value conversion and ComboSelect mode differ

**`src/lib/validation/config-validation.ts`**:
- No `case "list"` to rename (list/single_select/multi_select have no base type check — they fall through to the default string validation)
- But check if there's any explicit `list` reference

**`src/routes/(app)/system/settings/security/create/+page.svelte`**:
- Update the type dropdown options: `list` → `single_select`, add `multi_select`

### 4. FE: ConfigValueInput — `values_source` support

In `ConfigValueInput.svelte`, the shared select logic (for both `single_select` and `multi_select`)
checks `type_config` for option sources in this order:

1. `"values_source": "currencies"` → calls `getAllCurrencies()` directly (no API, no endpoint)
2. `"api_url": "..."` → fetches from BE API (existing behavior)
3. `"values": {...}` → static inline values (like `badge` type)

```ts
let selectConfig = $derived.by<{
  values_source?: string;
  api_url?: string;
  api_verb?: string;
  value_field?: string;
  label_field?: string;
  values?: Record<string, { label_key?: string; color?: string }>;
} | null>(() => {
  if ((type !== 'single_select' && type !== 'multi_select') || !type_config) return null;
  try { return JSON.parse(type_config); } catch { return null; }
});

// Build options from values_source, api_url, or static values
let selectOptions = $state<Record<string, any>[]>([]);
let selectLoading = $state(false);

$effect(() => {
  if (type !== 'single_select' && type !== 'multi_select') return;
  if (selectConfig?.values_source === 'currencies') {
    // Direct from countries-list — no API call
    selectOptions = getAllCurrencies() as unknown as Record<string, any>[];
    return;
  }
  if (selectConfig?.values) {
    // Static inline values (like badge)
    selectOptions = Object.entries(selectConfig.values).map(([val, meta]) => ({
      value: val, label_key: meta.label_key, color: meta.color,
    }));
    return;
  }
  if (selectConfig?.api_url) {
    // Existing API fetch behavior
    selectLoading = true;
    fetch(selectConfig.api_url, { method: selectConfig.api_verb ?? 'GET' })
      .then((res) => res.json())
      .then((data) => { selectOptions = Array.isArray(data) ? data : data.rows ?? []; })
      .catch(() => { selectOptions = []; })
      .finally(() => { selectLoading = false; });
  }
});
```

### 5. FE: CurrencySelectPanel — favorites section

Modify `src/lib/shell/sheets/panels/CurrencySelectPanel.svelte`:
1. On mount, fetch `currency_favorites` config entry via `fetchConfigEntries()`
2. Parse comma-separated value into `string[]`
3. Render "Favorite Currencies" section at top (only when no search query)
4. Separator + "All Currencies" header + full alphabetical list below
5. When searching, favorites mix into results

### 6. FE: i18n translations

Add to all 7 locale files:

```json
"config": {
  "currencySelect": {
    "favorites": "Favorite Currencies",
    "allCurrencies": "All Currencies"
  },
  "auth": {
    "currency_favorites": {
      "label": "Favorite Currencies",
      "description": "Currencies shown at the top of the currency selector."
    }
  }
}
```

Also update any i18n key that references the old `list` type name (e.g. type labels in the create page dropdown).

### Impacted Files

| File | Repo | Action | Description |
|------|------|--------|-------------|
| `src/config/iconfig-entity.ts` | SDK | MODIFY | Rename `list` → `single_select`, add `multi_select` in ConfigType |
| `src/config/config-validator.ts` | SDK | MODIFY | Rename case, add multi_select case |
| `docs/user-guide/config-tables.mdx` | SDK | MODIFY | Update type table + type_config docs |
| `db-meta/patches/00000000000000_init_database.sql` | BE | MODIFY | Rename list→single_select in seeds, add currency_favorites |
| `db-meta/fire-and-forget/rename_list_to_single_select.sql` | BE | CREATE | Rename existing list rows |
| `db-meta/fire-and-forget/seed_currency_favorites_config.sql` | BE | CREATE | Seed currency_favorites row |
| `src/index.ts` | BE | MODIFY | Update type validation if any |
| `src/modules/auth/__tests__/config-entries-router.test.ts` | BE | MODIFY | Update list→single_select in tests |
| `src/lib/api-types.ts` | FE | MODIFY | Rename list→single_select, add multi_select |
| `src/lib/components/config-list/ConfigValueInput.svelte` | FE | MODIFY | Rename list→single_select, add multi_select branch |
| `src/lib/validation/config-validation.ts` | FE | MODIFY | Check for list references |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | FE | MODIFY | Update type dropdown |
| `src/lib/shell/sheets/panels/CurrencySelectPanel.svelte` | FE | MODIFY | Fetch favorites, render favorites section |
| `src/lib/i18n/messages/*.json` (7 files) | FE | MODIFY | Add translations |
| `src/lib/__tests__/config-validation.test.ts` | FE | MODIFY | Update list→single_select in tests |

### Acceptance Criteria

1. SDK `ConfigType` has `single_select` and `multi_select` (no `list`)
2. BE fire-and-forget patch renames existing `list` rows to `single_select`
3. BE seeds `currency_favorites` row with `type: 'multi_select'`
4. FE ConfigValueInput renders `single_select` with ComboSelect `mode="single"`
5. FE ConfigValueInput renders `multi_select` with ComboSelect `mode="multi"`
6. `multi_select` stores values as comma-separated string in DB
7. ConfigValueInput loads currency options from `getAllCurrencies()` when `values_source: "currencies"`
8. ConfigList shows `currency_favorites` row with multi-select ComboSelect
9. Currency select panel shows "Favorite Currencies" section at top
10. Separator divides favorites from full alphabetical list
11. When searching, favorites mix into results
12. Editing config value and reopening panel reflects new favorites
13. Invalid currency codes silently filtered out in panel
14. All existing tests pass (FE + BE)
15. `svelte-check` passes with 0 errors
