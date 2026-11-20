# Three-family standard-dtype Smart Regex retest

## Objective

Retest the standard `q4f16`, `q4`, and `fp16` variants for:

1. DeepSeek Coder 1.3B
2. Phi 3 Mini 4K 3.8B
3. Granite 4.0 1B Web

Use the current browser-local WebGPU implementation and persist complete, dtype-specific empirical evidence.

## Current evidence

### DeepSeek Coder 1.3B

- q4f16: prior 0/5; prose/code instead of regex JSON.
- q4: loads but produces natural language.
- fp16: prior browser `ArrayBuffer` failure; external data is a single 2,692,943,872-byte file.
- Weight bytes: q4f16 853,021,862; q4 1,065,351,576; fp16 2,693,458,? including ONNX graph.

### Phi 3 Mini 4K 3.8B

- All three variants are catalogued and previously produced only 1/5 successful turns.
- KV reuse was enabled and measured at approximately 92–97%, but quality remained poor.
- q4f16 weights are sharded (~2.29GB); q4 ~2.72GB; fp16 ~7.64GB.

### Granite 4.0 1B Web

- Only q4f16 is catalogued; previous smoke output was repeated `R` characters.
- q4 and fp16 must be added.
- Weight bytes: q4f16 ~1.247GB; q4 ~1.781GB; fp16 ~3.297GB across shards.

## Test protocol

For every dtype that loads, run the five-turn incremental sequence:

1. `solo lettere e numeri` → `^[a-zA-Z0-9]+$`
2. `aggiungiamo anche il punto e la virgola` → `^[a-zA-Z0-9.,]+$`
3. `aggiungiamo underscore e trattino` → `^[a-zA-Z0-9.,_-]+$`
4. `rimuoviamo il punto` → `^[a-zA-Z0-9_-]+$`
5. `solo lettere minuscole da 3 a 5 caratteri` → `^[a-z]{3,5}$`

Capture actual raw response, parsed regex, expected regex, score, verdict, failure reason, response time, generation time, TTFT, tokens/s, generated tokens, prompt tokens, and KV-cache hit/miss metrics.

For hard load failures, persist the exact runtime error, stage, file sizes and elapsed load time. A hard load failure is not converted into a quality score.

## Configuration policy

- Start from each catalogued model’s persisted options.
- Use `max_tokens=256` and thinking disabled.
- If sampling causes prose, loops or unstable output, retest at `temperature=0.2`; the tuned full run becomes authoritative and the baseline remains recorded.
- Preserve each model’s existing empirical KV-cache strategy; do not enable reuse where it has not been proven safe.

## Persistence

For each of the nine dtype-specific IDs:

- persist full `test_scores` including `score_detail.quality`, `score_detail.speed`, `score_detail.score`, and success ratio;
- update `rank`, `download_size_mb`, `power_level`, generation options and `execution_config` from evidence;
- keep `vram_mb=NULL` unless direct evidence exists; browser cache bytes are not VRAM;
- set final `compatibility_status` and `is_enabled` from the result;
- keep hard-failed and quality-failed variants separately traceable.

## Files

- Existing family catalogue SQL files where applicable
- New idempotent dtype-coverage/final-results fire-and-forget SQL
- `primebrick-be-v3/docs/modules/ai-models.md`
- Live `public.ai_models`

No frontend source change is expected unless the campaign exposes a reproducible application defect.

## Acceptance criteria

- Exactly three standard variants per family are represented in the database.
- Every loaded variant has a full five-turn run unless a documented hard failure prevents it.
- Every final row contains honest quality, speed and rank data or an explicit hard-failure result.
- No variant is marked compatible merely because it loads.
- Cache sizes, weight files, options, memory availability and KV strategy are recorded separately.
- Final scripts are idempotent; backend build, frontend check and `/ai` verification pass.

## Campaign results (2026-09-16, protocol `e2e_5turn_s2_poll6s_x10`)

Timing rule: every single poll/sleep ≤ 6 s; a turn is marked generation-timeout
only after 10 polling cycles (~60 s). Load/download is polled at the same
interval and never fails on a single elapsed interval.

| Model | dtype | Result | Success | Rank | Notes |
|-------|-------|--------|---------|------|-------|
| deepseek-coder-1.3b | q4f16 | NOT_COMPATIBLE | 0/5 | 1.0 | Degenerate multilingual prose, token cap every turn |
| deepseek-coder-1.3b | q4 | NOT_COMPATIBLE | 0/5 | 1.0 | Verbose apologetic prose, no clean JSON |
| deepseek-coder-1.3b | fp16 | NOT_COMPATIBLE | — | 1.0 | Load failure: single 2,692,943,872-byte data file > 2 GB ArrayBuffer limit |
| Phi-3-mini-4k | q4f16 | NOT_COMPATIBLE | 1/5 | 1.8 | Parseable JSON but wrong charsets T2-T5 (spurious `'`, comma lost, dot kept) |
| Phi-3-mini-4k | q4 | NOT_COMPATIBLE | 1/5 | 1.8 | Same failure class; T5 244-token verbose reply, 40.8 s |
| Phi-3-mini-4k | fp16 | NOT_COMPATIBLE | 1/5 | 1.6 | Verbose prose at 59.9 s bound on T2; T3 exceeded 60 s bound |
| granite-4.0-1b-web | q4f16 | NOT_COMPATIBLE | 0/5 | 1.0 | Export artifact: `!!!` repeated on every turn |
| granite-4.0-1b-web | q4 | **COMPATIBLE** | 5/5 | 4.2 | 5/5 valid JSON, 1.9-2.5 s/turn, 9.8 t/s avg; `*` vs `+` and spurious `;` imperfections |
| granite-4.0-1b-web | fp16 | NOT_COMPATIBLE | 0/5 | 1.0 | Same `!!!` artifact; split data files load fine (147 s) |

KV-cache note: Phi-3-mini KV reuse is healthy (hit 0.92-0.96) — the failures are
instruction-following, not cache corruption. Granite is no-cache by design;
DeepSeek ran with `kv_cache_reuse=false`.

Artifacts: `primebrick-workspace/ai-plans/artifacts/three-family-2026-09-16/*-result.json` (raw stream_complete text +
`measure` events per turn). Persisted: full `test_scores` JSONB per row
(raw `actual_response`, per-turn latency/tokens/KV metrics) and fire-and-forget
`retest_three_family_standard_dtypes_2026_09_16.sql`.
