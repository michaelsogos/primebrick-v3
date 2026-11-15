# AI model & cerebellum option surfaces — coverage analysis and simplification plan

> Standalone analysis requested after the GUIDE loop work: "do the import-model
> and create-cerebellum panels cover all the options that exist today? Can we
> simplify them?" — Empirical inventory first, proposal second. NO changes made.

## Status: ⚪ TODO — Plan date: 2026-10-12 03:10 UTC / 05:10 CEST

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| 1 | Inventory: options written by `AiModelImportPanel` | ✅ done | 2026-10-12 | |
| 2 | Inventory: options written by `AiCerebellumPanel` | ✅ done | 2026-10-12 | |
| 3 | Inventory: options CONSUMED at runtime (guide loop + assistants) | ✅ done | 2026-10-12 | `guide-loop.ts`, `use-guide-ai`, `use-ai-assistant` |
| 4 | Gap analysis: consumed-but-not-editable vs editable-but-dead | ✅ done | 2026-10-12 | below |
| 5 | Decision: which options to expose / scope / simplify | ⏳ not done | — | needs user sign-off. 2026-10-18: retire candidates disproven (all alive); open question unchanged — full ~26 knobs vs curated subset + advanced JSON |
| 6 | Design: typed `ExecutionConfig` schema (discriminated per assistant?) | ⏳ not done | — | |
| 7 | Implement panel changes + typed schema + seed defaults | ⏳ not done | — | |
| 8 | E2E: cerebellum create/edit round-trip + guide honors overrides | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## A. What the panels write today

### A1. `AiModelImportPanel` (shell/sheets/panels/AiModelImportPanel.svelte)

Writes on `POST /entities/ai_model`:

| Field | Panel control | Default |
|---|---|---|
| `model_id`, `name`, `dtype` | HF search + variant select | — |
| `engine_type` | — | hardcoded `'onnx'` |
| `temperature`, `top_p`, `max_tokens`, `repetition_penalty` | sliders | 0 / 0.9 / 256 / 1.1 |
| `enable_thinking` | switch | false |
| `execution_config.kv_cache_reuse` | switch | false |
| `execution_config.sliding_window` | switch | true |
| `execution_config.intent_detection` | switch | false |
| `execution_config.max_history_turns` | slider | null |
| `download_size_mb`, `vram_mb` | — | from HF variant |

### A2. `AiCerebellumPanel` (sheets/panels/AiCerebellumPanel.svelte)

Writes on `POST|PUT /entities/ai_cerebellum`:

| Field | Panel control |
|---|---|
| `assistant_key`, `model_id` (model+dtype variant), `name` | selects |
| `temperature`, `top_p`, `max_tokens`, `repetition_penalty` | sliders (NULL = inherit) |
| `enable_thinking`, `recommendation` | switch / badge select |
| `execution_config.kv_cache_reuse`, `.sliding_window`, `.intent_detection`, `.max_history_turns` | switches + slider |

**Both panels write exactly the same 4 execution_config keys.**

## B. What the runtime actually consumes

`execution_config` is `z.record(z.string(), z.any())` on the DTO — free-form JSONB. The runtime reads **16 keys the panels cannot write**, all born with the GUIDE loop:

| Key | Consumer | Default |
|---|---|---|
| `min_similarity` | `use-guide-ai` → `searchDocs` floor | 0.35(?) |
| `keyword_boost`, `lexical_boost`, `lex_match_min`, `oversample`, `graph_max_paths` | `guide-loop` → `docs/search` tuning | server-side |
| `agent_dialect` | `guide-loop:670` — `'react_classic'` (default) vs `'qwen_tool_call'` | react_classic |
| `answer_mode` | `guide-loop:975` — `'in_context'` vs `'separate_prompt'` | in_context |
| `max_context_chunks`, `max_chunk_chars`, `inspect_chunk_chars`, `max_retrieval_iterations`, `max_actions`, `preflight_temperature`, `preflight_max_tokens`, `max_queries`, `max_keywords`, `inspect_digest_size`, `max_searches`, `agent_max_tokens`, `max_agent_turns`, `max_agent_calls`, `max_block_chars` | `resolveLoopConfig` (`guide-loop:73-99`) — every loop budget is cerebellum-tunable via free-form keys | LOOP_DEFAULTS |

