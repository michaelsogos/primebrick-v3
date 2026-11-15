# Plan: Dynamic AI Assistant Model from Config

## Objective

1. Create a new reserved config row `ai_assistant_model` in `auth_configurations` with value `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`, type `badge`, listing 3 tiered WebLLM models (Lower / Average / Higher) with translated hint descriptions.
2. Create a reusable DRY config-access composable in the FE that caches all entries (leveraging the existing ETag cache mechanism) and exposes per-key lookups.
3. Refactor existing config-fetching code (`CurrencySelectPanel`, `useExistingGroupKeys`) to use the new composable.
4. Modify `use-regex-ai.svelte.ts` to read the model ID dynamically from config instead of the hardcoded `MODEL_ID` constant.

---

## Decisions (confirmed with user)

- **Config value**: Full WebLLM model ID (e.g. `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`) — no FE mapping table needed.
- **Config type**: `single_select` with `values_source: "ai_models"` — searchable dropdown. The 3 model options come from a new FE built-in data module (mirroring the `currencies` `values_source` pattern). The `type_config` JSON stays small and DRY; the model list (with labels + descriptions) lives in a dedicated FE module, not duplicated in the DB. See Part 2.4.
- **Model tiers**: 3 models only, each with a tier label and a translated hint description:
  - **Lower**: `Qwen3-1.7B-q4f16_1-MLC` — hint: "Works well in many scenarios but precision is its weak point"
  - **Average**: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (default) — hint: "The perfect balance: quick, fast, precise in almost every scenario"
  - **Higher**: `Qwen3-4B-q4f16_1-MLC` — hint: "Very heavy, depends on machine resource capability, but a precise model with deeper reasoning"
- **Reserved**: `true` — type/type_config locked, only value editable, not deletable.
- **FE pattern**: New reusable composable that fetches all entries once (cached via ETag), exposes `get(key)` from the cached dict. Refactor existing inline patterns to use it.

---

## Part 1: Backend — Seed `ai_assistant_model` config row

### 1.1 New fire-and-forget SQL: `seed_ai_assistant_model.sql`

**File**: `D:\git\primebrick\primebrick-be-v3\db-meta\fire-and-forget\seed_ai_assistant_model.sql`

**Pattern**: Mirrors `rename_list_to_single_select_and_seed_currency_favorites.sql` exactly.

**SQL content**:
- `INSERT INTO auth_configurations` with:
  - `key`: `'ai_assistant_model'`
  - `value`: `'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'`
  - `type`: `'single_select'`
  - `type_config`: JSON with `values_source: "ai_models"` (mirrors the `currencies` `values_source` pattern). The model list lives in a FE data module, not duplicated in the DB:
    ```json
    {
      "values_source": "ai_models",
      "value_field": "id",
      "label_field": "label_key",
      "validation": { "required": true, "required_error_label_key": "app.common.validation.required", "rules": {} }
    }
    ```
    **Note**: `values_source` is the canonical mechanism for built-in option lists (verified: `currencies` source in `type-config-schema.ts` line 176-178, loaded in `ConfigValueInput.svelte` line 118-121 via `getAllCurrencies()`). A new `ai_models` source will be registered in `BUILTIN_VALUES_SOURCES` and loaded via a new `getAllAiModels()` function in a FE data module (see Part 2.4). The `type_config` stays small and DRY — adding/removing a model is a FE code change, not a SQL migration of `type_config` JSON.
  - `label_key`: `'system.settings.config.auth.ai_assistant_model.label'`
  - `description_key`: `'system.settings.config.auth.ai_assistant_model.description'`
  - `reserved`: `true`
  - `group_key`: `'ai_features'` (new group)
  - `created_by`: `'system'`
- `ON CONFLICT ("key") DO NOTHING` (idempotent)
- Audit INSERT (same pattern as currency_favorites — `action='INSERT'`, `changed_by='initial-setup'`, `version=1`, full delta)
- **No patch registry hash update needed** — this is a fire-and-forget for existing databases. The init patch will also be updated (step 1.2).

### 1.2 Update init patch: `00000000000000_init_database.sql`

**File**: `D:\git\primebrick\primebrick-be-v3\db-meta\patches\00000000000000_init_database.sql`

