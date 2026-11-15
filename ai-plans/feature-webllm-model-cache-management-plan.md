# Plan: WebLLM Model Cache Management

## Objective

Provide user-facing control over WebLLM model cache: visibility (which models are cached, how much space they use), and cleanup (delete individual models or all models from cache).

## Current State

### Two cache layers, no cleanup

1. **IndexedDB** (WebLLM internal) — parsed model weights. WebLLM provides:
   - `hasModelInCache(modelId)` — check if cached
   - `deleteModelInCache(modelId)` — delete model weights
   - `deleteModelAllInfoInCache(modelId)` — delete model + tokenizer + WASM
   - `deleteChatConfigInCache(modelId)` — delete chat config
   - `deleteModelWasmInCache(modelId)` — delete WASM only

2. **Cache API** (Service Worker `static/sw-regex-ai.js`) — raw HTTP responses from huggingface.co in cache name `webllm-models-v1`. The SW does cache-first strategy. No cleanup logic exists beyond old-version eviction on activate.

### Problems

- Models accumulate permanently (3 models ≈ 1-4 GB)
- No UI to see what's cached
- No way to delete cached models without clearing all browser data
- `sw-manager.ts` has a hardcoded `MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'` which is stale (not in the current model list)
- The SW pre-downloads only one hardcoded model, not the configured one
- No storage quota estimation shown to the user

## Decisions (from user)

1. **UI**: Both — popover in AI panel for quick check + settings page section for full management.
2. **Storage detail**: Both — per-model byte sizes + global total (used / quota).
3. **VRAM warning**: Warn + block. If the model is currently loaded in VRAM ("in use"), block deletion and show a message telling the user to switch to a different model first. A model that is "in use" cannot be deleted.
4. **Auto-delete**: Keep last 3 (MRU). When switching models, if more than 3 models are cached, auto-delete the oldest ones beyond 3.
5. **SW pre-download**: Remove entirely. The SW stays only for cache-first HTTP interception (speeds up re-downloads). Models download on-demand when the user opens the AI panel.

## Architecture

### New composable: `useModelCache.svelte.ts`

Location: `src/lib/ai/use-model-cache.svelte.ts`

Responsibilities:
- Check which models are cached (IndexedDB via `hasModelInCache`)
- Estimate per-model size from Cache API response sizes
- Estimate global storage usage via `navigator.storage.estimate()`
- Delete a single model from cache (`deleteModelAllInfoInCache` + Cache API cleanup)
- Block deletion if the model is currently loaded in VRAM (passed as parameter)
- Delete all models from cache (except the one in use)
- Track MRU (most-recently-used) order for auto-eviction
- Auto-evict oldest models beyond 3 when a new model is loaded

API:
```ts
export function useModelCache() {
  const _state = $state({
    cache_status: {} as Record<string, boolean>,    // model_id → is_cached
    model_sizes: {} as Record<string, number>,       // model_id → bytes (from Cache API)
    storage_usage: null as number | null,            // bytes used (global, from navigator.storage.estimate)
    storage_quota: null as number | null,            // bytes total quota
    mru_order: [] as string[],                        // model_ids ordered by last use (most recent first)
    is_checking: false,
    is_deleting: false,
    error: null as string | null,
  });

  /** Refresh cache status for the given model IDs. Also computes per-model sizes and global storage estimate. */
  async function refreshCacheStatus(model_ids: string[]): Promise<void>;

  /** Delete a single model from cache. Blocks if the model is currently in use (active_model_id). */
  async function deleteModel(model_id: string, active_model_id: string | null): Promise<void>;

  /** Delete all cached models except the one currently in use. */
  async function deleteAllModels(active_model_id: string | null): Promise<void>;

  /** Record that a model was just used (called on model load/switch). Triggers auto-eviction if > 3 cached. */
  async function recordModelUse(model_id: string): Promise<void>;

  return {
    get state(): DeepReadonly<typeof _state>,
    refreshCacheStatus,
    deleteModel,
    deleteAllModels,
    recordModelUse,
  };
}
```

### MRU tracking

The composable maintains an MRU list in `_state.mru_order`. On every model load/switch, `recordModelUse(model_id)` is called:
1. Remove the model_id from the list if present.
2. Prepend it (most recent first).
3. If the list has more than 3 cached models, auto-delete the oldest ones (from the end of the list).

