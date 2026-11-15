# Plan: AI Model Power Level Indicator (1-5 Bars)

## Objective

Replace the textual tier label `(Lower)` / `(Average)` / `(Higher)` in the AI model dropdown with a visual 5-bar vertical power indicator. The power level (1-5) comes from the BE via the `type_config` JSON of the `ai_assistant_model` config row — not hardcoded in the FE.

## Visual Design

5 vertical bars, left to right, each with a fixed color:

| Bar | Color      | Tailwind class        |
|-----|------------|-----------------------|
| 1   | Red        | `bg-red-500`          |
| 2   | Orange     | `bg-orange-500`       |
| 3   | Yellow     | `bg-yellow-500`       |
| 4   | Lime       | `bg-lime-500`         |
| 5   | Green      | `bg-green-500`        |

Bars up to the model's `power_level` are filled (full opacity). Bars beyond the level are empty (`bg-muted` or ~20% opacity of the bar's color).

Example: power_level=3 → bars 1-3 filled (red, orange, yellow), bars 4-5 dimmed.

The indicator appears on the right side of each dropdown item, next to the check mark.

## Architecture

### Current data flow

```
BE: auth_configurations row (key=ai_assistant_model, type_config JSON)
  → FE: useConfigEntries composable → getEntry('ai_assistant_model')
  → FE: type_config.values_source = "ai_models"
  → FE: ai-models/index.ts → getAllAiModels() → [id, name, label_key, description_key]
```

The model list (id, name, label_key, description_key) is FE-only. The BE stores only the selected value and translations. The `type_config` JSON currently has:

```json
{
  "values_source": "ai_models",
  "value_field": "id",
  "label_field": "label_key",
  "validation": { "required": true, ... }
}
```

### Proposed change

Add a `model_levels` map to the `type_config` JSON:

```json
{
  "values_source": "ai_models",
  "value_field": "id",
  "label_field": "label_key",
  "model_levels": {
    "Qwen3-1.7B-q4f16_1-MLC": 2,
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": 3,
    "Qwen3-4B-q4f16_1-MLC": 4
  },
  "validation": { "required": true, ... }
}
```

The FE reads `model_levels` from the config entry's `type_config` and maps each model ID to its power level (1-5).

## Impacted Files

### BE (fire-and-forget SQL patch)

1. **`primebrick-be-v3/db-meta/fire-and-forget/add_model_levels_to_ai_assistant_model.sql`** (NEW)
   - `UPDATE auth_configurations SET type_config = '...' WHERE key = 'ai_assistant_model'`
   - Add `model_levels` map to the existing `type_config` JSON
   - Idempotent (only updates if `model_levels` not already present)
   - Must preserve `reserved: true` — only `type_config` is updated (the row is reserved, but `type_config` updates on reserved rows are allowed per the business rules)

2. **`primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql`** (UPDATE)
   - Update the seeded `type_config` JSON to include `model_levels`
   - Recompute SHA256 of the init patch

3. **`primebrick-be-v3/db-meta/fire-and-forget/update_init_patch_sha256_model_levels.sql`** (NEW)
   - Update the `schema_patches` table with the new SHA256

### FE

4. **`primebrick-fe-v3/src/lib/ai-models/index.ts`** (UPDATE)
   - Add `power_level: number` to `AiModelInfo` interface (optional, defaults from BE)
   - No hardcoded values — the level comes from BE `type_config`
   - Add a helper: `getModelPowerLevel(model_id, type_config): number | null` that parses `type_config` JSON and extracts the level for a given model ID

5. **`primebrick-fe-v3/src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte`** (UPDATE)
   - Read `type_config` from the config entry (already available via `config.getEntry('ai_assistant_model')`)
   - Parse `model_levels` from `type_config` JSON
   - In the model dropdown items, render the 5-bar indicator on the right side
   - Create a small inline `PowerLevelBars` snippet or component

6. **`primebrick-fe-v3/src/lib/components/ui/smart-regex-input/PowerLevelBars.svelte`** (NEW)
   - Small presentational component
   - Props: `level: number` (1-5)
   - Renders 5 vertical bars with fixed colors
   - Bars ≤ level are full opacity, bars > level are dimmed
   - Size: ~3px wide × ~12px tall per bar, gap-0.5