**Change**: Add a new row to the existing `INSERT INTO auth_configurations ... VALUES` block (line 692-713). The new row goes after `currency_favorites` (line 713), changing the trailing `;` to `,` and adding:

```sql
('ai_assistant_model', 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'single_select', '{"values_source":"ai_models","value_field":"id","label_field":"label_key","validation":{"required":true,"required_error_label_key":"app.common.validation.required","rules":{}}}', 'system.settings.config.auth.ai_assistant_model.label', 'system.settings.config.auth.ai_assistant_model.description', true, 'ai_features', 'system')
```

**Note**: The patch SHA256 will change. The fire-and-forget SQL (step 1.1) updates the registry hash for existing databases. For new databases, the patch is applied fresh and the SHA256 is computed automatically by `db:migrate`.

### 1.3 New fire-and-forget translations SQL: `add_ai_assistant_model_translations.sql`

**File**: `D:\git\primebrick\primebrick-be-v3\db-meta\fire-and-forget\add_ai_assistant_model_translations.sql`

**Content**: Seeds translations for all 6 languages (en-GB, it-IT, fr-FR, es-ES, de-DE, pt-PT) for:
- `system.settings.config.auth.ai_assistant_model.label` — "AI Assistant Model"
- `system.settings.config.auth.ai_assistant_model.description` — "Select the WebLLM model used by the Smart Regex AI assistant. Runs entirely in-browser via WebGPU."
- `system.settings.config.auth.ai_assistant_model.qwen3_1.7b.label` — "Qwen3 1.7B (Lower)"
- `system.settings.config.auth.ai_assistant_model.qwen3_1.7b.description` — "Works well in many scenarios but precision is its weak point."
- `system.settings.config.auth.ai_assistant_model.qwen2.5_1.5b.label` — "Qwen2.5 1.5B (Average)"
- `system.settings.config.auth.ai_assistant_model.qwen2.5_1.5b.description` — "The perfect balance: quick, fast, precise in almost every scenario."
- `system.settings.config.auth.ai_assistant_model.qwen3_4b.label` — "Qwen3 4B (Higher)"
- `system.settings.config.auth.ai_assistant_model.qwen3_4b.description` — "Very heavy, depends on machine resource capability, but a precise model with deeper reasoning."
- `system.settings.config.auth.group.ai_features` — "AI Features" (new group header)

**Pattern**: Same as existing fire-and-forget translation files (e.g. `add_smart_regex_translations.sql`). Uses `INSERT INTO system.translations ... ON CONFLICT (key, language) WHERE deleted_at IS NULL DO NOTHING`.

---

## Part 2: Frontend — Reusable config-access composable

### 2.1 New composable: `useConfigEntries.svelte.ts`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\composables\useConfigEntries.svelte.ts`

**Purpose**: A singleton-style composable that fetches all config entries once, caches them in `$state`, and exposes per-key lookups. Multiple components calling `useConfigEntries()` share the same cached fetch.

**Design**:
- Module-level singleton state (not per-instance) — so multiple components share one fetch.
- Uses existing `fetchConfigEntries()` from `$lib/api` (which uses `apiFetch` → ETag cache → 304 handling).
- Exposes:
  - `state.entries` — `DeepReadonly<ConfigEntry[]>` (the full list)
  - `state.loading` — `boolean`
  - `state.error` — `string | null`
  - `getValue(key: string)` — returns `string | bigint | number | null | undefined` from the cached entries
  - `getEntry(key: string)` — returns `DeepReadonly<ConfigEntry> | undefined`
  - `refresh()` — re-fetches (bypasses cache by calling `fetchConfigEntries` again)
  - `invalidate()` — clears the ETag cache for the list URL and re-fetches

