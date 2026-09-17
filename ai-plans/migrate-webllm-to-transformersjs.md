# Migration Plan: WebLLM → Transformers.js

## Objective

Replace the WebLLM-based Smart Regex AI engine with Transformers.js (v4.2.0),
preserving all current optimizations (KV cache, regex history, conversation
management, thinking mode control) while gaining:
- Better quantization options (int8, fp16, q4f16, q4, q8)
- Standard chat template via Jinja (tokenizer_config.json)
- Explicit KV cache control via DynamicCache
- Wider model ecosystem (ONNX format)

## Current Architecture (WebLLM)

### Files to backup (rename with `.webllm.bak` suffix)

| File | Purpose |
|------|---------|
| `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` | WebLLM engine lifecycle + chat |
| `src/lib/ai/sw-manager.ts` | Service Worker registration + cache check |
| `src/lib/ai/use-model-cache.svelte.ts` | WebLLM IndexedDB cache management |
| `static/sw-regex-ai.js` | Service Worker for HF model file caching |

### Files that stay unchanged (UI components)

| File | Why unchanged |
|------|---------------|
| `src/lib/components/ui/smart-regex-input/smart-regex-input.svelte` | Parent component — calls `useRegexAi`, no WebLLM dependency |
| `src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` | Chat panel UI — imports `useRegexAi`, needs minor import update |
| `src/lib/components/ui/smart-regex-input/regex-explainer.ts` | Pure regex parsing, no AI dependency |
| `src/lib/components/ui/smart-regex-input/regex-flags-panel.svelte` | Flags UI, no AI dependency |
| `src/lib/components/ui/smart-regex-input/ModelCachePanel.svelte` | Cache UI — needs adapter update |
| `src/lib/components/ui/smart-regex-input/ModelCacheSection.svelte` | Cache section — needs adapter update |
| `src/lib/components/ui/smart-regex-input/ModelIcon.svelte` | Icon component |
| `src/lib/components/ui/smart-regex-input/PowerLevelBars.svelte` | Power level UI |
| `src/lib/components/ui/smart-regex-input/ScoreGauge.svelte` | Score gauge UI |
| `src/lib/components/ui/smart-regex-input/QwenIcon.svelte` | Qwen icon |
| `src/lib/composables/useAiModels.svelte.ts` | BE model catalog fetch — stays (entity API unchanged) |
| `src/lib/api-types.ts` | `AiModel` type — needs `dtype` + `engine_type` fields |
| `src/routes/(app)/system/settings/ai/+page.svelte` | AI settings page — stays |

### Current WebLLM flow

```
User clicks brain CTA
  → regex-ai-chat-panel.svelte: onMount
    → config.ensureLoaded() → get ai_assistant_model
    → aiModels.ensureLoaded() → get model metadata
    → useRegexAi(model_id) → creates composable
    → ai.init() → dynamic import('@mlc-ai/web-llm')
      → CreateMLCEngine(model_id, { initProgressCallback })
      → WebLLM downloads model from huggingface.co/mlc-ai/ to IndexedDB

User sends message
  → ai.sendMessage(text)
    → builds modelMessages = [{role, content}, ...]
    → engine.chat.completions.create({ messages, stream, enable_thinking, ... })
    → WebLLM applies conv_template (ChatML) internally
    → WebLLM manages KV cache internally (automatic prefix matching)
    → streams chunks → parseRegexChoices()

User closes panel
  → ai.dispose() → engine.unload() → VRAM released
```

## Target Architecture (Transformers.js)

### New files

| File | Purpose |
|------|---------|
| `src/lib/ai/regex-ai-worker.ts` | Web Worker: model loading + inference + KV cache |
| `src/lib/ai/use-regex-ai.svelte.ts` | New composable: worker lifecycle + message passing |
| `src/lib/ai/use-model-cache.svelte.ts` | New cache composable: Cache API scanning (no IndexedDB) |
| `src/lib/ai/sw-manager.ts` | Simplified SW registration (optional — Transformers.js caches internally) |

### New flow

```
User clicks brain CTA
  → regex-ai-chat-panel.svelte: onMount
    → config.ensureLoaded() → get ai_assistant_model
    → aiModels.ensureLoaded() → get model metadata (model_id, dtype, engine_type)
    → useRegexAi(model_id, dtype) → creates composable
    → ai.init() → creates Web Worker (new Worker(new URL('./regex-ai-worker.ts', import.meta.url)))
      → worker.postMessage({ type: 'load', model_id, dtype })
      → worker: pipeline("text-generation", model_id, { dtype, device: 'webgpu' })
        → Transformers.js downloads ONNX model from huggingface.co/onnx-community/ to Cache API
      → worker: warmup generate (compile shaders)
      → worker.postMessage({ status: 'ready' })

User sends message
  → ai.sendMessage(text)
    → builds messages = [{role, content}, ...]
    → worker.postMessage({ type: 'generate', messages, options })
    → worker: tokenizer.apply_chat_template(messages, { add_generation_prompt: true })
    → worker: model.generate({ ...inputs, past_key_values, streamer, ... })
    → worker streams via TextStreamer → worker.postMessage({ status: 'update', output })
    → composable accumulates chunks → parseRegexChoices()

User closes panel
  → ai.dispose() → worker.postMessage({ type: 'dispose' }) → worker terminates
  → past_key_values_cache disposed
```

## Critical Technical Findings (Empirical, Zero Assumptions)

### 1. Chat Template: Jinja, not hardcoded

Transformers.js uses `tokenizer.apply_chat_template()` which reads the
`chat_template` field from `tokenizer_config.json` (Jinja template). For Qwen
models, this produces ChatML tags (`<|im_start|>system`, `<|im_start|>user`,
`<|im_start|>assistant`, `<|im_end|>`).

**Verified**: Same ChatML output as WebLLM's `conv_template`, but via Jinja
rendering instead of hardcoded `conv_config`.

### 2. KV Cache: DynamicCache (explicit, not automatic)