The MRU list is persisted in `localStorage` (`primebrick:ai-model-mru`) so it survives page reloads.

### Per-model size estimation

The composable opens `caches.open('webllm-models-v1')`, iterates `cache.keys()`, groups entries by model ID (matching the URL path), and sums the response sizes (`response.blob().size` or `response.headers.get('content-length')`).

This is an approximation — the Cache API stores HTTP responses, and the model ID appears in the huggingface.co URL path. The IndexedDB size is not directly measurable per-model, so we use the Cache API size as a proxy.

### Cache API cleanup

The composable directly uses `caches.open('webllm-models-v1')` from the main thread — no SW changes needed. It iterates `cache.keys()` and deletes entries whose URL contains the model ID.

### VRAM protection

`deleteModel(model_id, active_model_id)` checks if `model_id === active_model_id`. If so, it sets `_state.error` to a "model in use" message and does NOT delete. The UI shows the error and instructs the user to switch to a different model first.

`deleteAllModels(active_model_id)` skips the active model and deletes all others.

### UI: Two locations

#### 1. Popover in AI panel

A small `HardDriveDownload` (or `DatabaseZap`) Lucide icon button next to the model dropdown trigger in `regex-ai-chat-panel.svelte`. Clicking it opens a `Popover` showing:
- Title: "Model cache"
- For each model:
  - Name + Qwen icon
  - Cached / Not cached badge
  - Size (if cached, e.g. "1.2 GB")
  - Delete button (disabled if model is currently in use, with tooltip "Switch to another model first")
- Global storage bar (used / quota)
- "Delete all" button (skips the active model)
- Refresh button

#### 2. Settings page section

A new collapsible section in the Security/Config settings page (`+page.svelte`), under the `ai_features` group. Shows the same information as the popover but in a wider, more detailed layout. Uses the same `useModelCache` composable.

### Fix stale SW manager

`sw-manager.ts` changes:
- Remove hardcoded `MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'`
- Remove `getModelId()` function
- Make `isModelCached(model_id: string)` accept a parameter
- Remove any pre-download logic that references the stale model
- Keep `registerRegexAiSw()` — the SW registration is still useful for cache-first HTTP interception

## Impacted Files

### New files

1. **`src/lib/ai/use-model-cache.svelte.ts`** — composable for cache status + deletion + MRU
2. **`src/lib/components/ui/smart-regex-input/ModelCachePanel.svelte`** — popover UI for cache management (used in AI panel)
3. **`src/lib/components/ui/smart-regex-input/ModelCacheSection.svelte`** — full-width section UI for cache management (used in settings page)

### Modified files

4. **`src/lib/ai/sw-manager.ts`** — remove hardcoded MODEL_ID, make `isModelCached` accept a model_id parameter, remove `getModelId`, remove pre-download logic
5. **`src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte`** — add cache management trigger (icon button) + popover
6. **`src/routes/(app)/system/settings/security/+page.svelte`** — add cache management section under ai_features group
7. **`src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`** — call `recordModelUse` after model load/switch

### Translations (BE-owned)

8. New translation keys for the cache panel:
   - `app.smart.regex.ai.cache.title` — "Model cache" / "Cache modelli"
   - `app.smart.regex.ai.cache.cached` — "Cached" / "In cache"
   - `app.smart.regex.ai.cache.not_cached` — "Not cached" / "Non in cache"
   - `app.smart.regex.ai.cache.size` — "Size" / "Dimensione"
   - `app.smart.regex.ai.cache.delete` — "Delete" / "Elimina"
   - `app.smart.regex.ai.cache.delete_all` — "Delete all" / "Elimina tutti"
   - `app.smart.regex.ai.cache.storage_used` — "Storage used: {used} of {quota}" / "Spazio utilizzato: {used} di {quota}"
   - `app.smart.regex.ai.cache.confirm_delete` — "Delete this model from cache?" / "Eliminare questo modello dalla cache?"
   - `app.smart.regex.ai.cache.confirm_delete_all` — "Delete all cached models? The active model will be kept." / "Eliminare tutti i modelli dalla cache? Il modello attivo verrà mantenuto."
   - `app.smart.regex.ai.cache.in_use` — "This model is in use. Switch to another model before deleting it." / "Questo modello è in uso. Passa a un altro modello prima di eliminarlo."
   - `app.smart.regex.ai.cache.deleted` — "Model deleted from cache" / "Modello eliminato dalla cache"
   - `app.smart.regex.ai.cache.deleted_all` — "All models deleted from cache (except active)" / "Tutti i modelli eliminati dalla cache (tranne quello attivo)"
   - `app.smart.regex.ai.cache.refresh` — "Refresh" / "Aggiorna"

