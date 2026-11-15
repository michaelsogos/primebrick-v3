# Granite 4.0 H 350M three-dtype E2E retest

## Objective

Retest `onnx-community/granite-4.0-h-350m-ONNX` in q4f16, q4 and fp16 using the current browser-local Smart Regex implementation and persist complete empirical evidence per dtype.

## Current state

- q4f16 is catalogued as `COMPATIBLE`, but only has a single-turn smoke result: format valid, semantically imprecise regex, load 20s, generation 1s.
- q4 and fp16 are available in the Hugging Face repository but are not catalogued.
- Measured repository weights:
  - q4f16: 1.8MB ONNX + 225.5MB external data
  - q4: 1.8MB ONNX + 246.9MB external data
  - fp16: 1.7MB ONNX + 649.8MB external data

## Implementation

1. Register q4 and fp16 as enabled `UNTESTED` rows, with independent model IDs, real download sizes and the q4f16 generation configuration.
2. Retest q4f16, q4 and fp16 with the five-turn incremental protocol:
   1. `solo lettere e numeri`
   2. `aggiungiamo anche il punto e la virgola`
   3. `aggiungiamo underscore e trattino`
   4. `rimuoviamo il punto`
   5. `solo lettere minuscole da 3 a 5 caratteri`
3. Capture for every turn:
   - complete raw response and parsed regex;
   - expected regex, score, verdict and failure reason;
   - response time, generation time, first-token latency and tokens/second;
   - generated tokens, prompt tokens and KV-cache hit/miss metrics.
4. Capture per dtype:
   - exact generation options and execution configuration;
   - model file weights, measured browser cache bytes, load/warmup time;
   - available process-memory metrics, explicitly distinguishing them from true VRAM.
5. Persist independent `test_scores`, quality, speed and final `rank` for each dtype.
6. Set `compatibility_status` and `is_enabled` from the empirical result; loading alone is not success.
7. Update fire-and-forget SQL and `docs/modules/ai-models.md`.

## Impacted files

- `primebrick-be-v3/db-meta/fire-and-forget/add_granite_4_h_350m_fp16_q4_variants.sql`
- `primebrick-be-v3/docs/modules/ai-models.md`
- Live `public.ai_models` rows for the three dtype-specific IDs

No frontend source change is expected unless the browser harness exposes a reproducible application defect.

## Acceptance criteria

- All three dtypes have separate catalog rows and separate empirical results.
- Every completed turn records actual and expected output plus worker metrics.
- Prose, malformed JSON, empty output and stale repetition are scored as quality failures, not timeouts.
- Missing direct VRAM is recorded as unavailable, never inferred from cache size.
- Final quality, speed, rank, compatibility and enabled state are persisted consistently.
- Fire-and-forget SQL is idempotent and backend/frontend checks remain green.