Transformers.js v4.2.0 supports `past_key_values` via `DynamicCache` (PR #1638).

```js
import { DynamicCache } from "@huggingface/transformers";

const past_key_values = new DynamicCache();

// Turn 1
const output1 = await generator(messages, {
  max_new_tokens: 1024,
  do_sample: false,
  past_key_values,  // ← pass cache
});
// Cache now contains Turn 1 tokens

// Turn 2 (append new messages)
messages.push(reply1);
messages.push({ role: "user", content: "next question" });
const output2 = await generator(messages, {
  max_new_tokens: 128,
  do_sample: false,
  past_key_values,  // ← reuse cache
});
```

**Performance** (from PR #1638 benchmarks):
- Turn 1: 4235ms (cold)
- Turn 2: 117ms (with cache) vs 293ms (without)
- Turn 3: 72ms (with cache) vs 503ms (without)

**Critical**: The cache is explicit. We must:
- Create a new `DynamicCache` on `clearConversation()` and `switchModel()`
- Pass the same cache to every `generate()` call
- Dispose the cache on `dispose()` via `past_key_values.dispose()`

### 3. KV Cache Prefix Mismatch Bug (Qwen3 issue #1826)

When `enable_thinking=false` is passed to `apply_chat_template()`, the Qwen3
chat template inserts the ` block **only for the last assistant turn** (generation prompt), NOT for previous assistant turns in history.

This means the token sequence from request N is **NOT a prefix** of request N+1, breaking KV-cache reuse.

**Our workaround** (already implemented): Use `/no_think` in the system prompt and user messages instead of `enable_thinking=false` in the template. This is stateful (per-turn) and does not modify the template structure, so KV-cache prefix matching is preserved.

**For thinking-enabled models**: Use `/think` in the user message. Do NOT pass `enable_thinking=true` to `apply_chat_template()` — it would cause the same prefix mismatch.

### 4. Model Availability: Two Architectures

| Model | HF Repo ID | Architecture | API |
|-------|-----------|--------------|-----|
| Qwen2.5 1.5B | `onnx-community/Qwen2.5-1.5B-Instruct` | `qwen2` (text) | `pipeline("text-generation")` |
| Qwen2.5 Coder 1.5B | `onnx-community/Qwen2.5-Coder-1.5B-Instruct` | `qwen2` (text) | `pipeline("text-generation")` |
| Qwen3 1.7B | `onnx-community/Qwen3-1.7B-ONNX` | `qwen3` (text) | `pipeline("text-generation")` |
| **Qwen3.5 2B** | `onnx-community/Qwen3.5-2B-ONNX` | `qwen3_5` (**multimodal**) | `Qwen3_5ForConditionalGeneration` + `AutoProcessor` |
| Qwen2.5 Coder 3B | `onnx-community/Qwen2.5-Coder-3B-Instruct` | `qwen2` (text) | `pipeline("text-generation")` |
| Qwen3 4B | `onnx-community/Qwen3-4B-ONNX` | `qwen3` (text) | `pipeline("text-generation")` |
| **Qwen3.5 4B** | `onnx-community/Qwen3.5-4B-ONNX` | `qwen3_5` (**multimodal**) | `Qwen3_5ForConditionalGeneration` + `AutoProcessor` |
| **Phi-3.5 mini** (3.8B) | `onnx-community/Phi-3.5-mini-instruct-onnx-web` | `phi3` (text) | `pipeline("text-generation")` |
| **Phi-3 mini 4k** (3.8B) | `onnx-community/Phi-3-mini-4k-instruct-ONNX` | `phi3` (text) | `pipeline("text-generation")` |
| **Phi-4 mini** (3.8B) | `onnx-community/Phi-4-mini-instruct-ONNX-GQA` | `phi3` (text) | `pipeline("text-generation")` |

**Text-only Qwen3.5 variants**: Only `onnx-community/Qwen3.5-0.8B-Text-ONNX`
exists. No text-only ONNX for 2B or 4B. We must use the multimodal API for
Qwen3.5 2B/4B with text-only inputs.

**Multimodal API for text-only** (Qwen3.5 2B/4B):
```js
import { AutoProcessor, Qwen3_5ForConditionalGeneration } from "@huggingface/transformers";

const processor = await AutoProcessor.from_pretrained("onnx-community/Qwen3.5-2B-ONNX");
const model = await Qwen3_5ForConditionalGeneration.from_pretrained(
  "onnx-community/Qwen3.5-2B-ONNX",
  {
    dtype: {
      embed_tokens: "q4",
      vision_encoder: "q4",  // minimize VRAM waste (we don't use vision)
      decoder_model_merged: "q4",
    },
    device: "webgpu",
  }
);

// Text-only input — no image needed
const inputs = processor.apply_chat_template(messages, {
  add_generation_prompt: true,
  return_dict: true,
});
const outputs = await model.generate({ ...inputs, max_new_tokens: 256 });
```

**Note**: The multimodal model loads a `vision_encoder` component even for
text-only use. This wastes some VRAM. Using `dtype: "q4"` for the vision
encoder minimizes the waste. Alternatively, we can skip Qwen3.5 and use
Qwen3.5-0.8B-Text-ONNX (text-only, smaller, but not the same model we tested).

### 4b. Phi Models: Different Chat Template (NOT ChatML)

Microsoft Phi-3/Phi-3.5/Phi-4 mini models use a **different chat template** from Qwen.
They do NOT use ChatML. The Phi chat template uses:

```
<|system|>
{system_content}<|end|>
<|user|>
{user_content}<|end|>
<|assistant|>
{assistant_content}<|end|>
```

**Key differences from Qwen**:
- No `<|im_start|>` / `<|im_end|>` tags — uses `<|system|>`, `<|user|>`,
  `<|assistant|>`, `<|end|>` instead
- No thinking mode — `/no_think` and `/think` directives are ignored
  (harmless if present in the system prompt, just treated as text)
- `enable_thinking` is irrelevant — always set to `false` in the DB
- Standard `pipeline("text-generation")` API — no multimodal complexity
- Both models are 3.8B parameters (dense decoder-only Transformer)

**Phi-3.5 mini vs Phi-3 mini 4k vs Phi-4 mini**:
| Aspect | Phi-3.5 mini | Phi-3 mini 4k | Phi-4 mini |
|--------|-------------|---------------|------------|
| Params | 3.8B | 3.8B | 3.8B |
| Context | 128K | 4K | 128K |
| Multilingual | ✅ (better) | Limited | ✅ (Italian included) |
| Release | Aug 2024 | Jun 2024 | Feb 2025 |
| Architecture | Dense decoder | Dense decoder | Dense decoder + GQA |
| Vocab | 32K | 32K | 200K (larger) |
| ONNX repo | `onnx-community/Phi-3.5-mini-instruct-onnx-web` | `onnx-community/Phi-3-mini-4k-instruct-ONNX` | `onnx-community/Phi-4-mini-instruct-ONNX-GQA` |
| Available dtypes | q4f16 | q4, q4f16, fp16, fp32 | q4, q4f16, fp16, fp32 |
| Download (q4f16) | ~2.32 GB | ~2.3 GB | ~3.07 GB |

**Excluded Phi models**:
| Model | Params | Why excluded |
|-------|--------|--------------|
| **Phi-2** | 2.7B | Base model (no instruct tuning), 2048 context, English only, no official ONNX repo for Transformers.js |
| **Phi-4** (full) | 14B | Exceeds 4B limit |

**Worker handling**: The worker detects Phi models by checking if the
`model_id` contains `Phi-3`. For Phi models:
- Use `pipeline("text-generation")` (standard text API, no multimodal)
- Do NOT pass `enable_thinking` to `apply_chat_template()` (irrelevant)
- The `/no_think` in the system prompt is harmless (ignored as plain text)
- The JSON_REMINDER suffix in user messages works the same way

### 5. Quantization Options

Transformers.js supports these dtypes (verified from docs):

| dtype | Size vs fp32 | Quality | WebGPU | Notes |
|-------|-------------|---------|--------|-------|
| `fp32` | 1x | Best | ✅ | Largest, slowest download |
| `fp16` | 0.5x | Excellent | ✅ (needs shader-f16) | Good balance |
| `q8` | 0.25x | Good | ✅ | Default for WASM |
| `int8` | 0.25x | Good | ✅ | Same as q8 for most models |
| `q4` | 0.125x | Moderate | ✅ | Smallest, fastest download |
| **`q4f16`** | 0.125x | Good+ | ✅ | **4-bit weights + fp16 activations — recommended for WebGPU** |
| `bnb4` | 0.125x | Moderate | ❌ | BitsAndBytes, not for browser |

**User requirement**: Test `int8` and `fp16` in addition to `q4f16`.

**Per-model dtype**: The BE entity will store a `dtype` column so each model
can have its own quantization. This allows testing the same model at
different quantizations.

### 6. Browser Cache: Cache API (automatic)

Transformers.js uses the browser's Cache API automatically
(`env.useBrowserCache = true` by default). Model files are cached under
a `transformers-cache` key in the browser's Cache Storage.

**No custom Service Worker needed** for model file caching — Transformers.js
handles it internally. The existing `sw-regex-ai.js` can be removed or kept
as a fallback. The `use-model-cache.svelte.ts` composable needs to be
rewritten to scan the Cache API instead of WebLLM's IndexedDB.

### 7. Web Worker Pattern (mandatory for UI responsiveness)

Model inference MUST run in a Web Worker to prevent UI freezing. The
smollm-webgpu example (Transformers.js official) shows the pattern:

```js
// Main thread
const worker = new Worker(new URL('./regex-ai-worker.ts', import.meta.url), {
  type: 'module',
});
worker.postMessage({ type: 'load', model_id, dtype });
worker.onmessage = (e) => {
  switch (e.data.status) {
    case 'loading': // model loading progress
    case 'ready':   // model loaded, warmed up
    case 'start':   // generation started
    case 'update':  // streaming token
    case 'complete': // generation finished
    case 'error':   // error
  }
};
```

### 8. Streaming via TextStreamer

Transformers.js supports streaming via `TextStreamer`:

```js
import { TextStreamer } from "@huggingface/transformers";

const streamer = new TextStreamer(tokenizer, {
  skip_prompt: true,
  skip_special_tokens: true,
  callback_function: (output) => {
    self.postMessage({ status: 'update', output });
  },
});

const outputs = await model.generate({
  ...inputs,
  past_key_values,
  max_new_tokens: 256,
  streamer,
  return_dict_in_generate: true,
});
```

### 9. Thinking Tag Stripping

The current WebLLM implementation manually strips `` tags
from the streaming output. With Transformers.js + `/no_think`:

- Qwen3/Qwen3.5 with `/no_think`: no thinking tags emitted (verified)
- The `TextStreamer` with `skip_special_tokens: true` will strip ChatML tags
- We still need to handle edge cases where thinking tags appear despite
  `/no_think` (small models may not respect the directive)

The existing thinking-tag stripping logic should be preserved in the
composable (post-stream processing) as a safety net.

## Implementation Plan

### Phase 1: Backup Current WebLLM Files

Rename (not delete) the 4 WebLLM-specific files:

```
src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts
  → src/lib/components/ui/smart-regex-input/use-regex-ai.webllm.bak.ts

src/lib/ai/sw-manager.ts
  → src/lib/ai/sw-manager.webllm.bak.ts

src/lib/ai/use-model-cache.svelte.ts
  → src/lib/ai/use-model-cache.webllm.bak.ts

static/sw-regex-ai.js
  → static/sw-regex-ai.webllm.bak.js
```

Update imports in `regex-ai-chat-panel.svelte` to point to the new
composable location.

### Phase 2: Install Transformers.js

```bash
cd primebrick-fe-v3
pnpm add @huggingface/transformers@4.2.0
```

Verify the package is pinned to exact version `4.2.0` in `package.json`
(per package-versioning rule).

### Phase 3: Backend — Add `dtype` and `engine_type` Columns

Add two columns to `ai_models`:

```sql
-- db-meta/fire-and-forget/add_dtype_engine_type_to_ai_models.sql
ALTER TABLE ai_models
  ADD COLUMN IF NOT EXISTS dtype VARCHAR(20) NOT NULL DEFAULT 'q4f16',
  ADD COLUMN IF NOT EXISTS engine_type VARCHAR(20) NOT NULL DEFAULT 'transformers_js';
```

Update the BE entity (`ai_model_entity.ts`):
```typescript
/** ONNX quantization dtype (q4, q4f16, fp16, int8, q8). */
@Column({ length: 20, nullable: false, defaultSql: "'q4f16'" })
dtype: string;

/** Runtime engine: 'transformers_js' or 'webllm'. */
@Column({ length: 20, nullable: false, defaultSql: "'transformers_js'" })
engine_type: string;
```

Update the FE type (`api-types.ts`):
```typescript
export type AiModel = {
  // ... existing fields ...
  dtype: string;
  engine_type: string;
};
```

Run `pnpm run db:meta:compare` to generate the snapshot, then apply the
migration via `pnpm run db:migrate`.

### Phase 4: Backend — Soft-Delete WebLLM Models, Insert ONNX Models

```sql
-- db-meta/fire-and-forget/migrate_webllm_to_transformersjs_models.sql

-- 1. Soft-delete all existing WebLLM models
UPDATE ai_models
SET deleted_at = NOW(),
    deleted_by = 'system'
WHERE deleted_at IS NULL
  AND model_id LIKE '%-MLC';

-- 2. Insert new Transformers.js (ONNX) models
INSERT INTO ai_models (
  uuid, model_id, name, label_key, description_key,
  power_level, affidability, rank, test_scores,
  is_enabled, enable_thinking, temperature, top_p,
  max_tokens, repetition_penalty, sort_order,
  download_size_mb, vram_mb, compatibility_status,
  dtype, engine_type,
  created_at, created_by, updated_at, updated_by, version
) VALUES
  -- Qwen2.5 1.5B (text-only, q4f16)
  (
    gen_random_uuid(),
    'onnx-community/Qwen2.5-1.5B-Instruct',
    'Qwen2.5 1.5B',
    'system.entities.ai_model.qwen2.5_1.5b.label',
    'system.entities.ai_model.qwen2.5_1.5b.description',
    2, 2, 1.7, NULL,
    true, false, 0.30, 0.80,
    512, 1.10, 10,
    940, 1630, 'COMPATIBLE',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Qwen2.5 Coder 1.5B (text-only, q4f16)
  (
    gen_random_uuid(),
    'onnx-community/Qwen2.5-Coder-1.5B-Instruct',
    'Qwen2.5 Coder 1.5B',
    'system.entities.ai_model.qwen2.5_coder_1.5b.label',
    'system.entities.ai_model.qwen2.5_coder_1.5b.description',
    2, 4, 3.6, NULL,
    true, false, 0.30, 0.80,
    512, 1.10, 20,
    940, 1630, 'COMPATIBLE',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Qwen3 1.7B (text-only, q4f16)
  (
    gen_random_uuid(),
    'onnx-community/Qwen3-1.7B-ONNX',
    'Qwen3 1.7B',
    'system.entities.ai_model.qwen3_1.7b.label',
    'system.entities.ai_model.qwen3_1.7b.description',
    3, 1, 0.9, NULL,
    true, false, 0.60, 0.95,
    1024, 1.10, 30,
    1080, 2037, 'COMPATIBLE',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Qwen3.5 2B (multimodal, q4f16) — uses Qwen3_5ForConditionalGeneration
  (
    gen_random_uuid(),
    'onnx-community/Qwen3.5-2B-ONNX',
    'Qwen3.5 2B',
    'system.entities.ai_model.qwen3.5_2b.label',
    'system.entities.ai_model.qwen3.5_2b.description',
    3, 5, 4.9, NULL,
    true, false, 0.60, 0.95,
    1024, 1.10, 40,
    1500, 2245, 'COMPATIBLE',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Qwen2.5 Coder 3B (text-only, q4f16)
  (
    gen_random_uuid(),
    'onnx-community/Qwen2.5-Coder-3B-Instruct',
    'Qwen2.5 Coder 3B',
    'system.entities.ai_model.qwen2.5_coder_3b.label',
    'system.entities.ai_model.qwen2.5_coder_3b.description',
    4, 2, 2.2, NULL,
    true, false, 0.30, 0.80,
    512, 1.10, 50,
    1800, 2505, 'COMPATIBLE',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Qwen3 4B (text-only, q4f16)
  (
    gen_random_uuid(),
    'onnx-community/Qwen3-4B-ONNX',
    'Qwen3 4B',
    'system.entities.ai_model.qwen3_4b.label',
    'system.entities.ai_model.qwen3_4b.description',
    4, 5, 4.5, NULL,
    true, false, 0.60, 0.95,
    1024, 1.10, 60,
    2400, 3432, 'COMPATIBLE',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Qwen3.5 4B (multimodal, q4f16) — uses Qwen3_5ForConditionalGeneration
  (
    gen_random_uuid(),
    'onnx-community/Qwen3.5-4B-ONNX',
    'Qwen3.5 4B',
    'system.entities.ai_model.qwen3.5_4b.label',
    'system.entities.ai_model.qwen3.5_4b.description',
    5, 4, 3.4, NULL,
    true, false, 0.60, 0.95,
    1024, 1.10, 70,
    3000, 3868, 'COMPATIBLE',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  )
  -- Phi-3.5 mini instruct (3.8B, text-only, q4f16)
  -- Microsoft Phi-3.5-mini — dense decoder-only, 128K context, multilingual
  -- Chat template: Phi format (NOT ChatML): <|system|>...<|end|>, <|user|>...<|end|>, <|assistant|>...<|end|>
  -- No thinking mode — enable_thinking=false, /no_think is ignored (harmless in system prompt)
  (
    gen_random_uuid(),
    'onnx-community/Phi-3.5-mini-instruct-onnx-web',
    'Phi-3.5 mini (3.8B)',
    'system.entities.ai_model.phi_3.5_mini.label',
    'system.entities.ai_model.phi_3.5_mini.description',
    4, 1, 1.0, NULL,
    true, false, 0.30, 0.80,
    512, 1.10, 80,
    2320, 3500, 'UNTESTED',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Phi-3 mini 4k instruct (3.8B, text-only, q4f16)
  -- Microsoft Phi-3-mini-4k — dense decoder-only, 4K context, same arch as Phi-3.5
  -- Chat template: Phi format (NOT ChatML)
  -- No thinking mode
  (
    gen_random_uuid(),
    'onnx-community/Phi-3-mini-4k-instruct-ONNX',
    'Phi-3 mini 4k (3.8B)',
    'system.entities.ai_model.phi_3_mini_4k.label',
    'system.entities.ai_model.phi_3_mini_4k.description',
    4, 1, 1.0, NULL,
    true, false, 0.30, 0.80,
    512, 1.10, 90,
    2300, 3500, 'UNTESTED',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  ),
  -- Phi-4 mini instruct (3.8B, text-only, q4f16)
  -- Microsoft Phi-4-mini — dense decoder-only, 128K context, GQA, 200K vocab
  -- Chat template: Phi format (NOT ChatML), supports tools
  -- No thinking mode — newest Phi generation (Feb 2025)
  (
    gen_random_uuid(),
    'onnx-community/Phi-4-mini-instruct-ONNX-GQA',
    'Phi-4 mini (3.8B)',
    'system.entities.ai_model.phi_4_mini.label',
    'system.entities.ai_model.phi_4_mini.description',
    4, 1, 1.0, NULL,
    true, false, 0.30, 0.80,
    512, 1.10, 100,
    3070, 3500, 'UNTESTED',
    'q4f16', 'transformers_js',
    NOW(), 'system', NOW(), 'system', 1
  )
ON CONFLICT (model_id) DO NOTHING;
```

Update the default model config:
```sql
UPDATE auth_configurations
SET value = 'onnx-community/Qwen3.5-2B-ONNX'
WHERE key = 'ai_assistant_model';
```

**Note**: `download_size_mb` and `vram_mb` are estimates. They must be
verified empirically after the first model download. The values above are
based on the WebLLM model sizes as a starting reference.

### Phase 5: Frontend — Web Worker (`regex-ai-worker.ts`)

Create `src/lib/ai/regex-ai-worker.ts`:

```typescript
/**
 * Web Worker for Smart Regex AI inference using Transformers.js.
 *
 * Handles:
 * - Model loading (pipeline or Qwen3_5ForConditionalGeneration)
 * - Text generation with streaming via TextStreamer
 * - KV cache management via DynamicCache
 * - Model switching (dispose old, load new)
 * - WebGPU feature detection
 *
 * Message protocol (main thread ↔ worker):
 *   → { type: 'check' }                          — WebGPU feature check
 *   → { type: 'load', model_id, dtype }          — Load model
 *   ← { status: 'loading', data }                — Loading progress
 *   ← { status: 'progress', file, progress, ... } — File download progress
 *   ← { status: 'ready' }                        — Model ready
 *   → { type: 'generate', messages, options }    — Generate response
 *   ← { status: 'start' }                        — Generation started
 *   ← { status: 'update', output }               — Streaming token
 *   ← { status: 'complete', output }              — Generation complete
 *   → { type: 'interrupt' }                       — Stop generation
 *   → { type: 'reset' }                           — Clear KV cache
 *   → { type: 'dispose' }                        — Unload model + terminate
 */
import {
  pipeline,
  AutoTokenizer,
  AutoModelForCausalLM,
  AutoProcessor,
  TextStreamer,
  DynamicCache,
  InterruptableStoppingCriteria,
} from '@huggingface/transformers';

// --- State ---
let generator: Awaited<ReturnType<typeof pipeline>> | null = null;
let tokenizer: any = null;
let model: any = null;
let processor: any = null;
let is_multimodal = false;  // Qwen3.5 uses multimodal API
let is_phi = false;         // Phi-3/Phi-3.5 uses pipeline but different template
let past_key_values_cache: DynamicCache | null = null;
const stopping_criteria = new InterruptableStoppingCriteria();

// --- Feature detection ---
async function check() {
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU not supported');
    self.postMessage({ status: 'ready', data: 'webgpu_available' });
  } catch (e) {
    self.postMessage({ status: 'error', data: e.toString() });
  }
}

// --- Model loading ---
async function load(model_id: string, dtype: string) {
  self.postMessage({ status: 'loading', data: 'Loading model...' });

  // Detect multimodal models (Qwen3.5 2B/4B — not text-only variants)
  is_multimodal = model_id.includes('Qwen3.5') && !model_id.includes('Text');
  // Detect Phi models (different chat template, no thinking mode)
  is_phi = model_id.includes('Phi-3') || model_id.includes('Phi-4');

  const progress_callback = (x: any) => self.postMessage(x);

  if (is_multimodal) {
    // Qwen3.5 multimodal API (text-only use)
    const { AutoProcessor, Qwen3_5ForConditionalGeneration } =
      await import('@huggingface/transformers');
    processor = await AutoProcessor.from_pretrained(model_id, { progress_callback });
    model = await Qwen3_5ForConditionalGeneration.from_pretrained(model_id, {
      dtype: {
        embed_tokens: dtype === 'fp16' ? 'fp16' : 'q4',
        vision_encoder: 'q4',  // minimize VRAM waste (unused)
        decoder_model_merged: dtype === 'fp16' ? 'fp16' : 'q4',
      },
      device: 'webgpu',
      progress_callback,
    });
    tokenizer = processor.tokenizer;
  } else {
    // Standard text-generation pipeline
    generator = await pipeline('text-generation', model_id, {
      dtype,
      device: 'webgpu',
      progress_callback,
    });
    tokenizer = generator.tokenizer;
    model = generator.model;
  }

  // Warmup (compile shaders)
  self.postMessage({ status: 'loading', data: 'Compiling shaders...' });
  const inputs = tokenizer('a');
  await model.generate({ ...inputs, max_new_tokens: 1 });

  // Initialize KV cache
  past_key_values_cache = new DynamicCache();

  self.postMessage({ status: 'ready' });
}

// --- Generation ---
async function generate(
  messages: Array<{ role: string; content: string }>,
  options: {
    max_new_tokens: number;
    temperature: number;
    top_p: number;
    repetition_penalty: number;
    do_sample: boolean;
  },
) {
  if (!tokenizer || !model) {
    self.postMessage({ status: 'error', data: 'Model not loaded' });
    return;
  }

  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
  });

  let startTime: number | undefined;
  let numTokens = 0;
  const token_callback_function = () => {
    startTime ??= performance.now();
    numTokens++;
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (output: string) => {
      self.postMessage({ status: 'update', output });
    },
    token_callback_function,
  });

  self.postMessage({ status: 'start' });

  stopping_criteria.reset();

  const outputs = await model.generate({
    ...inputs,
    past_key_values: past_key_values_cache,
    max_new_tokens: options.max_new_tokens,
    do_sample: options.do_sample,
    temperature: options.temperature,
    top_p: options.top_p,
    repetition_penalty: options.repetition_penalty,
    streamer,
    stopping_criteria,
    return_dict_in_generate: true,
  });

  // Decode full output
  const { sequences } = outputs;
  const decoded = tokenizer.batch_decode(sequences, {
    skip_special_tokens: true,
  });

  self.postMessage({ status: 'complete', output: decoded[0] });
}

// --- Message handler ---
self.addEventListener('message', async (e) => {
  const { type, data } = e.data;
  switch (type) {
    case 'check':
      await check();
      break;
    case 'load':
      await load(data.model_id, data.dtype);
      break;
    case 'generate':
      await generate(data.messages, data.options);
      break;
    case 'interrupt':
      stopping_criteria.interrupt();
      break;
    case 'reset':
      past_key_values_cache?.dispose();
      past_key_values_cache = new DynamicCache();
      stopping_criteria.reset();
      break;
    case 'dispose':
      past_key_values_cache?.dispose();
      past_key_values_cache = null;
      model = null;
      generator = null;
      tokenizer = null;
      processor = null;
      break;
  }
});
```

### Phase 6: Frontend — New Composable (`use-regex-ai.svelte.ts`)

Create `src/lib/ai/use-regex-ai.svelte.ts` (new location, not in the
smart-regex-input directory — the composable is now AI-infrastructure,
not UI-specific).

The composable:
- Creates and manages the Web Worker
- Translates worker messages into reactive `$state`
- Preserves the same public API as the WebLLM version:
  `init()`, `switchModel()`, `sendMessage()`, `applyChoice()`, `testRegex()`,
  `generateExamples()`, `clearConversation()`, `dispose()`
- Preserves the same `_state` shape (model_id, is_loading_model, load_progress,
  is_ready, is_streaming, ai_status, messages, streaming_text, error,
  pending_choices, webgpu_available)
- Preserves `buildSystemPrompt()` and `parseRegexChoices()` verbatim
- Preserves the `ChatMessage` and `RegexChoice` interfaces
- Preserves the `display_content` vs `content` distinction for KV cache prefix
- Preserves the `Current regex:` prefix injection
- Preserves the JSON_REMINDER suffix
- Preserves the thinking-tag stripping logic (safety net)

Key differences from WebLLM version:
- `init()` creates a Worker instead of `CreateMLCEngine`
- `sendMessage()` posts to worker instead of `engine.chat.completions.create()`
- `clearConversation()` posts `{ type: 'reset' }` to clear KV cache
- `dispose()` posts `{ type: 'dispose' }` and terminates the worker
- `switchModel()` disposes current worker, creates new one with new model

### Phase 7: Frontend — New Cache Composable (`use-model-cache.svelte.ts`)

Create `src/lib/ai/use-model-cache.svelte.ts` (new location).

The cache composable:
- Scans the Cache API for ONNX model files (instead of WebLLM's IndexedDB)
- Extracts model IDs from Cache API URL patterns
  (`huggingface.co/onnx-community/{model_id}/resolve/main/onnx/...`)
- Estimates per-model sizes from content-length headers
- Detects orphaned models (cached but not in DB catalog)
- Uses `navigator.storage.estimate()` for global storage usage
- Preserves MRU tracking and auto-eviction logic
- Preserves the same `_state` shape and public API

Key differences:
- `refreshCacheStatus()` scans Cache API instead of `webllm.hasModelInCache()`
- `deleteModel()` deletes Cache API entries instead of `webllm.deleteModelAllInfoInCache()`
- Cache name: `transformers-cache` (Transformers.js default) instead of `webllm-models-v1`

### Phase 8: Frontend — Update Imports

Update `regex-ai-chat-panel.svelte`:
```typescript
// OLD:
import { useRegexAi } from '$lib/components/ui/smart-regex-input/use-regex-ai.svelte';
import { useModelCache } from '$lib/ai/use-model-cache.svelte';

// NEW:
import { useRegexAi } from '$lib/ai/use-regex-ai.svelte';
import { useModelCache } from '$lib/ai/use-model-cache.svelte';
```

Update `ModelCachePanel.svelte` and `ModelCacheSection.svelte` if they
import from the old locations.

### Phase 9: Frontend — Service Worker (optional simplification)

The existing `sw-regex-ai.js` intercepts `huggingface.co` fetches and caches
them. Transformers.js already uses the Cache API internally, so the SW is
redundant. However, keeping it provides a second caching layer.

**Decision**: Keep the SW but update the cache name from `webllm-models-v1`
to `transformers-models-v1` and keep the same cache-first strategy. This is
a safety net — if Transformers.js's internal cache fails, the SW cache
still serves the model files.

Update `sw-manager.ts`:
- Remove `isModelCached()` (WebLLM-specific, uses `hasModelInCache`)
- Keep `registerRegexAiSw()` (registers the SW)
- The SW file (`sw-regex-ai.js`) stays but with updated cache name

### Phase 10: Vite Configuration

Transformers.js requires specific Vite configuration for Web Workers and
ONNX Runtime Web:

```typescript
// vite.config.ts additions
export default defineConfig({
  // ... existing config ...
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  worker: {
    format: 'es',
  },
});
```

This ensures:
- Transformers.js is not pre-bundled (it uses dynamic imports internally)
- Web Workers use ES module format (required for `new Worker(..., { type: 'module' })`)

### Phase 11: Empirical Testing — Two-Phase Approach

Testing happens in two phases:
- **Phase 11a: Harness tests** (fast, automated, standalone) — runs first
- **Phase 11b: E2E tests via MCP Playwright** (real app, confirms harness) — runs later

Phase 11a is the primary validation. Phase 11b confirms that harness results
match real-app behavior. If they diverge, the harness is calibrated.

The same 4-turn Smart Regex conversation is used in both phases:

1. `solo lettere e numeri`
2. `con anche punti, virgole e punto e virgola`
3. `aggiungi il trattino`
4. `ora aggiungi anche underscore e punto`

Expected regex progression:
```
^[a-zA-Z0-9]+$
^[a-zA-Z0-9.,;]+$
^[a-zA-Z0-9.,;-]+$
^[a-zA-Z0-9.,;-_]+$
```

**Test matrix**: Test each model at 3 quantizations:
- `q4f16` (default, smallest)
- `fp16` (best quality, largest)
- `int8` (user-requested, good balance)

This gives 10 models × 3 dtypes = 30 test runs.

**Models to test** (10 total):
| # | Model | HF Repo ID | Type | Status |
|---|-------|-----------|------|--------|
| 1 | Qwen2.5 1.5B | `onnx-community/Qwen2.5-1.5B-Instruct` | text | UNTESTED |
| 2 | Qwen2.5 Coder 1.5B | `onnx-community/Qwen2.5-Coder-1.5B-Instruct` | text | UNTESTED |
| 3 | Qwen3 1.7B | `onnx-community/Qwen3-1.7B-ONNX` | text | UNTESTED |
| 4 | Qwen3.5 2B | `onnx-community/Qwen3.5-2B-ONNX` | multimodal | UNTESTED |
| 5 | Qwen2.5 Coder 3B | `onnx-community/Qwen2.5-Coder-3B-Instruct` | text | UNTESTED |
| 6 | Qwen3 4B | `onnx-community/Qwen3-4B-ONNX` | text | UNTESTED |
| 7 | Qwen3.5 4B | `onnx-community/Qwen3.5-4B-ONNX` | multimodal | UNTESTED |
| 8 | **Phi-3.5 mini** | `onnx-community/Phi-3.5-mini-instruct-onnx-web` | text | UNTESTED |
| 9 | **Phi-3 mini 4k** | `onnx-community/Phi-3-mini-4k-instruct-ONNX` | text | UNTESTED |
| 10 | **Phi-4 mini** | `onnx-community/Phi-4-mini-instruct-ONNX-GQA` | text | UNTESTED |

All models start as `UNTESTED` — previous WebLLM scores do NOT apply to
ONNX/Transformers.js versions (different runtime, different quantization,
different chat template handling). Fresh empirical testing required.

**Scoring**: Use the same scoring formula:
```
score = mean(runs) * 0.6 + (success_count / total) * 5 * 0.4
```

Update `test_scores`, `affidability`, and `rank` in the DB after testing.

---

#### Phase 11a: Harness Test Suite

##### Harness architecture

A **dev-only test route** in the FE app:

```
src/routes/(app)/system/settings/ai/harness/+page.svelte
src/routes/(app)/system/settings/ai/harness/+page.ts   (guard: dev-only)
```

Why a route (not a standalone HTML page):
- Uses the **real** `useRegexAi` composable (same worker, same parser, same system prompt)
- Served by the existing dev server on port 5173 (no CORS, no separate server)
- Has access to WebGPU, Workers, Cache API (same origin)
- Can import `@huggingface/transformers` from `node_modules`
- Accessible only in dev mode (`import { dev } from '$app/environment'` guard)
- Removed before production build (or guarded by `if (!dev) return error(404)`)

The harness page has:
- A model selector dropdown (all 10 ONNX models from DB catalog)
- A dtype selector (`q4f16`, `fp16`, `int8`)
- A "Run test" button (runs all 4 turns automatically for the selected model)
- A "Run all models" button (iterates all 10 models at `q4f16`)
- A results table (live-updating as each model completes)
- A "Export JSON" button (downloads results as `harness-results.json`)
- A "Update DB" button (sends measured values to BE via API)

##### What the harness measures (per model, per dtype)

| Metric | How measured | Precision |
|--------|-------------|-----------|
| `download_size_mb` | Scan Cache API for model URL pattern, sum `content-length` or blob sizes | Exact (bytes) |
| `vram_mb` | `performance.measureUserAgentSpecificMemory()` before/after load, delta | Approximate (Chrome only) |
| `load_time_ms` | `performance.now()` from load start to `ready` event | Exact (ms) |
| `first_token_latency_ms` | `performance.now()` from generate start to first `TextStreamer` callback | Exact (ms) |
| `tokens_per_second` | `numTokens / (generation_end - first_token_time) * 1000` | Exact |
| `turn_N_regex` | Parsed from model output via real `parseRegexChoices()` | String |
| `turn_N_score` | 0-5 score per turn (see scoring rubric below) | Integer 0-5 |
| `kv_cache_speedup` | `turn_1_latency / turn_2_latency` ratio | Float |
| `crash` | Boolean — did the model crash/OOM/hang during any turn? | Boolean |
| `thinking_loop` | Boolean — did the model enter an infinite thinking loop? | Boolean |
| `malformed_json` | Boolean — did `parseRegexChoices()` return null on any turn? | Boolean |
| `console_errors` | Array of console error messages during the test | String[] |

##### Download size measurement (exact)

```typescript
async function measureDownloadSize(modelId: string): Promise<number> {
  // Scan all Cache API caches for URLs matching the model's HF repo
  const cacheNames = await caches.keys();
  let totalBytes = 0;
  const urlPattern = `huggingface.co/${modelId}/`;

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    for (const req of requests) {
      if (req.url.includes(urlPattern)) {
        const response = await cache.match(req);
        const blob = await response?.blob();
        if (blob) totalBytes += blob.size;
      }
    }
  }

  return Math.round((totalBytes / (1024 * 1024)) * 10) / 10; // MB, 1 decimal
}
```

This is called **after** model load completes. The result is the exact
download size stored in the browser's Cache API. This value **replaces** the
placeholder estimate in the DB.

##### VRAM measurement (approximate)

Browsers do not expose GPU VRAM directly. The harness uses the best
available proxy:

```typescript
async function measureVramDelta<T>(fn: () => Promise<T>): Promise<{ result: T; vram_mb: number }> {
  const perf = performance as any;
  const before = perf.measureUserAgentSpecificMemory
    ? await perf.measureUserAgentSpecificMemory()
    : null;

  const result = await fn();

  const after = perf.measureUserAgentSpecificMemory
    ? await perf.measureUserAgentSpecificMemory()
    : null;

  const deltaBytes = before && after ? after.bytes - before.bytes : 0;
  return { result, vram_mb: Math.round((deltaBytes / (1024 * 1024)) * 10) / 10 };
}
```

**Limitation**: `measureUserAgentSpecificMemory()` measures total JS heap
(including WASM memory used by ONNX Runtime), not just GPU VRAM. It's an
over-estimate. For a more precise VRAM measurement, the user can check
the browser's Task Manager (Shift+Esc in Chrome) before and after model
load. The harness displays both fields:
- `vram_mb_auto` — from `measureUserAgentSpecificMemory()` (automated)
- `vram_mb_manual` — user can enter the Task Manager delta manually

Both values are stored in the DB. `vram_mb` in `ai_models` uses
`vram_mb_manual` if provided, otherwise `vram_mb_auto`.

##### Test protocol (4 turns, same as WebLLM tests)

The harness runs the exact same 4-turn conversation used for WebLLM testing:

```
System prompt: /no_think\nYou are a regex generator... (same as use-regex-ai.svelte.ts)

Turn 1: "solo lettere e numeri"
Expected: ^[a-zA-Z0-9]+$

Turn 2: "con anche punti, virgole e punto virgola"
Expected: ^[a-zA-Z0-9.,;]+$

Turn 3: "aggiungi il trattino"
Expected: ^[a-zA-Z0-9.,;-]+$

Turn 4: "ora aggiungi anche underscore e punto"
Expected: ^[a-zA-Z0-9.,;-_]+$
```

Each turn includes:
- The `Current regex: {previous_regex}` prefix (same as real app)
- The `/no_think` directive (same as real app)
- The JSON_REMINDER suffix (same as real app)

The harness uses the **real** `buildSystemPrompt()` and `parseRegexChoices()`
functions from `use-regex-ai.svelte.ts` — not reimplementations.

##### Per-turn scoring rubric (0-5)

| Score | Criteria |
|-------|----------|
| 5 | Exact match with expected regex (or semantically equivalent) |
| 4 | Correct but with minor redundancy (e.g., duplicate char in class) |
| 3 | Partially correct (missing one character class but structure right) |
| 2 | Wrong but regex-shaped (valid regex, wrong semantics) |
| 1 | Malformed output (not a valid regex, or `parseRegexChoices()` returns null) |
| 0 | Crash, hang, timeout, or empty response |

##### KV cache measurement

The harness measures prefill latency per turn to verify KV cache reuse:

```typescript
const turnTimings: number[] = [];
for (let turn = 0; turn < 4; turn++) {
  const t0 = performance.now();
  const output = await runTurn(messages, past_key_values);
  const t1 = performance.now();
  turnTimings.push(t1 - t0);
}

const kv_cache_speedup = turnTimings[0] / turnTimings[1];
// Expected: > 5x (Turn 1 cold, Turn 2+ with cache)
// If < 2x: KV cache is NOT being reused (investigate prefix mismatch)
```

The harness also runs a **control test** without KV cache (fresh
`DynamicCache` per turn) to compare:

```typescript
// Control: no cache reuse
const noCacheTimings: number[] = [];
for (let turn = 0; turn < 4; turn++) {
  const freshCache = new DynamicCache(); // new cache every turn
  const t0 = performance.now();
  const output = await runTurn(messages, freshCache);
  const t1 = performance.now();
  noCacheTimings.push(t1 - t0);
}
```

Results table shows both `with_cache` and `no_cache` timings side by side.

##### Output format (JSON)

The harness exports a structured JSON file:

```json
{
  "test_date": "2026-09-12T14:30:00Z",
  "transformers_js_version": "4.2.0",
  "browser": "Chrome/128.0.0.0",
  "webgpu_adapter": "NVIDIA GeForce RTX 4070",
  "shader_f16_supported": true,
  "results": [
    {
      "model_id": "onnx-community/Qwen3.5-2B-ONNX",
      "dtype": "q4f16",
      "download_size_mb": 1500.3,
      "vram_mb_auto": 2245.7,
      "vram_mb_manual": null,
      "load_time_ms": 8234,
      "first_token_latency_ms": 120,
      "tokens_per_second": 45.2,
      "kv_cache_speedup": 8.3,
      "turns": [
        {
          "turn": 1,
          "input": "solo lettere e numeri",
          "raw_output": "{\"patterns\":[{\"pattern\":\"^[a-zA-Z0-9]+$\",\"flags\":\"\"}]}",
          "parsed_regex": "^[a-zA-Z0-9]+$",
          "expected_regex": "^[a-zA-Z0-9]+$",
          "score": 5,
          "latency_with_cache_ms": 4235,
          "latency_no_cache_ms": 4235
        },
        {
          "turn": 2,
          "input": "con anche punti, virgole e punto virgola",
          "raw_output": "{\"patterns\":[{\"pattern\":\"^[a-zA-Z0-9.,;]+$\",\"flags\":\"\"}]}",
          "parsed_regex": "^[a-zA-Z0-9.,;]+$",
          "expected_regex": "^[a-zA-Z0-9.,;]+$",
          "score": 5,
          "latency_with_cache_ms": 117,
          "latency_no_cache_ms": 293
        }
      ],
      "overall_score": 5.0,
      "affidability": 4,
      "crash": false,
      "thinking_loop": false,
      "malformed_json": false,
      "console_errors": []
    }
  ]
}
```

##### DB update protocol

After harness testing completes, the harness sends measured values to the
BE via the existing `ai_models` update API:

```typescript
async function updateModelInDb(modelId: string, measurements: HarnessResult) {
  await fetch(`/api/ai-models/update-metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: modelId,
      download_size_mb: measurements.download_size_mb,
      vram_mb: measurements.vram_mb_manual ?? measurements.vram_mb_auto,
      test_scores: JSON.stringify(measurements.turns.map(t => t.score)),
      affidability: measurements.turns.filter(t => t.score >= 4).length,
      rank: calculateScore(measurements.turns.map(t => t.score)),
      compatibility_status: measurements.crash ? 'NOT_COMPATIBLE' : 'COMPATIBLE',
    }),
  });
}
```

**Critical**: `download_size_mb` and `vram_mb` in the DB are updated with
**measured values**, not estimates. The initial seed values are placeholders
marked as `UNTESTED`. After the harness runs, they are replaced with real
numbers.

A new fire-and-forget SQL migration is generated after testing:

```sql
-- db-meta/fire-and-forget/update_ai_model_measured_sizes.sql
-- Generated by harness test on 2026-09-12
UPDATE ai_models SET
  download_size_mb = 1500.3,
  vram_mb = 2245.7,
  test_scores = '[5,5,5,5]',
  affidability = 4,
  rank = 5.0,
  compatibility_status = 'COMPATIBLE'
WHERE model_id = 'onnx-community/Qwen3.5-2B-ONNX';
-- ... one UPDATE per model
```

##### Test execution order

1. **Smoke test**: Load Qwen3.5-2B at `q4f16`, run 4 turns, verify no crash
2. **Full q4f16 sweep**: All 10 models at `q4f16` (the default dtype)
3. **Top 3 at fp16**: Best 3 models from q4f16 sweep, retested at `fp16`
4. **Top 3 at int8**: Same 3 models retested at `int8`
5. **DB update**: Send all measured values to BE
6. **Export JSON**: Download `harness-results.json` for archival

Each model test takes ~30-60 seconds (download + 4 turns). Total q4f16
sweep: ~5-10 minutes. Full suite (with fp16 + int8): ~15-20 minutes.

##### Timeout handling

Each turn has a 30-second timeout. If a turn exceeds 30 seconds:
- The turn is scored 0 (timeout)
- The model is flagged as `thinking_loop: true` or `crash: true`
- The harness moves to the next model (does not hang)

```typescript
const TURN_TIMEOUT_MS = 30000;

async function runTurnWithTimeout(messages, past_key_values): Promise<TurnResult> {
  try {
    const result = await Promise.race([
      runTurn(messages, past_key_values),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TURN_TIMEOUT')), TURN_TIMEOUT_MS)
      ),
    ]);
    return result;
  } catch (e) {
    return {
      parsed_regex: null,
      score: 0,
      latency_ms: TURN_TIMEOUT_MS,
      error: e.message,
    };
  }
}
```

---

#### Phase 11b: E2E Tests via MCP Playwright (later, confirms harness)

After harness testing, the same 4-turn conversation is tested through the
**real Smart Regex UI** using the MCP Playwright tools:

1. Navigate to a page with `SmartRegexInput`
2. Click the brain CTA to open the AI panel
3. Wait for model load (progress bar completes)
4. Type "solo lettere e numeri" and send
5. Wait for response, capture the regex from the UI
6. Type "con anche punti, virgole e punto virgola" and send
7. Wait for response, capture the regex
8. Repeat for turns 3 and 4
9. Compare E2E results with harness results

**Acceptance**: E2E results must match harness results within ±1 score per
turn. If they diverge by more than 1 point, the harness is recalibrated
(e.g., system prompt differences, parser differences) and rerun.

This two-phase approach gives:
- **Speed**: Harness runs 10 models in ~10 minutes (no UI interaction)
- **Confidence**: E2E confirms harness results match real-app behavior
- **Auditability**: JSON export provides reproducible evidence

## Acceptance Criteria

1. ✅ All 4 WebLLM files backed up with `.webllm.bak` suffix
2. ✅ `@huggingface/transformers@4.2.0` installed and pinned in `package.json`
3. ✅ `ai_models` table has `dtype` and `engine_type` columns
4. ✅ All WebLLM models soft-deleted (`deleted_at` set)
5. ✅ 10 new ONNX models inserted with correct metadata (7 Qwen + 3 Phi)
6. ✅ Default model updated to `onnx-community/Qwen3.5-2B-ONNX`
7. ✅ Web Worker (`regex-ai-worker.ts`) handles model loading + inference
8. ✅ New composable (`use-regex-ai.svelte.ts`) preserves same public API
9. ✅ KV cache (`DynamicCache`) works across turns (Turn 2+ significantly faster)
10. ✅ `/no_think` suppresses thinking tags in Qwen3/Qwen3.5
11. ✅ Streaming works via `TextStreamer` (tokens appear incrementally)
12. ✅ `clearConversation()` resets KV cache
13. ✅ `switchModel()` disposes old model, loads new one
14. ✅ `dispose()` terminates worker, releases VRAM
15. ✅ Cache management UI shows ONNX models (not WebLLM)
16. ✅ Harness test route created at `/system/settings/ai/harness` (dev-only)
17. ✅ All 10 models tested via harness at `q4f16`
18. ✅ At least top 3 models tested via harness at `fp16` and `int8`
19. ✅ `download_size_mb` updated in DB with **measured** Cache API values (not estimates)
20. ✅ `vram_mb` updated in DB with measured values (auto or manual)
21. ✅ `test_scores`, `affidability`, `rank` updated in DB from harness results
22. ✅ `harness-results.json` exported with full per-model, per-turn data
23. ✅ KV cache speedup measured and > 2x for working models
24. ✅ E2E tests via MCP Playwright confirm harness results (±1 score per turn)
25. ✅ `pnpm run check` passes (no type errors)
26. ✅ `pnpm run build` succeeds

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Qwen3.5 multimodal API complexity | Two code paths in worker (text vs multimodal) |
| VRAM waste from vision encoder | Use `dtype: 'q4'` for vision_encoder module |
| KV cache prefix mismatch | Use `/no_think` directive (not `enable_thinking=false`) |
| WebGPU shader compilation time | Warmup with dummy input on model load |
| Worker termination on model switch | Create new worker per model (no hot-swap) |
| Cache API size estimation | Scan content-length headers (same as WebLLM approach) |
| Transformers.js bundle size | Dynamic import in worker (not in main bundle) |
| ONNX Runtime Web WASM fallback | Configure `device: 'webgpu'` (no WASM fallback) |

## Files Summary

### Backend (primebrick-be-v3)

| File | Action |
|------|--------|
| `src/modules/ai-models/ai_model_entity.ts` | Add `dtype` + `engine_type` columns |
| `db-meta/fire-and-forget/add_dtype_engine_type_to_ai_models.sql` | New migration |
| `db-meta/fire-and-forget/migrate_webllm_to_transformersjs_models.sql` | New migration |
| `src/modules/ai-models/list-config.ts` | Add `dtype` + `engine_type` to list columns |
| `src/modules/ai-models/dto.ts` | Add `dtype` + `engine_type` to DTOs |

### Frontend (primebrick-fe-v3)

| File | Action |
|------|--------|
| `src/lib/ai/regex-ai-worker.ts` | **New** — Web Worker for inference |
| `src/lib/ai/use-regex-ai.svelte.ts` | **New** — Composable (worker-based) |
| `src/lib/ai/use-model-cache.svelte.ts` | **New** — Cache composable (Cache API) |
| `src/lib/ai/sw-manager.ts` | **Update** — Simplify (remove WebLLM refs) |
| `static/sw-regex-ai.js` | **Update** — Change cache name |
| `src/lib/api-types.ts` | **Update** — Add `dtype` + `engine_type` to `AiModel` |
| `src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` | **Update** — Import paths |
| `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` | **Backup** → `.webllm.bak.ts` |
| `src/lib/ai/use-model-cache.svelte.ts` (old) | **Backup** → `.webllm.bak.ts` |
| `src/lib/ai/sw-manager.ts` (old) | **Backup** → `.webllm.bak.ts` |
| `static/sw-regex-ai.js` (old) | **Backup** → `.webllm.bak.js` |
| `package.json` | **Update** — Add `@huggingface/transformers@4.2.0` |
| `vite.config.ts` | **Update** — Worker + optimizeDeps config |