**Composable state exposure pattern** (per AGENTS.md):
```ts
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { fetchConfigEntries } from '$lib/api';
import type { ConfigEntry } from '$lib/api-types';
import { clearCachedETag } from '$lib/cache/fe-cache-store';

const CONFIG_ENTRIES_URL = '/api/v1/entities/config_entries/list';

// Module-level singleton — shared across all callers
let _state = $state({
  entries: [] as ConfigEntry[],
  loading: false,
  error: null as string | null,
  fetched: false,
});

let fetchPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (_state.fetched || _state.loading || fetchPromise) {
    return fetchPromise ?? Promise.resolve();
  }
  _state.loading = true;
  _state.error = null;
  fetchPromise = (async () => {
    try {
      _state.entries = await fetchConfigEntries();
      _state.fetched = true;
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to load config';
    } finally {
      _state.loading = false;
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

export function useConfigEntries() {
  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    getEntry(key: string): DeepReadonly<ConfigEntry> | undefined {
      void ensureLoaded();
      return _state.entries.find((e) => e.key === key);
    },
    getValue(key: string): string | bigint | number | null | undefined {
      void ensureLoaded();
      return _state.entries.find((e) => e.key === key)?.value;
    },
    async refresh(): Promise<void> {
      _state.fetched = false;
      _state.loading = false;
      fetchPromise = null;
      await ensureLoaded();
    },
    invalidate(): void {
      clearCachedETag(CONFIG_ENTRIES_URL);
      _state.fetched = false;
    },
    ensureLoaded,
  };
}
```

**Key design decisions**:
- `ensureLoaded()` is called on every `getValue`/`getEntry` call — it's a no-op if already loaded. This means the first call triggers the fetch, subsequent calls return immediately from cache.
- The ETag cache in `apiFetch` handles HTTP-level caching (304 → synthetic 200 from localStorage). The composable adds a session-level in-memory cache on top, so multiple components don't even hit the network.
- `invalidate()` clears the ETag cache and marks the state as stale, so the next `getValue` call re-fetches.
- `refresh()` forces a re-fetch immediately.
- The `void ensureLoaded()` inside `getValue`/`getEntry` ensures the fetch is triggered but the function returns the current (possibly empty) value immediately — the caller is expected to be reactive (`$derived` or `$effect`) so it will re-run when `_state.entries` changes.

### 2.2 Refactor `CurrencySelectPanel.svelte`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\shell\sheets\panels\CurrencySelectPanel.svelte`

**Current** (lines 53-66):
```ts
onMount(async () => {
  try {
    const entries = await fetchConfigEntries();
    const entry = entries.find((e) => e.key === 'currency_favorites');
    if (entry?.value) {
      favoriteCodes = String(entry.value).split(',').map(...).filter(...);
    }
  } catch { /* fail silently */ }
});
```

**After**:
```ts
import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';

const config = useConfigEntries();

// Reactive: updates when config entries are loaded
let favoriteCodes = $derived.by<string[]>(() => {
  const value = config.getValue('currency_favorites');
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0);
});
```

**Changes**:
- Remove `fetchConfigEntries` import.
- Remove `onMount` block that fetches config.
- Replace `favoriteCodes` from `$state` to `$derived.by` (reactive to config loading).
- Remove the `let favoriteCodes = $state<string[]>([]);` declaration.

### 2.3 Refactor `useExistingGroupKeys.svelte.ts`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\composables\useExistingGroupKeys.svelte.ts`

**Current**: Fetches all config entries via `apiFetch` directly, extracts `group_key` values.

**After**: Use `useConfigEntries` to get the cached entries, extract `group_key` values.

```ts
import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';

export function useExistingGroupKeys() {
  const config = useConfigEntries();
  void config.ensureLoaded();

  const _state = $state({ loading: true });

  // Reactive: updates when config entries are loaded
  let groupKeys = $derived.by<string[]>(() => {
    const groups = new Set<string>();
    for (const row of config.state.entries) {
      if (row.group_key && row.group_key.trim()) {
        groups.add(row.group_key.trim());
      }
    }
    return [...groups].sort();
  });

  // Loading is true until the first successful fetch
  $effect(() => {
    if (!config.state.loading && config.state.fetched) {
      _state.loading = false;
    }
  });

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get groupKeys() { return groupKeys; },
    get loading() { return _state.loading; },
  };
}
```

**Note**: This composable currently uses `onMount` which is only valid inside a component context. The refactored version uses `$derived` and `$effect` which are also component-context-only, so the usage pattern doesn't change.

### 2.4 New FE data module `ai-models` + register `values_source` + render per-option descriptions

This part has 3 coordinated changes that mirror the existing `currencies` `values_source` pattern exactly.

#### 2.4.1 New FE data module: `src/lib/ai-models/index.ts`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\ai-models\index.ts`