Plus ORT-level keys typed in `api-types.ts` but NOT editable anywhere: `ort_session_options`, `ort_num_threads`.

## C. Gap analysis

### C1. Editable-but-possibly-dead — VERIFIED 2026-10-18: all three ALIVE

| Option | Reader (verified) | Verdict |
|---|---|---|
| `kv_cache_reuse` | `ai-worker.ts` (~15 sites) via `use-ai-assistant:610` — real KV-cache reuse perf feature | keep |
| `max_history_turns` | `use-ai-assistant.svelte.ts:919` — chat history window | keep |
| `intent_detection` | `use-regex-ai.svelte.ts:152` — consumed by the **smart-regex** pipeline, NOT the guide loop | keep, but **out of place** — it's regex-scoped, show only for regex cerebellums |

Nothing to retire — the real issue is **scoping**: `intent_detection` is regex-only, shown globally.

### C2. Consumed-but-not-editable (the real gap) — verified 2026-10-18

- **Guide loop budgets** (15 keys, `LOOP_DEFAULTS` in `guide-loop.ts:73-89`): `max_context_chunks`(4) `max_chunk_chars`(1500) `inspect_chunk_chars`(350) `max_retrieval_iterations`(2) `max_actions`(3) `preflight_temperature`(0) `preflight_max_tokens`(384) `max_queries`(3) `max_keywords`(8) `inspect_digest_size`(6) `max_searches`(3) `agent_max_tokens`(512) `max_agent_turns`(4) `max_agent_calls`(6) `max_block_chars`(6000 — WebGPU anti-OOM ceiling).
- **Search tuning** forwarded to `searchDocs` (`guide-loop:542-546`): `keyword_boost`, `lexical_boost`, `lex_match_min`, `oversample`, `graph_max_paths`.
- **`agent_dialect`** (`guide-loop:670`): `react_classic` (default) vs `qwen_tool_call` — model tool-call format compatibility.
- **`answer_mode`** (`guide-loop:981`): `in_context` (delta-prefill, ~8-10s/turn saved) vs `separate_prompt` — required for models without KV-reuse.
- **`min_similarity`**: `use-guide-ai` → `searchDocs` cosine floor.
- **`ort_session_options` / `ort_num_threads`**: fp32 dtype workaround knobs, typed (`api-types.ts:206-208`) but not editable.

### C3. Structural issue

`ExecutionConfig` (api-types.ts) types only 9 keys; the guide loop reads ~15 more via `Record<string,any>` cast — the schema drifted behind the implementation. The DTO accepts anything → typos are silent.

## D. Proposed direction (to decide)

1. **Split execution_config by concern** instead of one flat bag:
   - `engine` — kv_cache_reuse, sliding_window, ort_session_options, ort_num_threads (model-level)
   - `conversation` — max_history_turns, (intent_detection if kept)
   - `agent` (guide cerebellums) — agent_dialect, answer_mode, max_agent_turns, max_agent_calls, agent_max_tokens, max_actions
   - `retrieval` (guide cerebellums) — min_similarity, max_context_chunks, max_chunk_chars, inspect_chunk_chars, max_keywords, oversample, keyword_boost, lexical_boost, lex_match_min, graph_max_paths, max_searches, inspect_digest_size
   - `budget` — max_block_chars, preflight_temperature, preflight_max_tokens, max_queries, max_retrieval_iterations
2. **Panel**: assistant-conditional fieldsets — `agent`/`retrieval`/`budget` shown only when `assistant_key='guide'`; sane defaults + "inherit/reset" per group.
3. **Typed schema**: single `GuideLoopConfig`-aligned type shared FE↔contract; reject unknown keys in DTO (or warn) — kills silent drift.
4. ~~**Retire candidates**~~ — RESOLVED 2026-10-18: all three keys are alive (see C1); no retirement. `intent_detection` is regex-scoped → gate by assistant, don't remove.
5. Import panel stays minimal (it's the model catalog row); guide tuning lives only in cerebellum — no duplication.

Open question for you: expose all ~20 guide knobs (full control, dense UI) or a curated subset (min_similarity, agent_dialect, answer_mode, max_agent_turns/calls, max_chunk_chars) with the rest as "advanced" JSON editor?
