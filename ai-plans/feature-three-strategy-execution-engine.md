# Plan: Three-Strategy Execution Engine for Smart Regex AI

> **Date**: 2026-09-14
> **Status**: Awaiting approval
> **Scope**: FE (worker + composable) + BE (entity + migration)
> **Predecessor**: `feature-transformersjs-kv-cache-context-management.md` (partially implemented)

---

## Problem

The current Smart Regex AI worker uses a single execution path (`pipeline()` + `past_key_values`) that crashes on Qwen2.5 ONNX models with:

```
Expand node: left operand cannot broadcast on dim 3
LeftShape: {1,1,52,52}, RightShape: {1,1,52,666}
```

### Empirical evidence (from web research + browser testing)

| Model | Architecture | `pipeline()` + `past_key_values` | `model.generate()` + `past_key_values` | `Qwen3_5ForConditionalGeneration` + `AutoProcessor` |
|-------|-------------|:---:|:---:|:---:|
| `Qwen2.5-Coder-0.5B` | `Qwen2ForCausalLM` (ONNX) | ❌ crash | ❌ crash | N/A |
| `Qwen2.5-1.5B` | `Qwen2ForCausalLM` (ONNX) | ❌ (same Expand bug) | ❌ (same) | N/A |
| `Qwen3.5-0.8B-ONNX` | `Qwen3_5ForConditionalGeneration` (VLM) | ❌ (not text-generation) | ✅ works (PR #1557) | ✅ works (demo) |
| `LFM2.5-350M-ONNX` | text-generation | ✅ works (PR #1638) | untested | N/A |
| `gemma4` | text-generation | ✅ works (PR #1638) | untested | N/A |

**Sources:**
- PR #1638: `pipeline()` + `past_key_values` works with LFM2.5-350M and gemma4
- PR #1557: KV cache added specifically for Qwen-VL models (Qwen3.5)
- Issue #58: Same Expand error reported with various models, no solution
- Qwen3.5-WebGPU demo: Uses `Qwen3_5ForConditionalGeneration` + `AutoProcessor` + `model.generate()` with `return_dict_in_generate: true`

### Root cause

The Qwen2.5 ONNX export's attention mask subgraph (`/model/attn_mask_reformat/input_ids_subgraph/Expand`) cannot broadcast a causal mask of shape `(1,1,M,M)` to `(1,1,M,N)` when `M > 1` and `M ≠ N`. This makes multi-token prefill with KV cache impossible for Qwen2.5 ONNX models, regardless of how we pass the inputs.

---

## Solution: Three-Strategy Execution Engine

The worker implements three execution strategies, routed per-model based on `execution_config` from the BE `ai_models` table.

### Strategy 1: `model_generate_kv_cache` (DEFAULT)

**For models that support KV cache reuse via `model.generate()` directly.**

- Uses `AutoModelForCausalLM.from_pretrained()` + `tokenizer` (NOT `pipeline()`)
- Tokenizes the full prompt, slices `input_ids` to only new tokens (delta from cached prefix)
- Builds `attention_mask` matching the sliced `input_ids` length
- Passes `past_key_values` + `return_dict_in_generate: true` to `model.generate()`
- Extracts `past_key_values` from the return dict for the next turn
- Stores RAW assistant content (matches what the model generated) for prefix matching
- NO sliding window needed (KV cache keeps context bounded)
- NO intent detection needed (each turn is incremental)

**Worker flow:**
```typescript
// Load: AutoModelForCausalLM + tokenizer (NOT pipeline)
model = await AutoModelForCausalLM.from_pretrained(repo_id, { dtype, device });
tokenizer = await AutoTokenizer.from_pretrained(repo_id);

// Generate turn 1 (full prefill):
const inputs = tokenizer(prompt, { add_special_tokens: false });
const result = await model.generate({
  ...inputs,
  max_new_tokens,
  return_dict_in_generate: true,
  streamer,
});
past_key_values = result.past_key_values;

// Generate turn 2+ (KV cache reuse):
const fullTokens = tokenizer(prompt, { add_special_tokens: false });
const newTokens = fullTokens.input_ids.slice(null, [past_key_values.get_seq_length(), null]);
const newAttentionMask = new Tensor('int64', new BigInt64Array(newTokenCount).fill(1n), [1, newTokenCount]);
const result = await model.generate({
  inputs: newTokens,
  attention_mask: newAttentionMask,
  past_key_values,
  return_dict_in_generate: true,
  streamer,
});
past_key_values = result.past_key_values;
```

### Strategy 2: `pipeline_full_prefill` (FALLBACK)

**For models where KV cache reuse crashes (Qwen2.5 ONNX).**

- Uses `pipeline('text-generation', ...)` (current approach, but WITHOUT `past_key_values`)
- Full prefill every turn (no KV cache reuse)
- Sliding window: `MAX_HISTORY_TURNS = 6` (12 messages max)
- Intent detection: modify vs new regex (inject `Current regex:` only for modify)
- Stores RAW assistant content (for consistency, even though cache isn't reused)
- Invalidates cache on sliding window drop

**Worker flow:**
```typescript
// Load: pipeline (current approach)
pipeline_generator = await pipeline('text-generation', repo_id, { dtype, device });

// Generate (every turn, full prefill, no cache):
const generation_kwargs = {
  max_new_tokens,
  do_sample,
  temperature,
  top_p,
  repetition_penalty,
  eos_token_id,
  stopping_criteria,
  streamer,
  // NO past_key_values — full prefill every turn
};
await pipeline_generator(prompt, generation_kwargs);
```

**Composable flow (already implemented):**
- `MAX_HISTORY_TURNS = 6`
- `detectIntent()` — classify modify vs new regex
- Intent-aware `Current regex:` injection
- Sliding window with `invalidate_cache` message
- RAW assistant content storage

### Strategy 3: `qwen3_5_vlm` (VERTICAL)

**For Qwen3.5 models (VLM architecture).**

- Uses `Qwen3_5ForConditionalGeneration.from_pretrained()` + `AutoProcessor.from_pretrained()`
- Uses `model.generate()` with `return_dict_in_generate: true` (inherited from PreTrainedModel)
- Maintains `promptHistory` (raw prompt text with special tokens)
- Turn 1: full encode via `processor(prompt)`
- Turn 2+: `processor(promptHistory + "\n" + userPrompt)` + `past_key_values`
- Extracts `past_key_values` from return dict
- Updates `promptHistory` via `processor.batch_decode(result.sequences, { skip_special_tokens: false })`
- KV cache reuse works (PR #1557 confirmed)
- NO sliding window needed (KV cache keeps context bounded)
- Stores RAW assistant content

**Worker flow (mirrors Qwen3.5-WebGPU demo):**
```typescript
// Load: Qwen3_5ForConditionalGeneration + AutoProcessor
processor = await AutoProcessor.from_pretrained(repo_id);
model = await Qwen3_5ForConditionalGeneration.from_pretrained(repo_id, { dtype, device });

// Generate turn 1 (full encode):
const inputs = await processor(userPrompt);
const result = await model.generate({
  ...inputs,
  max_new_tokens,
  return_dict_in_generate: true,
  streamer,
});
past_key_values = result.past_key_values;
prompt_history = processor.batch_decode(result.sequences, { skip_special_tokens: false })[0];

// Generate turn 2+ (KV cache reuse):
const continuationPrompt = prompt_history + "\n" + userPrompt;
const inputs = await processor(continuationPrompt);
const result = await model.generate({
  ...inputs,
  past_key_values,
  return_dict_in_generate: true,
  streamer,
});
past_key_values = result.past_key_values;
prompt_history = processor.batch_decode(result.sequences, { skip_special_tokens: false })[0];
```

---

## DB changes

### New column: `execution_config` (JSONB)

Add to `ai_models` table:

```sql
ALTER TABLE "public"."ai_models"
  ADD COLUMN IF NOT EXISTS "execution_config" jsonb;
```

**JSONB shape:**
```json
{
  "strategy": "model_generate_kv_cache" | "pipeline_full_prefill" | "qwen3_5_vlm",
  "kv_cache_reuse": true | false,
  "sliding_window": true | false,
  "max_history_turns": 6,
  "intent_detection": true | false
}
```

**Values set EMPIRICALLY by the harness (not hardcoded):**

| Model | `strategy` (to test) | `kv_cache_reuse` | `sliding_window` | `intent_detection` |
|-------|-----------|:---:|:---:|:---:|
| Qwen2.5-* (text-only) | test 1, then 2 | TBD empirically | TBD empirically | TBD empirically |
| Qwen3.5-* (VLM) | test 1, then 2, then 3 | TBD empirically | TBD empirically | TBD empirically |
| LFM2.5-* | test 1, then 2 | TBD empirically | TBD empirically | TBD empirically |
| gemma4-* | test 1, then 2 | TBD empirically | TBD empirically | TBD empirically |
| Phi-* | test 1, then 2 | TBD empirically | TBD empirically | TBD empirically |

Until the harness runs, `execution_config` is NULL and the FE defaults to `pipeline_full_prefill` (safe).

### Extend `test_scores` JSONB

The existing `test_scores` JSONB field is extended to store per-strategy test results:

```json
{
  "regex_test_score": {
    "runs": [5, 4, 5],
    "score": 4.6,
    "method": "mean",
    "updated_at": "2026-09-14T..."
  },
  "execution_strategy_tests": {
    "model_generate_kv_cache": {
      "tested_at": "2026-09-14T...",
      "turns": 5,
      "kv_cache_hit_ratio_avg": 0.92,
      "generation_time_ms_avg": 1200,
      "tokens_generated_avg": 15,
      "correct_results": 4,
      "total_results": 5,
      "passes": true
    },
    "pipeline_full_prefill": {
      "tested_at": "2026-09-14T...",
      "turns": 5,
      "kv_cache_hit_ratio_avg": 0.0,
      "generation_time_ms_avg": 1800,
      "tokens_generated_avg": 18,
      "correct_results": 5,
      "total_results": 5,
      "passes": true
    }
  }
}
```

---

## FE changes

### Worker (`regex-ai-worker.ts`)

**New imports:**
```typescript
import {
  env,
  TextStreamer,
  InterruptableStoppingCriteria,
  pipeline,
  DynamicCache,
  Tensor,
  AutoModelForCausalLM,
  AutoTokenizer,
  AutoProcessor,
  Qwen3_5ForConditionalGeneration,
} from '@huggingface/transformers';
```

**New state variables:**
```typescript
/** Execution strategy for the current model. */
let execution_strategy: 'model_generate_kv_cache' | 'pipeline_full_prefill' | 'qwen3_5_vlm' = 'pipeline_full_prefill';
/** Processor for Qwen3.5 VLM strategy. */
let processor: any = null;
/** Prompt history (raw, with special tokens) for Qwen3.5 VLM strategy. */
let prompt_history: string = '';
```

**Updated `LoadPayload`:**
```typescript
interface LoadPayload {
  model_id: string;
  dtype: string;
  device?: string;
  /** Execution strategy from BE execution_config. */
  execution_strategy?: 'model_generate_kv_cache' | 'pipeline_full_prefill' | 'qwen3_5_vlm';
}
```

**Updated `loadModel()`:**
- Route to strategy-specific loading:
  - `model_generate_kv_cache`: `AutoModelForCausalLM.from_pretrained()` + `AutoTokenizer.from_pretrained()`
  - `pipeline_full_prefill`: `pipeline('text-generation', ...)` (current)
  - `qwen3_5_vlm`: `Qwen3_5ForConditionalGeneration.from_pretrained()` + `AutoProcessor.from_pretrained()`

**Updated `generate()`:**
- Route to strategy-specific generation:
  - `model_generate_kv_cache`: `model.generate()` with sliced input_ids + `past_key_values` + `return_dict_in_generate: true`
  - `pipeline_full_prefill`: `pipeline_generator(prompt, ...)` without `past_key_values` (current fallback)
  - `qwen3_5_vlm`: `model.generate()` with `processor(prompt)` + `past_key_values` + `return_dict_in_generate: true`

**Updated `reset()`:**
- Dispose cache + reset `prompt_history` (for Qwen3.5)

**Updated `disposeModel()`:**
- Dispose cache + processor (for Qwen3.5) + pipeline

### Composable (`use-regex-ai.svelte.ts`)

**Updated `init()`:**
- Look up `execution_config` from `aiModels.getModelByModelId()`
- Pass `execution_strategy` to the worker in the `load` message
- Apply sliding window + intent detection ONLY when `execution_strategy === 'pipeline_full_prefill'`

**Conditional behavior:**
```typescript
const modelParams = aiModels.getModelByModelId(_state.model_id);
const executionConfig = modelParams?.execution_config;
const strategy = executionConfig?.strategy ?? 'pipeline_full_prefill';

// Pass strategy to worker
postToWorker({ type: 'load', model_id: _state.model_id, dtype, execution_strategy: strategy });

// Sliding window + intent detection only for fallback strategy
const useSlidingWindow = strategy === 'pipeline_full_prefill';
const useIntentDetection = strategy === 'pipeline_full_prefill';
```

### API types (`api-types.ts`)

**Updated `AiModel` type:**
```typescript
export type ExecutionConfig = {
  strategy: 'model_generate_kv_cache' | 'pipeline_full_prefill' | 'qwen3_5_vlm';
  kv_cache_reuse: boolean;
  sliding_window: boolean;
  max_history_turns?: number;
  intent_detection: boolean;
};

export type AiModel = {
  // ... existing fields ...
  execution_config?: ExecutionConfig | null;
};
```

### BE entity (`ai_model_entity.ts`)

**New column:**
```typescript
/** Execution strategy config — drives the FE worker routing.
 *  JSONB: { strategy, kv_cache_reuse, sliding_window, max_history_turns, intent_detection } */
@Column({ pgType: "jsonb", nullable: true })
execution_config?: Record<string, any>;
```

### BE DAL (`ai_models_dal.ts`)

Add `execution_config` to `AiModelDetailRow`, `projectAllExceptId()`, and DTO.

### BE migration (fire-and-forget SQL)

```sql
-- Add execution_config column (NO default values — set empirically after harness testing)
ALTER TABLE "public"."ai_models"
  ADD COLUMN IF NOT EXISTS "execution_config" jsonb;

COMMENT ON COLUMN public.ai_models.execution_config IS 'Execution strategy config — drives the FE worker routing. Set empirically by the test harness. JSONB: {strategy, kv_cache_reuse, sliding_window, max_history_turns, intent_detection}';
```

**Default values are NOT set here.** The harness tests each model with each strategy and updates `execution_config` based on empirical results. Until then, `execution_config` is NULL and the FE defaults to `pipeline_full_prefill` (safe fallback).

---

## Test harness (Playwright, automated) — EMPIRICAL, per-model

**Location:** `D:\git\primebrick\temp\ai-harness.mjs` (temp directory, not in repos)

### Empirical principle

**NO ASSUMPTIONS.** Every model is tested with every applicable strategy, in order:
1. Strategy 1 (default: `model_generate_kv_cache`) — test FIRST, even on Qwen2.5
2. Strategy 2 (fallback: `pipeline_full_prefill`) — test SECOND
3. Strategy 3 (vertical: `qwen3_5_vlm`) — test THIRD, only for Qwen3.5 models

If Strategy 1 works on a model where we assumed it would crash, we keep it — no need for Strategy 2 or 3.
If Strategy 1 crashes, we fall back to Strategy 2 and compare.
If Strategy 1 and 2 both fail on Qwen3.5, we try Strategy 3.

### Test order (per-model, not per-strategy)

For efficiency, test all strategies on ONE model before moving to the next:

```
Model 1 (Qwen2.5-Coder-0.5B):
  → Strategy 1 (default)  → capture results
  → Strategy 2 (fallback) → capture results
  → Compare, pick best

Model 2 (Qwen2.5-1.5B):
  → Strategy 1 (default)  → capture results
  → Strategy 2 (fallback) → capture results
  → Compare, pick best

...

Model N (Qwen3.5-0.8B):
  → Strategy 1 (default)  → capture results
  → Strategy 2 (fallback) → capture results
  → Strategy 3 (vertical) → capture results
  → Compare, pick best
```

### 5-turn test scenario (same for all models/strategies)

- T1: "solo lettere e numeri" → expect `^[a-zA-Z0-9]+$`
- T2: "aggiungiamo anche il punto e la virgola" → expect `^[a-zA-Z0-9.,]+$`
- T3: "aggiungiamo anche underscore e trattino" → expect `^[a-zA-Z0-9._-]+$`
- T4: "validare un numero di telefono" → expect phone-like regex (new intent)
- T5: "validare una partita iva italiana" → expect Italian VAT regex (new intent)

### Metrics captured per turn

| Metric | Source | Purpose |
|--------|--------|---------|
| `kv_cache_hit_ratio` | worker `measure` message | Cache efficiency (0.0 = full prefill, 1.0 = perfect reuse) |
| `generation_time_ms` | worker `measure` message | Speed |
| `tokens_generated` | worker `measure` message | Output length |
| `prompt_token_count` | worker `measure` message | Context size |
| `kv_cache_seq_length` | worker `measure` message | Cache growth |
| `first_token_latency_ms` | worker `measure` message | Prefill speed |
| `tokens_per_second` | worker `measure` message | Generation speed |
| `correct_result` | harness comparison | Quality (regex matches expected) |
| `crashed` | error capture | Reliability |

### Results table (presented after each model)

```
Model: onnx-community/Qwen2.5-Coder-0.5B-Instruct#q4f16
┌─────────────────────────┬───────┬───────┬───────┬───────┬───────┬──────────┬─────────┐
│ Strategy                │ T1    │ T2    │ T3    │ T4    │ T5    │ Avg      │ Status  │
├─────────────────────────┼───────┼───────┼───────┼───────┼───────┼──────────┼─────────┤
│ 1. model_generate_kv    │ CRASH │ -     │ -     │ -     │ -     │ -        │ FAIL    │
│ 2. pipeline_full_prefill│ OK    │ OK    │ OK    │ OK    │ OK    │ 1800ms   │ PASS 5/5│
└─────────────────────────┴───────┴───────┴───────┴───────┴───────┴──────────┴─────────┘

Quality (Strategy 2):
  T1: ^[a-zA-Z0-9]+$          ✓ correct
  T2: ^[a-zA-Z0-9.,]+$        ✓ correct
  T3: ^[a-zA-Z0-9._-]+$       ✓ correct
  T4: ^\+?[\d\s().-]{10,}$    ✓ correct (new intent)
  T5: ^\d{11}$                ✓ correct (new intent)

KV cache (Strategy 2):
  kv_cache_hit_ratio: 0.0 (all turns — full prefill, expected)
  prompt_token_count: 583 → 651 → 712 → 780 → 850 (sliding window keeps it bounded)

Decision: Strategy 2 (pipeline_full_prefill) — Strategy 1 crashes, Strategy 2 passes 5/5
```

### Final summary table (after all models tested)

```
┌──────────────────────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┐
│ Model                        │ Strat 1     │ Strat 2     │ Strat 3     │ Best strategy       │
├──────────────────────────────┼─────────────┼─────────────┼─────────────┼─────────────────────┤
│ Qwen2.5-Coder-0.5B           │ CRASH       │ PASS 5/5    │ N/A         │ pipeline_full_prefill│
│ Qwen2.5-1.5B                 │ CRASH       │ PASS 5/5    │ N/A         │ pipeline_full_prefill│
│ Qwen3-1.7B                   │ ?           │ ?           │ N/A         │ ? (empirical)       │
│ Qwen3.5-2B                   │ ?           │ ?           │ ?           │ ? (empirical)       │
│ Qwen3.5-0.8B                 │ ?           │ ?           │ ?           │ ? (empirical)       │
│ LFM2.5-350M                  │ ?           │ ?           │ N/A         │ ? (empirical)       │
│ ...                          │ ...         │ ...         │ ...         │ ...                 │
└──────────────────────────────┴─────────────┴─────────────┴─────────────┴─────────────────────┘
```

### Test methodology (corrected from previous bugs)
- Wait for `smart-regex-ai-typing` (streaming indicator), NOT `smart-regex-ai-loading` (model loading)
- Read the LAST element via `querySelectorAll()[length-1]`, NOT the first
- Count elements before and after to detect new results
- Capture `measure` messages from the worker for deterministic metrics
- Capture `stream_error` messages to detect crashes
- Set `execution_strategy` in sessionStorage before each model load to force a specific strategy

### Output
- Per-model results JSON: `D:\git\primebrick\temp\ai-harness-results.json`
- Per-model results table printed to console
- Final summary table printed to console
- Update `execution_config` in DB based on best-performing strategy per model

---

## Implementation phases

### Phase 1: BE changes (entity + migration)
1. Add `execution_config` column to `ai_model_entity.ts`
2. Add `execution_config` to DAL `AiModelDetailRow` + `projectAllExceptId()`
3. Create fire-and-forget SQL migration (column only, NO default values — set empirically after testing)
4. Run `pnpm run db:meta:compare` to verify entity/DB sync
5. Run `pnpm run db:migrate` to apply the migration

### Phase 2: FE types + composable
1. Add `ExecutionConfig` type to `api-types.ts`
2. Add `execution_config` to `AiModel` type
3. Update composable `init()` to read `execution_config` and pass `execution_strategy` to worker
4. Make sliding window + intent detection conditional on strategy

### Phase 3: Worker — implement all 3 strategies
1. Add strategy routing in `loadModel()` and `generate()`
2. Strategy 1 (`model_generate_kv_cache`): `AutoModelForCausalLM` + `AutoTokenizer` + `model.generate()` with sliced input_ids + `past_key_values`
3. Strategy 2 (`pipeline_full_prefill`): `pipeline('text-generation')` without `past_key_values` (full prefill every turn)
4. Strategy 3 (`qwen3_5_vlm`): `Qwen3_5ForConditionalGeneration` + `AutoProcessor` + `model.generate()` with `past_key_values` + `prompt_history`
5. `reset()` and `disposeModel()` handle all 3 strategies
6. `pnpm run check` passes

### Phase 4: Test harness (automated, per-model)
1. Create Playwright harness script in temp directory
2. For each enabled model:
   a. Test Strategy 1 (default) → capture results
   b. Test Strategy 2 (fallback) → capture results
   c. Test Strategy 3 (vertical, if Qwen3.5) → capture results
   d. Print per-model results table
   e. Pick best strategy based on: correctness > KV cache efficiency > speed
3. Print final summary table across all models
4. Save results to JSON

### Phase 5: DB update + manual verification
1. Update `execution_config` in DB for each model based on harness results
2. Manual verification test (B) on the final configuration
3. Verify: each model loads with its best strategy, 5-turn test passes, no crashes

---

## Acceptance criteria

1. ✅ `execution_config` JSONB column exists in `ai_models` table
2. ✅ BE entity + DAL + DTO include `execution_config`
3. ✅ FE `AiModel` type includes `execution_config`
4. ✅ Worker routes to correct strategy based on `execution_strategy` from `LoadPayload`
5. ✅ Strategy 2 (`pipeline_full_prefill`): Qwen2.5 models work without crash, 5-turn test passes
6. ✅ Strategy 2: sliding window + intent detection active (T4/T5 produce new regexes, not modified)
7. ✅ Strategy 1 (`model_generate_kv_cache`): at least one model works with KV cache reuse (`kv_cache_hit_ratio > 0.8` on turn 2+)
8. ✅ Strategy 3 (`qwen3_5_vlm`): Qwen3.5-0.8B-ONNX works with KV cache reuse
9. ✅ `reset()` disposes cache + resets `prompt_history` (for Qwen3.5)
10. ✅ `disposeModel()` disposes cache + processor + pipeline
11. ✅ Deterministic metrics (`kv_cache_hit_ratio`, `prompt_token_count`, etc.) reported correctly per strategy
12. ✅ Test harness runs on all enabled models, saves results to JSON
13. ✅ `pnpm run check` passes on FE
14. ✅ BE entity/DB compare passes
15. ✅ No WASM fallback — WebGPU only

---

## Files to modify

### BE
- `src/modules/ai-models/ai_model_entity.ts` — add `execution_config` column
- `src/modules/ai-models/ai_models_dal.ts` — add to `AiModelDetailRow` + `projectAllExceptId()`
- `db-meta/fire-and-forget/add_execution_config_column.sql` — new migration

### FE
- `src/lib/api-types.ts` — add `ExecutionConfig` type + `execution_config` to `AiModel`
- `src/lib/ai/regex-ai-worker.ts` — three-strategy routing + Strategy 1 + Strategy 3 implementation
- `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` — conditional sliding window + intent detection

### Temp
- `D:\git\primebrick\temp\ai-harness.mjs` — Playwright test harness (deleted after use)
- `D:\git\primebrick\temp\ai-harness-results.json` — test results (deleted after use)

---

## Appendix A: Current state (before changes)

### Worker (`regex-ai-worker.ts`)
- Uses `pipeline('text-generation', ...)` for all models
- `generate()` passes `past_key_values` to `pipeline_generator()` — crashes on Qwen2.5
- `DynamicCache` imported but only works for first turn (in-place update)
- `return_dict_in_generate: true` removed (incompatible with `pipeline()`)
- `reset()` disposes cache
- `disposeModel()` disposes cache + pipeline

### Composable (`use-regex-ai.svelte.ts`)
- `MAX_HISTORY_TURNS = 6` (sliding window)
- `detectIntent()` — classify modify vs new regex
- Intent-aware `Current regex:` injection
- Sliding window with `invalidate_cache` message
- RAW assistant content storage (fixed to match WebLLM decision)
- All features active regardless of model (no strategy routing)

### DB (`ai_models` table)
- `engine_type`: `webllm` or `transformers_js`
- `dtype`: ONNX quantization
- No `execution_config` column
- `test_scores` JSONB exists but only for regex test scores