**Purpose**: Exports `getAllAiModels()` returning the 3 tiered WebLLM models with `id`, `label_key`, `description_key`. Mirrors `$lib/currency/index.ts` → `getAllCurrencies()`.

```ts
export interface AiModelInfo {
  /** WebLLM model ID — the exact string passed to CreateMLCEngine */
  id: string;
  /** i18n key for the model tier label (e.g. "Qwen2.5 1.5B (Average)") */
  label_key: string;
  /** i18n key for the translated hint description */
  description_key: string;
}

const AI_MODELS: AiModelInfo[] = [
  {
    id: 'Qwen3-1.7B-q4f16_1-MLC',
    label_key: 'system.settings.config.auth.ai_assistant_model.qwen3_1.7b.label',
    description_key: 'system.settings.config.auth.ai_assistant_model.qwen3_1.7b.description',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label_key: 'system.settings.config.auth.ai_assistant_model.qwen2.5_1.5b.label',
    description_key: 'system.settings.config.auth.ai_assistant_model.qwen2.5_1.5b.description',
  },
  {
    id: 'Qwen3-4B-q4f16_1-MLC',
    label_key: 'system.settings.config.auth.ai_assistant_model.qwen3_4b.label',
    description_key: 'system.settings.config.auth.ai_assistant_model.qwen3_4b.description',
  },
];

export function getAllAiModels(): AiModelInfo[] {
  return AI_MODELS;
}
```

#### 2.4.2 Register `ai_models` in `BUILTIN_VALUES_SOURCES`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\config\type-config-schema.ts`

**Current** (lines 176-178):
```ts
export const BUILTIN_VALUES_SOURCES: ValuesSourceDefinition[] = [
  { id: 'currencies', label_key: 'system.settings.config.typeConfig.valuesSource.currencies', value_field: 'code', label_field: 'name' },
];
```

**After** (add the new source):
```ts
export const BUILTIN_VALUES_SOURCES: ValuesSourceDefinition[] = [
  { id: 'currencies', label_key: 'system.settings.config.typeConfig.valuesSource.currencies', value_field: 'code', label_field: 'name' },
  { id: 'ai_models', label_key: 'system.settings.config.typeConfig.valuesSource.ai_models', value_field: 'id', label_field: 'label_key' },
];
```

#### 2.4.3 Load `ai_models` in `ConfigValueInput.svelte` + render `description_key` via `itemSnippet`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\components\config-list\ConfigValueInput.svelte`

**Change 1** — import `getAllAiModels`:
```ts
import { getAllAiModels } from '$lib/ai-models';
```

**Change 2** — add a `values_source === 'ai_models'` branch in the `$effect` (after the `currencies` branch, line 121):
```ts
$effect(() => {
  if (type !== 'single_select' && type !== 'multi_select') return;

  // 1. values_source: "currencies" → load directly from countries-list (no API)
  if (selectConfig?.values_source === 'currencies') {
    selectOptions = getAllCurrencies() as unknown as Record<string, any>[];
    return;
  }

  // 2. values_source: "ai_models" → load from FE ai-models module (no API)
  if (selectConfig?.values_source === 'ai_models') {
    selectOptions = getAllAiModels() as unknown as Record<string, any>[];
    return;
  }

  // 3. api_url → fetch from BE API (existing)
  // ...
});
```

