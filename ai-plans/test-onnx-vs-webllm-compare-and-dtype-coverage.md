# Plan: ONNX model E2E test campaign — WebLLM compare + dtype coverage

## Objective

Re-test ONNX/Transformers.js models with the S1 v2 5-turn protocol, persist
`test_scores` + `affidability` + `rank` (refined formula) per model, and build
an apples-to-apples quality comparison vs the legacy WebLLM benchmarks.

## Scoring (refined formula — see primebrick-be-v3/docs/modules/ai-models.md)

- Per turn: 5 = correct, 2 = partially valid, 1 = fail (invalid/garbage/prose/crash)
- `score = mean(runs)*0.6 + (success/total)*5*0.4` (success = turn >= 4)
- `affidability = ceil(success/total*5)` min 1
- `rank = round(score, 1)`
- Persist to `test_scores->'e2e_5turn_s1_fixed_v2'` (or `_retest`), then recompute
  aff+rank in the same transaction. `harness_error` is not a quality score.

## Test protocol (S1 v2)

Turns: `solo lettere e numeri` → `aggiungiamo anche il punto e la virgola` →
`aggiungiamo underscore e trattino` → `rimuoviamo il punto` →
`solo lettere minuscole da 3 a 5 caratteri`.

Expected: `^[a-zA-Z0-9]+$` → `^[a-zA-Z0-9.,]+$` → `^[a-zA-Z0-9.,_-]+$` →
`^[a-zA-Z0-9_-]+$` → `^[a-z]{3,5}$`.

Per turn record: response regex, pass/partial/fail, error category (invalid /
partially-valid / stale-state / missing-char / extra-char / JSON-malformed /
garbage / prose / loop / crash / timeout), KV metrics (hit ratio, first-token
ms, tps).

## List A — WebLLM compare (Qwen family) — PRIORITY

Direct counterparts of WebLLM-tested models. Primary variant = `q4f16`
(same quantization as the `-MLC` rows → apples-to-apples). All currently
`NOT_COMPATIBLE` + disabled → temporarily set `is_enabled=true` for the test,
persist final status after.

| # | Model ONNX | Variant | WebLLM score | Status |
|---|------------|---------|:---:|--------|
| A1 | `onnx-community/Qwen3.5-2B-ONNX` | q4f16 | **4.9** | ⬜ |
| A2 | `onnx-community/Qwen3.5-4B-ONNX` | q4f16 | 3.4 | ⬜ |
| A3 | `onnx-community/Qwen2.5-Coder-1.5B-Instruct` | q4f16 | 3.6 | ⬜ |
| A4 | `onnx-community/Qwen2.5-1.5B-Instruct` | q4f16 | 1.7 | ⬜ |
| A5 | `onnx-community/Qwen3-1.7B-ONNX` | q4f16 | 0.9 | ⬜ |
| A6 | `onnx-community/Qwen3.5-2B-ONNX` | fp16 | (extra: does fp16 beat 4.9?) | ⬜ |

Already done (no retest needed): Qwen3 4B fp16 (5.0) + q4f16 (3.2) vs
WebLLM Qwen3 4B (4.5); Qwen2.5 Coder 3B q4f16 (5.0 S2) vs WebLLM (2.2).

## List B — dtype counterparts of tested models

| # | Model | Tested | To test | Why |
|---|-------|--------|---------|-----|
| B1 | Qwen2.5 Coder 3B | q4f16 (5/5 S2, no-cache) | fp16 | fp16 fixed Qwen3 4B bugs → may give 5/5 WITH KV cache |
| B2 | Phi 3.5 Mini | web q4f16 (5/5 S2) | GQA q4f16 | already enabled, never tested — GQA export may not have Expand bug |
| B3 | Phi 3 Mini 4K | q4f16 (1/5) | fp16 (retry: load_timeout), q4 | quantization effect |
| B4 | Llama 3.2 3B | q4f16 + fp16 (4/5) | q4, bnb4 | full dtype coverage |
| B5 | Llama 3.2 1B | q4/q4f16/fp16/alt | bnb4 | last missing variant |

## List C — untested families

| # | Model | Variants | Why |
|---|-------|----------|-----|
| C1 | Phi 4 mini | GQA fp16/q4/q4f16, web | strong in old 3-turn WebLLM test |
| C2 | NVIDIA Nemotron 3 Nano 4B | q4f16 | recent 4B |
| C3 | EXAONE 3.5 2.4B | q4f16 | instruction-tuned |
| C4 | SmolLM3 3B | fp16/q4/q4f16/bnb4 | all NC via harness errors, never real E2E |
| C5 | DeepSeek Coder 1.3B | 4 variants | specialized coder |
| C6 | Granite 4.0 1B web / 350M web | q4f16 | siblings of Micro 3B (4/5) |

## Execution per model

1. DB: `is_enabled=true` (temporary), keep `compatibility_status` until result.
2. UI: open Smart Regex brain on `/system/settings/security/create`, select model.
3. Install metrics interceptor; run 5 turns.
4. Persist `test_scores` (per-turn expected/response/pass + score X/5 + KV
   metrics), recompute `affidability` + `rank` (refined formula), set final
   `compatibility_status` + `is_enabled`.

## Acceptance criteria

- Every tested model has `test_scores`, `affidability`, `rank`, final
  `compatibility_status` consistent with its evidence.
- Final ONNX vs WebLLM compare table with power/score/rank on the same scale.
