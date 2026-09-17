# Refactor: Unified pipeline path driven by `kv_cache_reuse` (drop `strategy`)

## Context

Empirical model testing (S1 fix v2) showed that `model_generate_kv_cache` (S1) and
`pipeline_full_prefill` (S2) in `regex-ai-worker.ts` are the **same
`pipeline_generator(messages, params)` call**, differing only in whether
`past_key_values` is passed. The `qwen3_5_vlm` strategy is used by 0 models in the DB.

DB evidence: all enabled models have uniform
`{strategy: "model_generate_kv_cache", sliding_window: true, intent_detection: true, max_history_turns: 6}`
— the only varying field is `kv_cache_reuse`.

## Objective

Single pipeline generation path. `kv_cache_reuse` (the `use_cache` flag) alone decides
whether a `DynamicCache` is created and passed as `past_key_values`.

- `use_cache=true`: create/hold `DynamicCache`, always pass it (even empty on T1 —
  the library populates it in-place via `.update()`).
- `use_cache=false`: never create `DynamicCache`, never pass `past_key_values` —
  guaranteed no cache args reach `model.generate()` for ONNX-fragile models.
- Both paths: sliding window bounds context (already implemented; window drops
  invalidate the KV cache via `invalidate_cache`).

## Changes

### `src/lib/ai/regex-ai-worker.ts`

- Remove `ExecutionStrategy` type, `strategy` from `LoadPayload`, `current_strategy` state.
- Remove `qwen3_5_vlm` path: VLM loader branch, `processor`, `prompt_history`, warmup branch, generate branch.
- `loadModel`: always `pipeline('text-generation', repo_id, load_kwargs)`.
- Warmup: run only when `kv_cache_reuse` is true (preserves current behavior —
  no-cache models skip warmup because it corrupts ORT session state → ONNX Expand crash).
- `generate()`: single path — `pipeline_generator(messages, {...params, past_key_values: kv ? cache : undefined})`.
  When `kv_cache_reuse=false`, dispose/null any residual cache before generating.
- `reset`/`disposeModel`/`invalidate_cache`/`status`: drop `strategy`/`prompt_history` refs.

### `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`

- Stop reading `execConfig.strategy`; send only `kv_cache_reuse` in `load` payload.
- Update stale comments (sliding window applies to all paths; cache invalidated on drop).

### `src/lib/api-types.ts`

- Remove `ExecutionStrategy` type and `strategy` field from `ExecutionConfig`.

### `src/modules/ai-models/ai_model_entity.ts` (BE)

- Update `execution_config` doc comment: `{kv_cache_reuse, sliding_window, max_history_turns, intent_detection}`.

### DB

- Strip `strategy` key from `execution_config` on rows where present:
  `UPDATE ai_models SET execution_config = execution_config - 'strategy' WHERE execution_config ? 'strategy';`

## Acceptance criteria

- `pnpm run check` clean on FE.
- E2E: cache model (e.g. Llama 3.2 3B q4f16) still reuses KV cache (hit ratio >90% T2+).
- E2E: no-cache model (e.g. Phi 3.5 Mini q4f16, kv_cache_reuse=false) generates without
  `past_key_values` — no ONNX Expand crash on T2.