### BE fire-and-forget SQL

9. **`primebrick-be-v3/db-meta/fire-and-forget/add_model_cache_translations.sql`** — seed the translation keys for all supported languages (en-GB, it-IT, fr-FR, es-ES, de-DE, pt-PT, en-US)

### FE fallback translations

10. **`src/lib/i18n/messages/en-GB-fallback.json`** — add English-only fallbacks for `app.smart.regex.ai.cache.*` keys

## Detailed Steps

### Step 1: Fix stale SW manager

File: `src/lib/ai/sw-manager.ts`

- Remove hardcoded `MODEL_ID`
- Make `isModelCached(model_id: string)` accept a parameter
- Remove `getModelId()` (no longer needed)
- Remove any pre-download logic referencing the stale model
- Keep `registerRegexAiSw()` for SW registration (cache-first HTTP interception)

### Step 2: Create `useModelCache` composable

File: `src/lib/ai/use-model-cache.svelte.ts`

Full implementation with:
- `refreshCacheStatus(model_ids)` — checks IndexedDB + Cache API sizes + navigator.storage.estimate
- `deleteModel(model_id, active_model_id)` — blocks if in use, otherwise deletes from IndexedDB + Cache API
- `deleteAllModels(active_model_id)` — deletes all except active
- `recordModelUse(model_id)` — updates MRU list in localStorage, auto-evicts if > 3 cached
- Per-model size estimation from Cache API response content-length headers

### Step 3: Create `ModelCachePanel.svelte` (popover)

File: `src/lib/components/ui/smart-regex-input/ModelCachePanel.svelte`

Compact popover UI:
- List of models with cached status, size, delete button
- Delete button disabled + tooltip when model is in use
- Global storage bar
- Delete all + refresh buttons

### Step 4: Create `ModelCacheSection.svelte` (settings page)

File: `src/lib/components/ui/smart-regex-input/ModelCacheSection.svelte`

Wider, more detailed layout for the settings page. Same data, more room for per-model details.

### Step 5: Add cache trigger to `regex-ai-chat-panel.svelte`

Add a `HardDriveDownload` icon button next to the model dropdown trigger. Clicking it opens the `ModelCachePanel` as a popover.

### Step 6: Add cache section to settings page

Add `ModelCacheSection` to the Security settings page, under the `ai_features` group.

### Step 7: Wire `recordModelUse` into `use-regex-ai.svelte.ts`

After model load (in `init()`) and after model switch (in `switchModel()`), call `recordModelUse(model_id)` from the cache composable.

### Step 8: BE translations

Create fire-and-forget SQL patch:
`primebrick-be-v3/db-meta/fire-and-forget/add_model_cache_translations.sql`

Seed all translation keys for all supported languages.

### Step 9: FE fallback translations

Add English-only fallbacks to `src/lib/i18n/messages/en-GB-fallback.json`.

### Step 10: Verify

- `pnpm run check`
- Playwright: open AI panel → click cache icon → verify popover shows
- Verify cached models show as "Cached" with size
- Verify delete button works for non-active models
- Verify delete button is disabled for active model with tooltip
- Verify storage estimate displays
- Verify "Delete all" clears everything except active
- Verify settings page section shows same data
- Verify MRU auto-eviction: load 4th model → oldest gets auto-deleted

## Acceptance Criteria

1. ✅ User can see which models are cached in the browser (popover + settings page)
2. ✅ User can see per-model byte sizes + global storage usage (used / quota)
3. ✅ User can delete a single model from cache (IndexedDB + Cache API)
4. ✅ Deletion is blocked for the active model with a clear message to switch first
5. ✅ User can delete all models from cache (except the active one)
6. ✅ Cache status refreshes after deletion
7. ✅ MRU auto-eviction keeps max 3 cached models
8. ✅ Stale hardcoded MODEL_ID in sw-manager.ts is removed
9. ✅ SW pre-download is removed (SW stays for cache-first HTTP only)
10. ✅ Translations exist for all cache panel text (BE + FE fallback)
11. ✅ `pnpm run check` passes with 0 errors
12. ✅ Playwright confirms the cache panel works in both locations
