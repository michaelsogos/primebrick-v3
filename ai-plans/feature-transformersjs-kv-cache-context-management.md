# Plan: KV Cache Reuse + Context Management + Intent Detection for Smart Regex AI (Transformers.js)

> **Date**: 2026-09-12
> **Status**: Awaiting approval
> **Scope**: FE-only change. No BE changes needed.
> **Engine**: Transformers.js 4.2.0 (ONNX runtime, WebGPU) — NOT WebLLM

---

## Problem

The Smart Regex AI feature (Transformers.js 4.2.0 + ONNX on WebGPU) has three critical problems identified through empirical testing:

### Problem 1: No KV cache reuse

The worker (`src/lib/ai/regex-ai-worker.ts`) calls `pipeline_generator(prompt, ...)` **without** `past_key_values`. Every turn recomputes the entire prefill from scratch. Transformers.js 4.2.0 supports `DynamicCache` (PR #1638) which allows passing a shared cache object across turns — only new tokens are processed, giving a 36-50x speedup on turns 2+.

### Problem 2: Context not scalable

Every turn sends the FULL message history to the model. At turn 10, the prompt is ~3400 chars. With small models (2K-4K token context), saturation happens fast. Need a sliding window or prompt history management.

### Problem 3: `Current regex:` always injected

The `sendMessage()` function (lines 528-530 of `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`) **always** injects `Current regex: ${lastRegex.pattern}` before the user text when a previous regex exists. The system prompt (line 94) says to MODIFY when seeing "Current regex:". For T4/T5 of the test (completely new requests like "validare un numero di telefono"), the model keeps the old regex instead of generating a new one. Need intent detection: modify vs new regex.

---

## Empirical findings from source-code deep-dive

### Finding 1: Transformers.js 4.2.0 exports `DynamicCache`

Verified in the installed package at `node_modules/@huggingface/transformers/types/transformers.d.ts` line 17:

```typescript
export { DynamicCache } from "./cache_utils.js";
```

The `DynamicCache` class (`node_modules/@huggingface/transformers/types/cache_utils.d.ts`) exposes:

```typescript
export const DynamicCache: new (entries?: Record<string, Tensor>) => DynamicCache;

declare class _DynamicCache {
  constructor(entries?: Record<string, Tensor>);
  /** Get the cached sequence length. */
  get_seq_length(): number;
  /** Update the cache in-place with new entries, disposing replaced GPU tensors. */
  update(newEntries: Record<string, Tensor>): void;
  /** Dispose all contained tensors whose data resides on the GPU. */
  dispose(): Promise<void>;
}
```

### Finding 2: The `pipeline()` API passes `generation_kwargs` (including `past_key_values`) to `model.generate()`

Verified in `node_modules/@huggingface/transformers/dist/transformers.js` lines 32611-32676 (`TextGenerationPipeline._call`):

```javascript
async _call(texts, generate_kwargs = {}) {
  const {
    add_special_tokens: add_special_tokens_arg,
    return_full_text: return_full_text_arg,
    tools,
    documents,
    chat_template,
    tokenizer_encode_kwargs,
    ...generation_kwargs   // ← past_key_values, return_dict_in_generate, etc. land here
  } = generate_kwargs;
  // ...
  const outputTokenIds = await this.model.generate({
    ...text_inputs,
    ...this._default_generation_config,
    ...generation_kwargs   // ← passed straight to model.generate()
  });
}
```

This means passing `past_key_values` and `return_dict_in_generate` as top-level options to `pipeline_generator(prompt, { ..., past_key_values, return_dict_in_generate: true })` forwards them correctly to `model.generate()`.

### Finding 3: `model.generate()` returns `past_key_values` when `return_dict_in_generate: true`

Verified in `node_modules/@huggingface/transformers/dist/transformers.js` lines 25543-25566:

```javascript
const sequences = new Tensor("int64", all_input_ids.flat(), [all_input_ids.length, all_input_ids[0].length]);
const past_key_values = getPastKeyValues(outputs, model_inputs.past_key_values);
// ...
const keepCacheAlive = "past_key_values" in kwargs || generation_config.return_dict_in_generate;
if (!keepCacheAlive) {
  await past_key_values.dispose();   // ← disposed UNLESS we pass past_key_values or return_dict_in_generate
}
if (generation_config.return_dict_in_generate) {
  return {
    sequences,
    past_key_values,   // ← returned for reuse on the next turn
    ...attentions,
    ...return_dict_items
  };
}
return sequences;
```

**Key insight**: Even without `return_dict_in_generate`, passing `past_key_values` in kwargs keeps the cache alive (`keepCacheAlive = true`), but the return value is just `sequences` (a Tensor). To get `past_key_values` back, we MUST set `return_dict_in_generate: true`.

### Finding 4: The current worker renders the chat template manually

`src/lib/ai/regex-ai-worker.ts` lines 386-395:

```typescript
prompt = tokenizer.apply_chat_template
  ? String(tokenizer.apply_chat_template(payload.messages, {
      add_generation_prompt: true,
      tokenize: false,
      enable_thinking: payload.params.enable_thinking ?? false,
    }))
  : payload.messages.map((m) => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
```

The worker passes a **raw string prompt** (not a messages array) to `pipeline_generator(prompt, ...)`. This is important for KV cache reuse: the cache is built from the exact token sequence of the prompt. For the cache to be valid on the next turn, the new prompt MUST be a prefix-extension of the cached prompt (i.e., the new prompt = old prompt + new tokens).

### Finding 5: The current `reset()` does nothing

`src/lib/ai/regex-ai-worker.ts` lines 495-497:

```typescript
function reset(): void {
  post({ type: 'reset_complete' });
}
```

It only posts `reset_complete` — it does NOT clear any cache (because there is no cache yet). After this plan, `reset()` must dispose the `DynamicCache`.

### Finding 6: The current `sendMessage()` always injects `Current regex:`

`src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` lines 525-530:

```typescript
const JSON_REMINDER = '\n/no_think\n[Respond ONLY with JSON: {"patterns":[{"pattern":"...","flags":""}]}]';
let userContentForModel = text + JSON_REMINDER;
if (lastRegex) {
  userContentForModel = `Current regex: ${lastRegex.pattern}\n${text}${JSON_REMINDER}`;
}
```

There is no intent detection — `lastRegex` existence is the only condition. This breaks T4/T5 of the test where the user asks for a completely new regex.

### Finding 7: The current `sendMessage()` sends FULL history

`src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` lines 540-550:

```typescript
const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
  { role: 'system', content: systemPrompt },
];
for (const m of _state.messages) {
  if (m.role === 'user') {
    modelMessages.push({ role: 'user', content: m.content });
  } else if (m.role === 'assistant') {
    modelMessages.push({ role: 'assistant', content: m.content });
  }
}
```

No sliding window — every message in `_state.messages` is sent. At turn 10+ this risks context overflow on small models.

### Finding 8: Transformers.js DynamicCache measured results (PR #1638)

From the official Transformers.js PR #1638 benchmark:

| Turn | Time | Speedup |
|-----:|-----:|--------:|
| 1 | 4235ms | 1x (full prefill) |
| 2 | 117ms | 36x faster |
| 3 | 72ms | 50x faster |

The cache stores key/value tensors for every attention layer. On turn 2+, only the NEW tokens are processed — the prefill of the existing conversation is skipped entirely.

### Finding 9: Qwen3.5-WebGPU official demo pattern (alternative approach)

The official Qwen3.5-WebGPU demo uses `promptHistory` (raw prompt with special tokens) + `past_key_values`:

```javascript
// Continuation turn
const continuationPrompt = promptHistory + "\n" + userPrompt;
inputs = await processor(continuationPrompt);
generateArgs = { ...inputs, past_key_values: pastKeyValues };

// After generation
pastKeyValues = result.past_key_values;
promptHistory = processor.batch_decode(result.sequences, { skip_special_tokens: false })[0];
```

This is the **prompt history raw** approach — it maintains the exact rendered prompt string and appends to it. Pro: maximum KV cache reuse (no prefix-matching issues). Con: bypasses `apply_chat_template`, requires manual template rendering, more complex.

**Recommendation**: Use the messages array approach with `pipeline()` + `DynamicCache` first (simpler). The worker already renders the chat template manually and passes a raw string prompt. For KV cache reuse, we need to ensure the new prompt is a prefix-extension of the cached prompt. Only switch to the prompt history raw approach if cache reuse doesn't work with the messages array approach.

---

## Solution

The fix has three parts across two files:

1. **`src/lib/ai/regex-ai-worker.ts`** — Add `DynamicCache`, pass `past_key_values`, return it, clear on reset/dispose
2. **`src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`** — Intent detection, sliding window, pass cache flag to worker
3. **`src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte`** — (Optional) UI for context limit indicator

---

## Part 1: KV cache reuse via DynamicCache (worker)

### 1.1 Import `DynamicCache`

**File**: `src/lib/ai/regex-ai-worker.ts`, line 40-45

**Before**:
```typescript
import {
  env,
  TextStreamer,
  InterruptableStoppingCriteria,
  pipeline,
} from '@huggingface/transformers';
```

**After**:
```typescript
import {
  env,
  TextStreamer,
  InterruptableStoppingCriteria,
  pipeline,
  DynamicCache,
} from '@huggingface/transformers';
```

### 1.2 Add cache state variables

**File**: `src/lib/ai/regex-ai-worker.ts`, after line 124 (after `completed_files`)

```typescript
/**
 * KV cache for multi-turn generation. One DynamicCache instance per
 * conversation — persists across turns so only new tokens are processed
 * (36-50x speedup on turn 2+). Disposed on reset() and disposeModel().
 *
 * `cache_valid` is false when the cache no longer matches the prompt prefix
 * (e.g., after sliding window dropped messages). The next turn does a full
 * prefill and re-establishes the cache.
 */
let past_key_values: DynamicCache | null = null;
let cache_valid = false;
```

### 1.3 Modify `generate()` to use the cache

**File**: `src/lib/ai/regex-ai-worker.ts`, lines 362-484

The key changes to `generate()`:

1. Build the generation options object, conditionally including `past_key_values` only when `cache_valid` is true.
2. Set `return_dict_in_generate: true` so we get `past_key_values` back.
3. After generation, extract `past_key_values` from the output and store it.
4. Mark `cache_valid = true` for the next turn.
5. Measure and report `kv_cache_speedup` (ratio of turn 1 time to current turn time).

**Before** (lines 421-445):
```typescript
await Promise.race([
  pipeline_generator(prompt, {
    max_new_tokens: payload.params.max_new_tokens,
    do_sample: payload.params.do_sample ?? (payload.params.temperature > 0),
    temperature: payload.params.temperature,
    top_p: payload.params.top_p,
    repetition_penalty: payload.params.repetition_penalty,
    eos_token_id: [...eos_ids],
    stopping_criteria: interruptable,
    streamer: new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        if (firstTokenTime === 0) firstTokenTime = performance.now() - genStart;
        tokenCount += 1;
        fullText += text;
        post({ type: 'stream', token: text });
        if (STOP_STRINGS.some((s) => fullText.includes(s))) {
          interruptable.interrupt();
        }
      },
    }),
  }),
  timeout,
]);
```

**After**:
```typescript
// Build generation options. past_key_values is only passed when the cache
// is valid (matches the current prompt prefix). When invalid (e.g., after
// sliding window dropped messages), we do a full prefill and rebuild the cache.
const generation_kwargs: Record<string, any> = {
  max_new_tokens: payload.params.max_new_tokens,
  do_sample: payload.params.do_sample ?? (payload.params.temperature > 0),
  temperature: payload.params.temperature,
  top_p: payload.params.top_p,
  repetition_penalty: payload.params.repetition_penalty,
  eos_token_id: [...eos_ids],
  stopping_criteria: interruptable,
  // return_dict_in_generate=true so model.generate() returns { sequences, past_key_values }
  // instead of just sequences (a Tensor). This lets us extract the cache for the next turn.
  return_dict_in_generate: true,
  streamer: new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
      if (firstTokenTime === 0) firstTokenTime = performance.now() - genStart;
      tokenCount += 1;
      fullText += text;
      post({ type: 'stream', token: text });
      if (STOP_STRINGS.some((s) => fullText.includes(s))) {
        interruptable.interrupt();
      }
    },
  }),
};

if (cache_valid && past_key_values) {
  generation_kwargs.past_key_values = past_key_values;
  post({ type: 'debug', step: 'kv_cache_reuse', seq_length: past_key_values.get_seq_length() });
} else {
  post({ type: 'debug', step: 'kv_cache_full_prefill' });
}

const result = await Promise.race([
  pipeline_generator(prompt, generation_kwargs),
  timeout,
]);

// Extract past_key_values from the return dict (return_dict_in_generate=true).
// The result is { sequences, past_key_values, ... } when return_dict_in_generate
// is set, or a plain Tensor otherwise (fallback).
if (result && typeof result === 'object' && 'past_key_values' in result) {
  past_key_values = result.past_key_values as DynamicCache;
  cache_valid = true;
} else {
  // Fallback: cache not returned (shouldn't happen with return_dict_in_generate=true,
  // but handle gracefully — next turn does full prefill).
  past_key_values = null;
  cache_valid = false;
}
```

### 1.4 Add `kv_cache_speedup` metric

**File**: `src/lib/ai/regex-ai-worker.ts`, in the `measure` post (lines 457-472)

The worker already posts a `measure` message with `kv_cache_speedup: null`. We need to compute it. Since the worker doesn't know the previous turn's time, we track it:

Add a module-level variable:
```typescript
/** Generation time of the previous turn — used to compute kv_cache_speedup. */
let prev_gen_time_ms: number | null = null;
```

In the `measure` post, compute the speedup:
```typescript
const kv_cache_speedup = (cache_valid && prev_gen_time_ms && prev_gen_time_ms > 0)
  ? Math.round((prev_gen_time_ms / genTime) * 10) / 10
  : null;
prev_gen_time_ms = genTime;

post({
  type: 'measure',
  data: {
    model_id: current_model_id ?? '',
    dtype: current_dtype ?? '',
    load_time_ms: 0,
    warmup_time_ms: 0,
    generation_time_ms: Math.round(genTime),
    tokens_generated: tokenCount,
    tokens_per_second: Math.round(tps * 10) / 10,
    first_token_latency_ms: Math.round(firstTokenTime),
    kv_cache_speedup,
    cache_bytes: await measureCacheBytes(),
    memory_usage_bytes: await measureMemoryBytes(),
  },
});
```

### 1.5 Update `reset()` to dispose the cache

**File**: `src/lib/ai/regex-ai-worker.ts`, lines 495-497

**Before**:
```typescript
function reset(): void {
  post({ type: 'reset_complete' });
}
```

**After**:
```typescript
async function reset(): Promise<void> {
  if (past_key_values) {
    try {
      await past_key_values.dispose();
    } catch { /* cache may already be disposed */ }
    past_key_values = null;
  }
  cache_valid = false;
  prev_gen_time_ms = null;
  post({ type: 'reset_complete' });
}
```

### 1.6 Update `disposeModel()` to dispose the cache

**File**: `src/lib/ai/regex-ai-worker.ts`, lines 501-523

Add cache disposal at the start of `disposeModel()`:

```typescript
async function disposeModel(): Promise<void> {
  // Dispose the KV cache before the pipeline — the cache holds GPU tensors
  // that reference the model's ONNX sessions.
  if (past_key_values) {
    try {
      await past_key_values.dispose();
    } catch { /* cache may already be disposed */ }
    past_key_values = null;
  }
  cache_valid = false;
  prev_gen_time_ms = null;

  const generator = pipeline_generator;
  // ... rest of existing disposeModel() ...
}
```

### 1.7 Update the message handler for async `reset()`

**File**: `src/lib/ai/regex-ai-worker.ts`, lines 600-602

**Before**:
```typescript
case 'reset': {
  reset();
  break;
}
```

**After**:
```typescript
case 'reset': {
  await reset();
  break;
}
```

### 1.8 Add `invalidate_cache` message support

The composable needs to tell the worker to invalidate the cache (without disposing it) when the sliding window drops messages. Add a new message type:

**File**: `src/lib/ai/regex-ai-worker.ts`, in the message handler:

```typescript
case 'invalidate_cache': {
  // The prompt prefix changed (sliding window dropped messages) — the
  // cache no longer matches. Next turn does a full prefill.
  cache_valid = false;
  post({ type: 'cache_invalidated' });
  break;
}
```

---

## Part 2: Context management (sliding window) + intent detection (composable)

### 2.1 Add `MAX_HISTORY_TURNS` constant

**File**: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`, after the imports (after line 21)

```typescript
/**
 * Maximum number of user+assistant turns to send to the model. When exceeded,
 * the oldest turns are dropped (FIFO). The system prompt is ALWAYS kept.
 *
 * Token budget estimation:
 * - System prompt: ~427 tokens
 * - 6 turns (12 messages): ~600 tokens
 * - Response budget: ~256 tokens
 * - Total: ~1283 tokens (well within 4096)
 *
 * When the sliding window drops messages, the KV cache is invalidated
 * (the prompt prefix no longer matches the cached sequence).
 */
const MAX_HISTORY_TURNS = 6;
```

### 2.2 Add intent detection function

**File**: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`, after `buildSystemPrompt()` (after line 120)

```typescript
/**
 * Detect whether the user wants to MODIFY the existing regex or generate
 * a NEW one. This prevents the "Current regex:" prefix from being injected
 * for completely new requests (e.g., "validare un numero di telefono"
 * after a previous email regex).
 *
 * Modify intent keywords (Italian + English):
 *   "aggiungi", "aggiungiamo", "rimuovi", "togli", "modifica", "change",
 *   "add", "remove", "keep", "mantieni"
 *
 * New regex intent keywords (Italian + English):
 *   "validare", "validate", "crea", "create", "genera", "generate",
 *   "nuovo", "new", "email", "phone", "telefono", "partita iva",
 *   "codice fiscale"
 *
 * If ambiguous → default to NEW regex (safer — the model can still
 * reference history via the conversation).
 */
function detectIntent(text: string): 'modify' | 'new' {
  const lower = text.toLowerCase().trim();

  // New regex intent — explicit creation/validation keywords
  const newKeywords = [
    'validare', 'validate', 'crea', 'create', 'genera', 'generate',
    'nuovo', 'new', 'email', 'phone', 'telefono', 'partita iva',
    'codice fiscale', 'nuova', 'nuove',
  ];
  for (const kw of newKeywords) {
    if (lower.includes(kw)) return 'new';
  }

  // Modify intent — explicit modification keywords
  const modifyKeywords = [
    'aggiungi', 'aggiungiamo', 'rimuovi', 'togli', 'modifica',
    'change', 'add', 'remove', 'keep', 'mantieni', 'aggiungere',
    'rimuovere', 'modificare',
  ];
  for (const kw of modifyKeywords) {
    if (lower.includes(kw)) return 'modify';
  }

  // Ambiguous — default to new regex (safer)
  return 'new';
}
```

### 2.3 Modify `sendMessage()` — intent-aware `Current regex:` injection

**File**: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`, lines 525-530

**Before**:
```typescript
const JSON_REMINDER = '\n/no_think\n[Respond ONLY with JSON: {"patterns":[{"pattern":"...","flags":""}]}]';
let userContentForModel = text + JSON_REMINDER;
if (lastRegex) {
  userContentForModel = `Current regex: ${lastRegex.pattern}\n${text}${JSON_REMINDER}`;
}
```

**After**:
```typescript
const JSON_REMINDER = '\n/no_think\n[Respond ONLY with JSON: {"patterns":[{"pattern":"...","flags":""}]}]';
let userContentForModel = text + JSON_REMINDER;

// Only inject "Current regex:" when the user's intent is to MODIFY the
// existing regex. For new regex requests (e.g., "validare un numero di
// telefono"), do NOT inject — let the model generate fresh.
if (lastRegex) {
  const intent = detectIntent(text);
  if (intent === 'modify') {
    userContentForModel = `Current regex: ${lastRegex.pattern}\n${text}${JSON_REMINDER}`;
  }
  // If intent === 'new', do NOT inject "Current regex:" — the model
  // generates a fresh regex. It can still reference conversation history.
}
```

### 2.4 Modify `sendMessage()` — sliding window

**File**: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`, lines 540-550

**Before**:
```typescript
const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
  { role: 'system', content: systemPrompt },
];
for (const m of _state.messages) {
  if (m.role === 'user') {
    modelMessages.push({ role: 'user', content: m.content });
  } else if (m.role === 'assistant') {
    modelMessages.push({ role: 'assistant', content: m.content });
  }
}
```

**After**:
```typescript
// Build messages array with sliding window. Keep the system prompt always,
// then keep only the last MAX_HISTORY_TURNS user+assistant pairs. When the
// window drops messages, the KV cache is invalidated (the prompt prefix
// no longer matches the cached sequence).
const conversationMessages = _state.messages.filter(
  (m) => m.role === 'user' || m.role === 'assistant',
);

// Count turns (user+assistant pairs). Each pair = 2 messages.
const totalTurns = Math.floor(conversationMessages.length / 2);
let droppedTurns = 0;
let windowedMessages = conversationMessages;

if (totalTurns > MAX_HISTORY_TURNS) {
  droppedTurns = totalTurns - MAX_HISTORY_TURNS;
  // Drop oldest messages (FIFO) — keep the last MAX_HISTORY_TURNS * 2 messages.
  // The current user message (just added) is always included.
  windowedMessages = conversationMessages.slice(droppedTurns * 2);
}

const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
  { role: 'system', content: systemPrompt },
];
for (const m of windowedMessages) {
  if (m.role === 'user') {
    modelMessages.push({ role: 'user', content: m.content });
  } else if (m.role === 'assistant') {
    modelMessages.push({ role: 'assistant', content: m.content });
  }
}

// If the sliding window dropped messages, invalidate the KV cache — the
// prompt prefix changed so the cached sequence no longer matches.
if (droppedTurns > 0) {
  postToWorker({ type: 'invalidate_cache' });
}
```

### 2.5 Store simplified assistant content (consistency fix)

**File**: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`, lines 586-593

This is the same fix from the previous plan (`feature-kv-cache-reuse-multi-turn.md`) — store simplified content so stored content = sent content, which is essential for KV cache prefix matching.

**Before**:
```typescript
const assistantMessage: ChatMessage = {
  uuid: crypto.randomUUID(),
  role: 'assistant',
  content: responseText,
  choices: choices ?? undefined,
};
_state.messages = [..._state.messages, assistantMessage];
```

**After**:
```typescript
// Store simplified content when choices are parsed — this makes stored
// content = sent content, which is essential for KV cache prefix matching.
// When choices are not parsed, keep raw responseText as fallback (UI
// displays it in the fallback path at line 666).
const assistantMessage: ChatMessage = {
  uuid: crypto.randomUUID(),
  role: 'assistant',
  content: choices && choices.length > 0
    ? `Regex: ${choices[0].pattern}`
    : responseText,
  choices: choices ?? undefined,
};
_state.messages = [..._state.messages, assistantMessage];
```

### 2.6 Update `clearConversation()` to reset cache state

**File**: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`, lines 781-787

The existing `clearConversation()` already posts `reset` to the worker. No change needed — the worker's `reset()` now disposes the cache. But we should also reset the `prev_gen_time_ms` tracking (done in the worker).

---

## Part 3: Prompt history raw approach (alternative — NOT for initial implementation)

This is the Qwen3.5-WebGPU demo pattern. It maintains a raw rendered prompt string (`promptHistory`) and appends to it each turn, bypassing `apply_chat_template` for continuation turns.

### Why NOT to use this initially

1. **Complexity**: Requires manual template rendering and special-token management.
2. **Bypasses `apply_chat_template`**: The worker currently uses `tokenizer.apply_chat_template()` which handles model-specific formatting (ChatML for Qwen, Llama-3 format, etc.). Bypassing this risks format errors.
3. **The messages array approach is simpler**: The worker already renders the template manually and passes a raw string. For KV cache reuse, the key is that the new prompt is a prefix-extension of the cached prompt. With the messages array + simplified content, this should work naturally.

### When to switch to prompt history raw

Only if empirical testing shows that the messages array approach does NOT achieve KV cache reuse (e.g., the cache is invalidated every turn because the template rendering produces a different prefix). In that case:

1. After turn 1, capture the full rendered prompt (including the assistant's response + new user turn).
2. On turn 2+, append only the new user turn to `promptHistory` and pass it as the raw prompt.
3. Pass `past_key_values` from the previous turn.

This is documented here for reference but should NOT be implemented in the initial PR.

---

## Part 4: Deterministic KV cache hit measurement

The `kv_cache_speedup` metric (Part 1.4) is a **heuristic** based on latency ratio — it's not deterministic because generation time depends on model load, GPU contention, sampling, and other factors. A user asked for a **deterministic** measurement: count the actual tokens served from the cache vs computed fresh.

### 4.1 Why timing is NOT deterministic

| Factor | Effect on timing |
|--------|-----------------|
| GPU contention | Other GPU work slows down generation unpredictably |
| Sampling temperature | `do_sample: true` adds non-deterministic overhead |
| Token count | More generated tokens = more time (but cache hit is about prefill, not generation) |
| Model warmup | First generation after load is slower (shader compilation) |
| Browser GC / tab switch | Can pause the worker at any time |

Two identical turns with the same cache hit can have 10x different timing. Timing proves nothing about cache reuse.

### 4.2 Deterministic measurement: token-count based

The `DynamicCache` exposes `get_seq_length()` — the number of tokens currently cached. By comparing this with the prompt token count, we can compute exactly how many tokens were served from cache vs computed fresh.

**Key insight**: `past_key_values.get_seq_length()` returns the cached sequence length AFTER generation (it includes both the prompt tokens and the generated tokens). To measure cache hits on the PREFILL (the part that benefits from reuse), we need to capture the cache length BEFORE and AFTER generation:

- `cache_len_before` = `past_key_values.get_seq_length()` (before generation, from previous turn)
- `prompt_token_count` = number of tokens in the rendered prompt (tokenized)
- `cache_hit_tokens` = `min(cache_len_before, prompt_token_count)` — tokens served from cache
- `cache_miss_tokens` = `prompt_token_count - cache_hit_tokens` — tokens computed fresh (prefill)
- `cache_hit_ratio` = `cache_hit_tokens / prompt_token_count` (0.0 to 1.0)

When `cache_hit_ratio = 1.0`, the entire prompt was served from cache (perfect reuse). When `cache_hit_ratio = 0.0`, no cache was available (full prefill).

### 4.3 Implementation in the worker

**File**: `src/lib/ai/regex-ai-worker.ts`

Add module-level variables for the measurement:

```typescript
/**
 * Deterministic KV cache hit measurement.
 *
 * `cache_len_before_gen` is the sequence length of the cache BEFORE the
 * current generation. It's captured from the previous turn's cache (or 0
 * on the first turn / after invalidation). Combined with the prompt token
 * count, this gives an exact measure of how many tokens were served from
 * cache vs computed fresh — independent of timing.
 *
 *   cache_hit_tokens = min(cache_len_before_gen, prompt_token_count)
 *   cache_miss_tokens = prompt_token_count - cache_hit_tokens
 *   cache_hit_ratio = cache_hit_tokens / prompt_token_count
 */
let cache_len_before_gen = 0;
```

In `generate()`, after rendering the prompt (after line 396), tokenize the prompt to get the token count:

```typescript
// Tokenize the prompt to get the exact token count — needed for
// deterministic KV cache hit measurement (token-count based, not timing).
let prompt_token_count = 0;
try {
  const promptTokens = tokenizer(prompt, { add_special_tokens: false });
  prompt_token_count = promptTokens.input_ids?.dims?.at(-1) ?? 0;
} catch {
  // Fallback: estimate from character count (chars / 4)
  prompt_token_count = Math.ceil(prompt.length / 4);
}

// Capture cache length BEFORE generation (from previous turn's cache).
// This is the number of tokens that COULD be served from cache.
const cache_len_at_start = cache_valid && past_key_values
  ? past_key_values.get_seq_length()
  : 0;

post({
  type: 'debug',
  step: 'kv_cache_hit_measure',
  prompt_token_count,
  cache_len_before_gen: cache_len_at_start,
  cache_valid,
});
```

After generation, in the `measure` post (replacing the heuristic `kv_cache_speedup`), compute the deterministic metrics:

```typescript
// Deterministic KV cache hit measurement (token-count based).
// cache_hit_tokens: tokens served from cache (prefill skipped)
// cache_miss_tokens: tokens computed fresh (prefill executed)
// cache_hit_ratio: 0.0 (full prefill) to 1.0 (perfect reuse)
const cache_hit_tokens = Math.min(cache_len_at_start, prompt_token_count);
const cache_miss_tokens = Math.max(0, prompt_token_count - cache_hit_tokens);
const cache_hit_ratio = prompt_token_count > 0
  ? Math.round((cache_hit_tokens / prompt_token_count) * 1000) / 1000
  : 0;

// Update cache_len_before_gen for the NEXT turn's measurement.
// After generation, the cache includes prompt + generated tokens.
cache_len_before_gen = past_key_values ? past_key_values.get_seq_length() : 0;

post({
  type: 'measure',
  data: {
    model_id: current_model_id ?? '',
    dtype: current_dtype ?? '',
    load_time_ms: 0,
    warmup_time_ms: 0,
    generation_time_ms: Math.round(genTime),
    tokens_generated: tokenCount,
    tokens_per_second: Math.round(tps * 10) / 10,
    first_token_latency_ms: Math.round(firstTokenTime),
    // Heuristic (kept for backward compatibility, but NOT authoritative)
    kv_cache_speedup: (cache_valid && prev_gen_time_ms && prev_gen_time_ms > 0)
      ? Math.round((prev_gen_time_ms / genTime) * 10) / 10
      : null,
    // Deterministic (token-count based — authoritative)
    kv_cache_hit_tokens: cache_hit_tokens,
    kv_cache_miss_tokens: cache_miss_tokens,
    kv_cache_hit_ratio: cache_hit_ratio,
    kv_cache_seq_length: cache_len_before_gen,
    prompt_token_count,
    cache_bytes: await measureCacheBytes(),
    memory_usage_bytes: await measureMemoryBytes(),
  },
});
prev_gen_time_ms = genTime;
```

In `reset()` and `disposeModel()`, reset the measurement state:

```typescript
cache_len_before_gen = 0;
```

In the `invalidate_cache` handler, reset `cache_len_before_gen`:

```typescript
case 'invalidate_cache': {
  cache_valid = false;
  cache_len_before_gen = 0;
  post({ type: 'cache_invalidated' });
  break;
}
```

### 4.4 Update the `MeasurementData` interface

**File**: `src/lib/ai/regex-ai-worker.ts`, lines 81-93

```typescript
interface MeasurementData {
  model_id: string;
  dtype: string;
  load_time_ms: number;
  warmup_time_ms: number;
  generation_time_ms: number;
  tokens_generated: number;
  tokens_per_second: number;
  first_token_latency_ms: number;
  /** Heuristic speedup ratio (prev_gen_time / current_gen_time). NOT deterministic. */
  kv_cache_speedup: number | null;
  /** Deterministic: tokens served from KV cache (prefill skipped). */
  kv_cache_hit_tokens: number;
  /** Deterministic: tokens computed fresh (prefill executed). */
  kv_cache_miss_tokens: number;
  /** Deterministic: ratio of cached tokens to total prompt tokens (0.0-1.0). */
  kv_cache_hit_ratio: number;
  /** Total sequence length in the cache after generation (prompt + generated). */
  kv_cache_seq_length: number;
  /** Total tokens in the rendered prompt (before generation). */
  prompt_token_count: number;
  cache_bytes: number | null;
  memory_usage_bytes: number | null;
}
```

### 4.5 Expose cache hit metrics in the composable

**File**: `src/lib/components/ui/ui/smart-regex-input/use-regex-ai.svelte.ts`

The `measurements` state already captures the `measure` worker message. Add the new fields to the `_state.measurements` type (it's `Record<string, any>` so no type change needed, but we should document them).

In the `handleWorkerMessage` `measure` case (line 338-340), the data is already stored:

```typescript
case 'measure': {
  _state.measurements = msg.data;
  break;
}
```

No change needed — the new fields flow through automatically.

### 4.6 Expected measurement values

| Turn | cache_valid | cache_len_before | prompt_tokens | hit_tokens | miss_tokens | hit_ratio |
|-----:|:----------:|----------------:|--------------:|-----------:|------------:|----------:|
| 1    | false       | 0               | ~600         | 0          | ~600        | 0.0       |
| 2    | true        | ~700            | ~800         | ~700       | ~100        | 0.875     |
| 3    | true        | ~900            | ~1000        | ~900       | ~100        | 0.900     |
| 4    | true        | ~1100           | ~1200        | ~1100      | ~100        | 0.917     |
| 5    | true        | ~1300           | ~1400        | ~1300      | ~100        | 0.929     |
| 6+   | true (after window drop) | 0 | ~800 | 0 | ~800 | 0.0 (full prefill) |

Turn 1: `hit_ratio = 0.0` (no cache, full prefill). Turn 2+: `hit_ratio > 0.8` (most tokens cached). After sliding window drop: `hit_ratio = 0.0` again (cache invalidated, full prefill).

### 4.7 Verification: how to confirm cache hits deterministically

After implementation, run the 5-turn test and check the `measure` messages in the console:

```javascript
// In the browser console, after each turn:
__regexAiWorker  // the worker is exposed for debugging (line 190 of use-regex-ai.svelte.ts)

// Or check the composable state:
// The measurements object is updated after each turn
```

The `kv_cache_hit_ratio` field is the authoritative metric:
- `0.0` on turn 1 (expected — no cache)
- `> 0.8` on turn 2+ (expected — cache reuse working)
- `0.0` after `invalidate_cache` (expected — cache dropped)
- `0.0` after `reset()` (expected — cache disposed)

If `kv_cache_hit_ratio` is `0.0` on turn 2+, the cache is NOT being reused — investigate prompt prefix mismatch.

### 4.8 Limitations of this measurement

This token-count measurement is deterministic but has one caveat: it measures the **potential** cache hit (based on sequence lengths), not the **actual** GPU computation skipped. In theory, Transformers.js could recompute some cached tokens internally even when `past_key_values` is passed. To verify the actual computation skipped, you'd need ONNX runtime internals (not exposed).

However, this measurement is far more reliable than timing because:
1. It's reproducible — same prompt + same cache = same `hit_ratio` every time
2. It's independent of GPU contention, GC, tab switches
3. It directly reflects whether `past_key_values` was passed and had a non-zero sequence length
4. A `hit_ratio > 0.8` on turn 2+ combined with faster timing is strong evidence of real cache reuse

For production monitoring, log `kv_cache_hit_ratio` per turn. If it drops below 0.5 on turn 2+, alert — the cache is not being reused effectively.

---

## Part 5: Test methodology fix

The empirical test for the 5-turn scenario must be fixed:

### 4.1 Wait for the correct indicator

The test must wait for `smart-regex-ai-typing` (streaming indicator, line 688 of `regex-ai-chat-panel.svelte`), NOT `smart-regex-ai-loading` (model loading, line 401). The `smart-regex-ai-loading` indicator appears during model download/VRAM loading, not during generation.

### 4.2 Read the LAST element

The test must read the LAST element via `querySelectorAll()[length-1]`, not `querySelector` (which returns the first). Multiple regex results accumulate in the DOM.

### 4.3 Count elements before and after

The test must count `smart-regex-ai-preview` elements before and after each turn to detect new results.

```javascript
// Correct pattern:
const previewsBefore = document.querySelectorAll('[data-testid="smart-regex-ai-preview"]').length;
// ... send message, wait for typing to disappear ...
const previewsAfter = document.querySelectorAll('[data-testid="smart-regex-ai-preview"]');
const latestPreview = previewsAfter[previewsAfter.length - 1];
```

---

## Files to modify

| File | Changes |
|------|---------|
| `src/lib/ai/regex-ai-worker.ts` | Import `DynamicCache`; add `past_key_values` + `cache_valid` + `cache_len_before_gen` state; pass `past_key_values` + `return_dict_in_generate` in `generate()`; tokenize prompt for deterministic cache hit measurement; extract cache from result; add `kv_cache_hit_tokens`/`kv_cache_miss_tokens`/`kv_cache_hit_ratio`/`kv_cache_seq_length`/`prompt_token_count` metrics; dispose cache in `reset()` and `disposeModel()`; add `invalidate_cache` message handler; update `MeasurementData` interface |
| `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` | Add `MAX_HISTORY_TURNS` constant; add `detectIntent()` function; intent-aware `Current regex:` injection; sliding window in `sendMessage()`; store simplified assistant content; post `invalidate_cache` when window drops messages |
| `src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` | (Optional) Context limit indicator — show "N/MAX turns" when approaching the limit |

---

## Acceptance criteria

1. ✅ **KV cache reuse works**: Turn 2+ generation is significantly faster than Turn 1 (measurable via `kv_cache_speedup` metric in the `measure` worker message)
2. ✅ **Deterministic KV cache hit measurement**: `kv_cache_hit_ratio` is `0.0` on turn 1, `> 0.8` on turn 2+, and `0.0` after cache invalidation/reset — measured by token count, NOT timing
3. ✅ **Context management**: Conversation can continue indefinitely without context overflow (sliding window drops oldest turns at `MAX_HISTORY_TURNS`)
4. ✅ **Intent detection**: "validare un numero di telefono" generates a phone regex, NOT a modification of the previous regex
5. ✅ **Sliding window**: When history exceeds `MAX_HISTORY_TURNS`, oldest messages are dropped and KV cache is invalidated
6. ✅ **Cache invalidation**: When messages are dropped, the next turn does full prefill (no stale cache — `cache_valid = false`, `kv_cache_hit_ratio = 0.0`)
7. ✅ **`pnpm run check` passes** on FE
8. ✅ **Empirical test**: 5-turn scenario produces correct regexes for all 5 turns (not just T1-T3)
9. ✅ **`reset()` disposes cache**: The `DynamicCache` is disposed (GPU tensors released) on `reset()` and `disposeModel()`
10. ✅ **`return_dict_in_generate`**: Set to `true` so `model.generate()` returns `{ sequences, past_key_values }` instead of just `sequences`
11. ✅ **UI not broken**: Choices rendering, fallback path, `applyChoice` all still work (UI uses `choices` not `content` for the choices path)
12. ✅ **Svelte 5 Runes**: No stores, no `createEventDispatcher`, `$state`/`$derived` only
13. ✅ **snake_case**: All data fields use snake_case (`past_key_values`, `kv_cache_speedup`, `kv_cache_hit_ratio`, `cache_valid`, etc.)
14. ✅ **`MeasurementData` interface updated**: Includes `kv_cache_hit_tokens`, `kv_cache_miss_tokens`, `kv_cache_hit_ratio`, `kv_cache_seq_length`, `prompt_token_count`

---

## Testing plan

After implementation:

1. Run `pnpm run check` on FE — must pass with no new errors
2. Browser test: load any model, run the 5-turn scenario:
   - T1: "email address" → email regex
   - T2: "aggiungi numeri" → modified email regex with numbers
   - T3: "aggiungi underscore" → modified regex with underscore
   - T4: "validare un numero di telefono" → NEW phone regex (NOT a modification)
   - T5: "validare una partita iva" → NEW partita iva regex (NOT a modification)
3. Verify `kv_cache_hit_ratio` (deterministic): Turn 1 should be `0.0` (no cache), Turn 2+ should be `> 0.8` (cache reuse working). After `reset()`, Turn 1 should be `0.0` again.
4. Verify `kv_cache_hit_tokens` and `kv_cache_miss_tokens`: On Turn 2+, `hit_tokens` should be close to the previous turn's `prompt_token_count + generated_tokens`, and `miss_tokens` should be small (~100, just the new user turn).
5. Verify sliding window: Send 10+ turns, verify no context overflow, verify `kv_cache_hit_ratio = 0.0` when window drops messages (cache invalidated)
6. Verify `reset()` clears the cache: After reset, Turn 1 has `kv_cache_hit_ratio = 0.0` and `kv_cache_seq_length = 0`
7. Verify UI: choices rendered correctly, fallback path shows raw text, `applyChoice` works
8. Verify intent detection: T4/T5 generate fresh regexes, T2/T3 modify the existing regex

---

## Important constraints

- **WebGPU-only inference**: No WASM/CPU fallback
- **Svelte 5 Runes syntax**: No stores, no `createEventDispatcher`
- **snake_case** for all data fields
- **Follow existing composable state exposure pattern** (`DeepReadonly`)
- **Do NOT break the existing UI**: choices rendering, fallback path, `applyChoice` must still work
- **The `pipeline()` API supports `past_key_values`**: Verified in source code line 32672-32676 (`TextGenerationPipeline._call` passes `generation_kwargs` straight to `model.generate()`)
- **`return_dict_in_generate: true` is required** to get `past_key_values` back from `model.generate()` (verified at line 25555-25564)
- **The cache is kept alive** when `past_key_values` is in kwargs OR `return_dict_in_generate` is true (line 25551)

---

## References

- [Transformers.js DynamicCache (PR #1638)](https://github.com/huggingface/transformers.js/pull/1638) — KV cache reuse across turns
- [`cache_utils.d.ts`](file:///d:/git/primebrick/primebrick-fe-v3/node_modules/@huggingface/transformers/types/cache_utils.d.ts) — `DynamicCache` class API (`get_seq_length`, `update`, `dispose`)
- [`transformers.js` line 32611-32676](file:///d:/git/primebrick/primebrick-fe-v3/node_modules/@huggingface/transformers/dist/transformers.js) — `TextGenerationPipeline._call` passes `generation_kwargs` to `model.generate()`
- [`transformers.js` line 25543-25566](file:///d:/git/primebrick/primebrick-fe-v3/node_modules/@huggingface/transformers/dist/transformers.js) — `model.generate()` returns `{ sequences, past_key_values }` when `return_dict_in_generate: true`
- [Qwen3.5-WebGPU demo](https://github.com/huggingface/transformers.js/blob/main/examples/qwen3.5-webgpu) — official `promptHistory` + `past_key_values` pattern
- [Previous plan: `feature-kv-cache-reuse-multi-turn.md`](file:///d:/git/primebrick/primebrick-workspace/ai-plans/feature-kv-cache-reuse-multi-turn.md) — WebLLM-specific KV cache analysis (different engine, same problem)

---

## Appendix A: File snapshot — current state before changes

This appendix captures the **exact current state** of the two files that will be modified by this plan. It serves as a baseline reference — analogous to how the previous WebLLM plan documented the WebLLM-era file state. If a change goes wrong, diff against this snapshot to identify the regression.

### A.1 `src/lib/ai/regex-ai-worker.ts` — current state (Transformers.js, pre-change)

**Imports** (lines 40-45) — NO `DynamicCache`:
```typescript
import {
  env,
  TextStreamer,
  InterruptableStoppingCriteria,
  pipeline,
} from '@huggingface/transformers';
```

**`MeasurementData` interface** (lines 81-93) — only `kv_cache_speedup` (heuristic, always `null`):
```typescript
interface MeasurementData {
  model_id: string;
  dtype: string;
  load_time_ms: number;
  warmup_time_ms: number;
  generation_time_ms: number;
  tokens_generated: number;
  tokens_per_second: number;
  first_token_latency_ms: number;
  kv_cache_speedup: number | null;
  cache_bytes: number | null;
  memory_usage_bytes: number | null;
}
```

**State variables** (lines 105-124) — NO cache state:
```typescript
let current_model_id: string | null = null;
let current_dtype: string | null = null;
let current_device: string = 'webgpu';
let tokenizer: any = null;
let model: any = null;
let pipeline_generator: any = null;
let is_generating = false;
let current_stopping: any = null;
let load_seq = 0;
let load_in_flight = false;
let loaded_files: string[] = [];
let file_progress: Record<string, number> = {};
let total_files = 0;
let completed_files = 0;
```

**`generate()` — pipeline call** (lines 421-445) — NO `past_key_values`, NO `return_dict_in_generate`:
```typescript
await Promise.race([
  pipeline_generator(prompt, {
    max_new_tokens: payload.params.max_new_tokens,
    do_sample: payload.params.do_sample ?? (payload.params.temperature > 0),
    temperature: payload.params.temperature,
    top_p: payload.params.top_p,
    repetition_penalty: payload.params.repetition_penalty,
    eos_token_id: [...eos_ids],
    stopping_criteria: interruptable,
    streamer: new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        if (firstTokenTime === 0) firstTokenTime = performance.now() - genStart;
        tokenCount += 1;
        fullText += text;
        post({ type: 'stream', token: text });
        if (STOP_STRINGS.some((s) => fullText.includes(s))) {
          interruptable.interrupt();
        }
      },
    }),
  }),
  timeout,
]);
```

**`generate()` — measure post** (lines 457-472) — `kv_cache_speedup` always `null`:
```typescript
post({
  type: 'measure',
  data: {
    model_id: current_model_id ?? '',
    dtype: current_dtype ?? '',
    load_time_ms: 0,
    warmup_time_ms: 0,
    generation_time_ms: Math.round(genTime),
    tokens_generated: tokenCount,
    tokens_per_second: Math.round(tps * 10) / 10,
    first_token_latency_ms: Math.round(firstTokenTime),
    kv_cache_speedup: null, // Computed by caller comparing turns
    cache_bytes: await measureCacheBytes(),
    memory_usage_bytes: await measureMemoryBytes(),
  },
});
```

**`reset()`** (lines 495-497) — does NOTHING (no cache to clear):
```typescript
function reset(): void {
  post({ type: 'reset_complete' });
}
```

**`disposeModel()`** (lines 501-523) — no cache disposal:
```typescript
async function disposeModel(): Promise<void> {
  const generator = pipeline_generator;
  const disposed = current_model_id;
  post({ type: 'debug', step: 'dispose_start', model_id: disposed, has_generator: !!generator });
  model = null;
  tokenizer = null;
  pipeline_generator = null;
  current_model_id = null;
  current_dtype = null;
  is_generating = false;
  try {
    await generator?.dispose?.();
    post({ type: 'debug', step: 'dispose_generator_done', model_id: disposed });
  } catch (e) {
    post({ type: 'debug', step: 'dispose_generator_error', model_id: disposed, error: String(e) });
  }
  post({ type: 'dispose_complete', disposed_model_id: disposed, worker_nonce });
}
```

**Message handler** (lines 582-607) — no `invalidate_cache` case, `reset` is synchronous:
```typescript
switch (data.type) {
  case 'check': { ... }
  case 'load': { await loadModel(data as LoadPayload); break; }
  case 'generate': { await generate(data as GeneratePayload); break; }
  case 'interrupt': { interrupt(); break; }
  case 'reset': { reset(); break; }  // synchronous, no await
  case 'dispose': { await disposeModel(); break; }
  case 'status': { ... }
  // NO 'invalidate_cache' case
}
```

### A.2 `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` — current state (pre-change)

**`buildSystemPrompt()`** (lines 86-120) — rules 4 & 5 rely on `Current regex:` prefix:
```typescript
function buildSystemPrompt(): string {
  return `/no_think
You are a regex generator. Convert the user's natural language request into JavaScript regex patterns.

RULES:
1. Output ONLY valid JSON: {"patterns":[{"pattern":"...","flags":""}]}
2. Anchor with ^ and $.
3. No markdown, no explanation, just JSON.
4. If the user message starts with "Current regex:", MODIFY that regex. Add new characters INSIDE the existing character class brackets [...]. Keep all existing characters.
5. If the user says "cancel", "annulla", "reset", or "instead", IGNORE the previous regex and generate a fresh one.
6. "punto" means dot (.), "virgola" means comma (,), ...
7. Use ONLY ASCII characters (U+0020 to U+007E) in regex patterns. ...

Examples:
...
User: Current regex: ^[a-z]+$
aggiungi numeri
{"patterns":[{"pattern":"^[a-z0-9]+$","flags":""}]}

User: Current regex: ^[a-zA-Z0-9.,]+$
aggiungi underscore e trattino
{"patterns":[{"pattern":"^[a-zA-Z0-9.,_-]+$","flags":""}]}`;
}
```

**`sendMessage()` — `Current regex:` injection** (lines 525-530) — ALWAYS injects when `lastRegex` exists, NO intent detection:
```typescript
const JSON_REMINDER = '\n/no_think\n[Respond ONLY with JSON: {"patterns":[{"pattern":"...","flags":""}]}]';
let userContentForModel = text + JSON_REMINDER;
if (lastRegex) {
  userContentForModel = `Current regex: ${lastRegex.pattern}\n${text}${JSON_REMINDER}`;
}
```

**`sendMessage()` — message history** (lines 540-550) — FULL history, NO sliding window:
```typescript
const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
  { role: 'system', content: systemPrompt },
];
for (const m of _state.messages) {
  if (m.role === 'user') {
    modelMessages.push({ role: 'user', content: m.content });
  } else if (m.role === 'assistant') {
    modelMessages.push({ role: 'assistant', content: m.content });
  }
}
```

**`sendMessage()` — assistant message storage** (lines 586-593) — stores RAW `responseText`:
```typescript
const assistantMessage: ChatMessage = {
  uuid: crypto.randomUUID(),
  role: 'assistant',
  content: responseText,  // RAW model output (JSON, markdown fences, etc.)
  choices: choices ?? undefined,
};
_state.messages = [..._state.messages, assistantMessage];
```

**`clearConversation()`** (lines 781-787) — posts `reset` but worker does nothing:
```typescript
async function clearConversation(): Promise<void> {
  postToWorker({ type: 'reset' });
  _state.messages = [];
  _state.pending_choices = null;
  _state.streaming_text = '';
  _state.error = null;
}
```

**No `MAX_HISTORY_TURNS` constant** — the file has no sliding window limit.
**No `detectIntent()` function** — the file has no intent classification.
**No `invalidate_cache` message** — the composable never tells the worker to invalidate the cache.

### A.3 Summary of what does NOT exist today

| Feature | Worker | Composable |
|---------|--------|------------|
| `DynamicCache` import | ❌ | N/A |
| `past_key_values` state | ❌ | N/A |
| `cache_valid` flag | ❌ | N/A |
| `cache_len_before_gen` | ❌ | N/A |
| `return_dict_in_generate` | ❌ | N/A |
| `invalidate_cache` message | ❌ | ❌ |
| `MAX_HISTORY_TURNS` | N/A | ❌ |
| `detectIntent()` | N/A | ❌ |
| Sliding window | N/A | ❌ |
| `kv_cache_hit_tokens` metric | ❌ | N/A |
| `kv_cache_miss_tokens` metric | ❌ | N/A |
| `kv_cache_hit_ratio` metric | ❌ | N/A |
| `kv_cache_seq_length` metric | ❌ | N/A |
| `prompt_token_count` metric | ❌ | N/A |
| Cache disposal in `reset()` | ❌ | N/A |
| Cache disposal in `disposeModel()` | ❌ | N/A |
| Simplified assistant content | N/A | ❌ (stores raw `responseText`) |

This snapshot is the rollback target. If the implementation introduces a regression, `git diff` against this state identifies the exact change that broke behavior.