**Change 3** — render `description_key` via `itemSnippet` in the `single_select` branch (lines 256-275):
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
      aria-invalid={ariaInvalid}
      placeholder={$t('app.common.selectValue')}
      disabled={selectLoading}
      loading={selectLoading}
      data-testid={`config-input-single-select-${fieldKey}`}
    >
      {#snippet itemSnippet({ option, resolvedLabel, selected })}
        {@const descKey = (option as Record<string, any>).description_key}
        <div class="flex flex-col gap-0.5 flex-1 min-w-0">
          <span class="truncate text-left font-medium">{resolvedLabel}</span>
          {#if descKey}
            <span class="truncate text-left text-xs text-muted-foreground">{$t(descKey)}</span>
          {/if}
        </div>
      {/snippet}
    </ComboSelect>
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
```

**Note**: The `ComboSelect` already supports `itemSnippet` (verified in `combo-select.svelte` lines 29-34, 441-447). This is backward-compatible:
- Existing `single_select` configs with `api_url`/`values_source: "currencies"` still work — the `itemSnippet` renders the label only (no `description_key` on currency/API options).
- The `itemSnippet` only shows a description line when `description_key` is present on the option.

---

## Part 3: Frontend — Dynamic model ID in Smart Regex

### 3.1 Modify `use-regex-ai.svelte.ts`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\components\ui\smart-regex-input\use-regex-ai.svelte.ts`

**Changes**:

1. **Remove** the hardcoded `MODEL_ID` constant (line 46-47).

2. **Add** `model_id` parameter to `useRegexAi()`:
   ```ts
   export function useRegexAi(
     initial_regex: string = '',
     initial_flags: string = '',
     model_id: string = '',
   ) {
   ```

3. **Use** `model_id` in `init()`:
   ```ts
   async function init(): Promise<void> {
     if (_state.is_ready || _state.is_loading_model) return;
     if (!model_id) {
       _state.error = 'No AI model configured';
       return;
     }
     // ... existing WebGPU check ...
     engine = await webllm.CreateMLCEngine(model_id, { ... });
   }
   ```

4. **Fallback**: If `model_id` is empty, set error state and don't attempt to load.

### 3.2 Modify `regex-ai-chat-panel.svelte`

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\components\ui\smart-regex-input\regex-ai-chat-panel.svelte`

**Changes**:

1. **Import** `useConfigEntries`:
   ```ts
   import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';
   ```

2. **Get** the model ID from config:
   ```ts
   const config = useConfigEntries();
   let modelId = $derived.by<string>(() => {
     const value = config.getValue('ai_assistant_model');
     return value ? String(value) : '';
   });
   ```

3. **Pass** `modelId` to `useRegexAi`:
   ```ts
   const ai = useRegexAi(current_regex, current_flags, modelId);
   ```

4. **Delay** `init()` until model ID is available:
   ```ts
   onMount(() => {
     // Trigger config load
     void config.ensureLoaded();
     return () => {
       void ai.dispose();
     };
   });

   // Init the AI engine once the model ID is available
   $effect(() => {
     if (modelId && !ai.state.is_ready && !ai.state.is_loading_model && !ai.state.error) {
       void ai.init();
     }
   });
   ```

   **Note**: The `$effect` replaces the direct `ai.init()` call in `onMount`. This ensures the model ID is loaded from config before attempting to initialize WebLLM. The `$effect` will re-run when `modelId` changes (e.g. after config loads).

### 3.3 Update `SmartRegexInput.svelte` (if needed)

**File**: `D:\git\primebrick\primebrick-fe-v3\src\lib\components\ui\smart-regex-input\smart-regex-input.svelte`

**No changes needed** — the sheet already passes `current_regex`, `current_flags`, and `on_apply_regex` to the panel. The model ID is fetched inside the panel via the composable.

### 3.4 Update AGENTS.md Smart Components table

**File**: `D:\git\primebrick\primebrick-fe-v3\AGENTS.md`

**Current** (line ~189):
```
| `SmartRegexInput` | Regex pattern input with AI assistant | WebLLM (WebGPU) | Qwen3-0.6B q4f16 |
```

**After**:
```
| `SmartRegexInput` | Regex pattern input with AI assistant | WebLLM (WebGPU) | Config-driven (`ai_assistant_model` config row, default: Qwen2.5-1.5B-Instruct q4f16) |
```

---

## Part 4: Config cache invalidation after writes

### 4.1 Invalidate cache after config writes

**File**: `D:\git\primebrick\primebrick-fe-v3\src\routes\(app)\system\settings\security\+page.svelte`

**Current**: After `updateConfigEntry` / `createConfigEntry` / `deleteConfigEntry`, the page re-fetches the full list via `loadEntries()`.

**After**: Also invalidate the composable cache so other components (like the Smart Regex panel) pick up the new value:

```ts
import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';

const config = useConfigEntries();

async function handleSave(entry: ConfigEntry, value: string) {
  await updateConfigEntry(entry.uuid, { value }, entry.version);
  config.invalidate(); // Clear ETag + mark stale
  await loadEntries();  // Existing re-fetch
}
```

**Note**: `config.invalidate()` clears the ETag cache and marks the in-memory cache as stale. The next `getValue()` call will re-fetch. This ensures that if the user changes the model in settings and then opens the Smart Regex panel, the new model is used.

---

## Impact summary

### Backend files (3 new, 1 modified)

| File | Action |
|------|--------|
| `db-meta/fire-and-forget/seed_ai_assistant_model.sql` | **New** — seed config row + audit |
| `db-meta/fire-and-forget/add_ai_assistant_model_translations.sql` | **New** — seed translations (6 languages) |
| `db-meta/patches/00000000000000_init_database.sql` | **Modified** — add row to seed block |
| `db-meta/fire-and-forget/update_init_patch_sha256_ai_model.sql` | **New** — update patch registry hash |

### Frontend files (2 new, 5 modified)

| File | Action |
|------|--------|
| `src/lib/composables/useConfigEntries.svelte.ts` | **New** — reusable cached config composable |
| `src/lib/ai-models/index.ts` | **New** — FE data module exporting `getAllAiModels()` (mirrors `$lib/currency`) |
| `src/lib/shell/sheets/panels/CurrencySelectPanel.svelte` | **Modified** — use composable instead of inline fetch |
| `src/lib/composables/useExistingGroupKeys.svelte.ts` | **Modified** — use composable instead of inline fetch |
| `src/lib/config/type-config-schema.ts` | **Modified** — register `ai_models` in `BUILTIN_VALUES_SOURCES` |
| `src/lib/components/config-list/ConfigValueInput.svelte` | **Modified** — load `ai_models` source + render `description_key` hint via `itemSnippet` |
| `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` | **Modified** — accept `model_id` param, remove hardcoded `MODEL_ID` |
| `src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` | **Modified** — fetch model ID from config, pass to composable |
| `src/routes/(app)/system/settings/security/+page.svelte` | **Modified** — invalidate config cache after writes |
| `AGENTS.md` | **Modified** — update Smart Components table |

---

## Verification

1. **BE**: Run the fire-and-forget SQL against the dev database. Verify the `ai_assistant_model` row exists in `auth_configurations` with `reserved=true`, `type='single_select'`, and `type_config` containing `{"values_source":"ai_models","value_field":"id","label_field":"label_key",...}`.
2. **BE**: Verify translations are seeded for all 6 languages — each model has both a `.label` and `.description` key.
3. **FE**: Run `pnpm run check` — no type errors.
4. **FE**: Open the Security settings page — the new `ai_assistant_model` row should appear in the `ai_features` group with a searchable `single_select` dropdown showing 3 model options. Each option in the dropdown should show the tier label (e.g. "Qwen2.5 1.5B (Average)") and below it the translated hint description.
5. **FE**: The default selected value should be `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (Average).
6. **FE**: Open the Smart Regex panel — it should load `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (the configured model) instead of the old hardcoded `Qwen3-1.7B`.
7. **FE**: Change the model in settings to e.g. "Qwen3 4B (Higher)", close and reopen the Smart Regex panel — the new model should be used.
8. **FE**: Verify `CurrencySelectPanel` still shows favorite currencies correctly (no regression from the refactor).
9. **FE**: Verify the config create page still shows existing group keys (no regression from `useExistingGroupKeys` refactor).
10. **FE**: Verify existing `single_select`/`multi_select` configs with `api_url`/`values_source: "currencies"` still render correctly — the new `ai_models` branch and `itemSnippet` are backward-compatible.

---

## Open questions

1. **Translation values**: I can write English translations. For the other 5 languages (it-IT, fr-FR, es-ES, de-DE, pt-PT), should I use English as placeholder or attempt translations? The BE convention is that all translations are BE-owned and seeded via SQL. I'll write English for all and let the user review/translate.

2. **Init patch SHA256**: The fire-and-forget SQL needs the new SHA256 of the modified init patch. This must be computed after the edit. I'll compute it with `sha256sum` or PowerShell `Get-FileHash` after making the change.

3. **`single_select` with `values_source`**: The canonical mechanism for built-in option lists is `values_source` (verified: `currencies` source in `type-config-schema.ts` lines 176-178, loaded in `ConfigValueInput.svelte` lines 118-121 via `getAllCurrencies()`). The plan registers a new `ai_models` source and a new FE data module `$lib/ai-models/index.ts` exporting `getAllAiModels()` — exactly mirroring the `currencies` pattern. The `type_config` JSON stays small and DRY; the model list lives in FE code, not duplicated in the DB.