### FE (optional — ConfigValueInput)

7. **`primebrick-fe-v3/src/lib/components/config-list/ConfigValueInput.svelte`** (UPDATE — optional)
   - When `values_source === 'ai_models'`, show the power bars in the settings dropdown too
   - This is the admin settings page where the model is configured
   - Keeps the UX consistent between the Smart Regex panel and the settings page

## Detailed Steps

### Step 1: BE — Create fire-and-forget SQL patch

File: `db-meta/fire-and-forget/add_model_levels_to_ai_assistant_model.sql`

```sql
BEGIN;

UPDATE auth_configurations
SET type_config = jsonb_set(
  type_config::jsonb,
  '{model_levels}',
  '{
    "Qwen3-1.7B-q4f16_1-MLC": 2,
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": 3,
    "Qwen3-4B-q4f16_1-MLC": 4
  }'::jsonb
)::text,
  updated_at = now(),
  updated_by = 'system',
  version = version + 1
WHERE key = 'ai_assistant_model'
  AND NOT (type_config::jsonb ? 'model_levels');

-- Audit entry
INSERT INTO public.auth_configurations_audit (entity_id, entity_uuid, action, changed_at, changed_by, version, delta)
SELECT id, uuid, 'UPDATE', now(), 'system', version,
  jsonb_build_object(
    'type_config', jsonb_build_object(
      'old', type_config,
      'new', jsonb_set(type_config::jsonb, '{model_levels}', '{"Qwen3-1.7B-q4f16_1-MLC":2,"Qwen2.5-1.5B-Instruct-q4f16_1-MLC":3,"Qwen3-4B-q4f16_1-MLC":4}'::jsonb)::text
    )
  )
FROM auth_configurations
WHERE key = 'ai_assistant_model';

COMMIT;
```

### Step 2: BE — Update init patch + SHA256

Update the `type_config` JSON in the init patch seed, recompute SHA256, create fire-and-forget patch.

### Step 3: BE — Apply patches to dev DB + flush Redis

Run the SQL patches, flush Redis translation cache.

### Step 4: FE — Update `ai-models/index.ts`

Add a helper function to parse `model_levels` from `type_config`:

```ts
/** Parse model_levels from the ai_assistant_model type_config JSON. */
export function getModelPowerLevels(type_config: string | null | undefined): Record<string, number> {
  if (!type_config) return {};
  try {
    const parsed = JSON.parse(type_config);
    return parsed?.model_levels ?? {};
  } catch {
    return {};
  }
}
```

### Step 5: FE — Create `PowerLevelBars.svelte`

```svelte
<script lang="ts">
  let { level }: { level: number } = $props();
  const BAR_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];
</script>

<div class="flex items-end gap-0.5" data-testid="power-level-bars">
  {#each BAR_COLORS as color, i (i)}
    <div
      class="w-[3px] h-3 rounded-sm transition-opacity {color} {i < level ? 'opacity-100' : 'opacity-20'}"
    ></div>
  {/each}
</div>
```

### Step 6: FE — Update `regex-ai-chat-panel.svelte`

- Parse `model_levels` from the config entry's `type_config`
- In the model dropdown items, add `<PowerLevelBars>` on the right side
- Remove the text-based tier label (already removed from the top ready state)

### Step 7: FE — Type check + Playwright verification

- `pnpm run check`
- Open Smart Regex panel
- Open model dropdown
- Verify 5-bar indicators appear for each model
- Verify bars match the expected levels (2, 3, 4)
- Verify colors: red, orange, yellow, lime, green
- Verify dimmed bars for levels beyond the model's power

## Acceptance Criteria

1. ✅ `type_config` JSON of `ai_assistant_model` contains `model_levels` map
2. ✅ FE reads levels from `type_config`, not hardcoded
3. ✅ Model dropdown shows 5 vertical bars per model
4. ✅ Bars 1-N are filled (N = model's power level), bars N+1 to 5 are dimmed
5. ✅ Bar colors: red → orange → yellow → lime → green (left to right)
6. ✅ `pnpm run check` passes with 0 errors
7. ✅ Playwright confirms the visual indicator in the dropdown
8. ✅ No console errors
