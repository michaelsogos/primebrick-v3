# Plan: Model compatibility rework — per-assistant compat, ReAct guide tests, rank rules

> Continuation of `test-onnx-vs-webllm-compare-and-dtype-coverage.md` — guide
> ReAct campaign results merged with historical regex/json scores. The guide
> test suite is NOT yet weighted into the final `rank` — rank is computed
> from regex + json only until the guide test is stabilized.

## Status: 🟠 WIP — Plan date: 2026-10-06 12:45 UTC / 14:45 CEST

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | ReAct guide test — `Qwen2.5-Coder-3B-Instruct` **q4** | ✅ done | 2026-10-06 | **5/5 PASS score=3.62** — all turns pass after fixes 10+11+12. Contract fixes added: 404-hint on failed fetch + `no_match_unfounded` reprompt (lazy fetch→404→NO_MATCH now rejected unless backed by real evidence) |
| 2 | ReAct guide test — `Qwen2.5-Coder-3B-Instruct` **q4f16** | ⏳ partial | 2026-10-06 | (a) `kv_cache_reuse=true`: DETERMINISTIC Expand mask crash {470,470} vs {470,1135} on delta-prefill — confirmed twice. (b) `kv_cache_reuse=false`: T1 answered (309tok) then WebGPU device loss `mapAsync Invalid Buffer` on actions round. Evidence persisted in `guide_react_test_score`. Anomaly: mapAsync may be transient — retry pending user decision |
| 3 | Fresh regex + json tests — `Qwen2.5-Coder-1.5B-Instruct` q4f16 | ⏳ not done | — | Current regex `[5,5,5,2,5]` predates the refined rubric; json never tested → run both, update rank |
| 4 | ReAct guide test — `Qwen2.5-Coder-1.5B-Instruct` q4f16 | ⏳ not done | — | Informational only — does NOT affect rank |
| 5 | ReAct guide test — `granite-4.0-micro-ONNX-web` q4f16 | ⏳ not done | — | 2nd-best model after Qwen2.5 (regex `[5,5,5,2,5]`, json 24/28); cerebellum `kv_cache_reuse=false` already set |
| 6 | ✅ DECIDED: per-assistant default = **C2** (cerebellum `is_default` flag per assistant×model, edited from /ai page) | ⏳ not done | — | Implementation pending |
| 7 | ✅ DECIDED: per-assistant enable/disable lives in `execution_config` of the cerebellum row — keyed by assistant (e.g. `disabled: true` on the guide row while regex/json rows stay enabled). NOT a global model disable | ⏳ not done | — | Implementation pending |
| 8 | ✅ DECIDED: dual guide keys `guide_orch_test_score` + `guide_react_test_score`; guide scores NEVER enter rank (rank = regex+json only) | ✅ done | 2026-10-06 | DONE: spec CASE_KEY → `guide_react_test_score`; `test-scores.ts` rank aggregation now excludes `guide_*` keys; DB migrated (Oct6 rows → react, Oct4-5 rows → orch), all ranks recomputed regex+json only |
| 9 | Decide whether ORCH code stays or is dropped | ⏳ not done | — | User undecided; keep both score keys until decided |
| 10 | ORT wasm OOB fix #1 — `session_options` (`enableMemPattern:false`, `enableCpuMemArena:false`) behind cerebellum `execution_config.ort_session_options` | ✅ done | 2026-10-06 | Implemented in worker load path + `ExecutionConfig` type; set on q4 guide cerebellum (id 52) |
| 11 | ORT wasm OOB fix #2 — `env.wasm.numThreads=1` behind cerebellum `execution_config.ort_num_threads` | ✅ done | 2026-10-06 | Implemented; set on q4 guide cerebellum |
| 12 | Stage-collapse (Option A): generate the final answer as a continuation INSIDE the agent conversation (delta-prefill) instead of a fresh S3 prefill | ✅ done | 2026-10-06 | Implemented in `guide-loop.ts`: answer + S4 action rounds run in-context with `tools: AGENT_TOOLS` (keeps prompt stem → KV cache preserved). Eliminated the 1900-tok full prefill that caused the wasm OOB |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

## History / error log

- **2026-10-06 ~12:31** — Coder-3B q4 run 1: agent loop executed perfectly (docs_search → docs_fetch → DONE), then answer generation crashed WASM: `Aborted()` → `RuntimeError: table index is out of bounds`. Root cause analysis: not a protocol bug — wasm32 linear-memory exhaustion on the largest single prefill (S3 answer, cache=0, ~1900 tok fp32 logits ≈1.1GB). `table index` is the secondary trap after `abort()` corrupts the instance. Evidence: [onnxruntime#19443](https://github.com/microsoft/onnxruntime/issues/19443) (wasm heap corruption → OOB), [#15719](https://github.com/microsoft/onnxruntime/issues/15719) (same class). Regex/json never hit it: their prefills are <1k tok, one-shot, small heap. Fix strategy: (1)+(2) cerebellum flags + (3) Option A stage-collapse so the giant S3 prefill disappears entirely.
- **2026-10-06 ~13:10** — Fixes 10+11+12 landed. Intermediate bugs found and fixed: Svelte proxy not clonable over postMessage (serialize ORT opts); answer rounds missed `tools` → prompt stem diverged → KV cache reset → full prefill 2933 → `unaligned accesses` crash. After passing `AGENT_TOOLS` to answer/S4 rounds: `prompt=3275 cache=1891` — delta works.
- **2026-10-06 ~13:22** — Coder-3B q4 **5/5 PASS** (score 3.62, persisted `guide_react_test_score`). En route, two contract hardenings: (a) failed `docs_fetch` replies now carry `hint: call docs_search` (Coder skipped search and invented paths → 404); (b) NO_MATCH only honored when backed by evidence (search hits or opened page) — `agent_no_match_unfounded` reprompts once. T2 recovered via reprompt on re-run; T3 recovered via hint.
- **2026-10-06 ~13:33** — Coder-3B **q4f16** run A (`kv_cache_reuse=false`): T1 fully answered in-context (309 tok), then **WebGPU device loss**: `mapAsync` → `Invalid Buffer` on the actions round; session dead, subsequent turns dead. GPU-side crash, not wasm heap.
- **2026-10-06 ~13:37** — Coder-3B **q4f16** run B (`kv_cache_reuse=true`): **deterministic** Expand crash again — `attn_mask_reformat/.../Expand` cannot broadcast `{1,1,470,470}` vs `{1,1,470,1135}` on delta-prefill; every turn dead. Conclusion: q4f16 export's mask subgraph is incompatible with KV-reuse; q4f16's only viable config (kv off) hit a GPU device loss once — transient vs deterministic TBD.

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Part A — Consolidated score table (live rows only, as of 2026-10-06)

| Model | dtype | regex | json | guide (ORCH-era) | guide (ReAct) | rank DB | status |
|---|---|---|---|---|---|---:|---|
| onnx-community/Qwen2.5-Coder-3B-Instruct | q4 | 5/5 `[5,5,5,5,5]` | 25/28 | — | **5/5 score 3.62** | **4.4** | COMPATIBLE |
| onnx-community/Qwen2.5-Coder-3B-Instruct | q4f16 | 5/5 | 30/31 | 5/5 `[4,4,4,4,5]` | ❌ Expand(kv on) / mapAsync(kv off) | 4.6 | COMPATIBLE |
| onnx-community/Qwen2.5-Coder-1.5B-Instruct | q4f16 | `[5,5,5,2,5]` | — | — | — | 4.2 | COMPATIBLE |
| onnx-community/granite-4.0-micro-ONNX-web | q4f16 | `[5,5,5,2,5]` | 24/28 | — | — | 4.1 | COMPATIBLE |
| onnx-community/Llama-3.2-3B-Instruct-ONNX | fp16 | `[5,5,5,3,5]` | 5/5 | — | — | 4.0 | COMPATIBLE |
| onnx-community/Qwen3-4B-ONNX | fp16 | 5/5 | 29/31 | — | 4/5 | 3.9 | COMPATIBLE |
| onnx-community/Qwen3-4B-ONNX | q4f16 | `[5,5,2,2,5]` | 23/28 | — | 5/5 | 3.7 | COMPATIBLE |
| onnx-community/Llama-3.2-3B-Instruct-ONNX | q4f16 | `[5,5,5,3,5]` | 23/27 | — | 4/5 (T4 false neg) | 3.6 | COMPATIBLE |
| onnx-community/Qwen3-4B-instruct-2507-ONNX | q4f16 | — | — | — | **5/5 ~93s** | 3.6 | COMPATIBLE |
| onnx-community/granite-4.0-h-micro-ONNX | q4f16 | `[5,1,1,1,5]` | — | — | 4/5 (kv_reuse=false) | 2.6 | COMPATIBLE |
| onnx-community/Phi-3.5-mini-instruct-ONNX-GQA | q4f16 | ~2/5 | — | — | ❌ protocol ignored | 2.2 | NC |
| onnx-community/Phi-4-mini-instruct-ONNX | q4f16 | 0/5 (load) | — | — | ❌ load ok, gen degenerate | 0.9 | NC |
| onnx-community/gemma-4-E4B-it-ONNX | q4f16 | `[5,0,0,0,3]` | 0/5 | — | ❌ 0 token / 180s | 0.7 | NC |
| onnx-community/Phi-4-mini-instruct-ONNX-GQA | q4f16 | 0/5 (load) | — | — | ❌ onnx_data_1 (upstream #1460) | 0.6 | NC |
| onnx-community/Qwen3.5-2B/4B-ONNX | q4f16 | gen fail | — | — | ❌ >75s/step impractical | 0.6 | NC |
| openai-community/gpt2 | fp32 | 0/5 | 0/5 | — | — | 0.7 | COMPATIBLE (!) |

**Rank rule (agreed):** `rank` = computed ONLY from `regex_test_score` +
`json_editor_with_schema_test_score`. Guide tests are persisted but do NOT
enter the rank formula until the suite is weighted and stabilized.

## Part B — Two-level compatibility (proposed semantics)

- **Model level** (`ai_models.compatibility_status`): `NOT_COMPATIBLE` only
  when the model is unusable in absolute terms — load failure, runtime crash,
  zero tokens, or every applicable suite far below floor. Loadable but weak
  stays `COMPATIBLE` (see gpt2: today marked COMPATIBLE with 0/5 everywhere —
  flag for review).
- **Assistant level** (`ai_cerebellum`): new field (proposed:
  `execution_config.disabled` boolean, or dedicated `is_enabled` column) so a
  model can be selectable for regex/json but blocked for the guide. Selector
  filter becomes `getAliveCompatibleModels(assistant_key)`; missing cerebellum
  row falls back to model-level compatibility (decide: deny-by-default or
  allow-by-default).

## Part C — Per-assistant default model (proposed options, no code yet)

- **C1 — config keys per assistant**: e.g. `ai_assistant_model:guide`,
  `ai_assistant_model:smart-json_config`, … Minimal schema change; each panel
  reads its own key; global key remains the fallback.
- **C2 — cerebellum-driven**: `is_default` flag per (assistant_key, model_id)
  row in `ai_cerebellum`; the `/ai` page edits rows directly (user preference).
  One default per assistant enforced by partial unique index.
- Open question: regex and json assistants — same default or separate?

## Part D — Test persistence schema (interim)

Keep both guide variants until the ORCH/ReAct decision is made:

- `test_scores.guide_orch_test_score` — legacy pipeline results (move existing
  `guide_test_score` payloads here where they predate ReAct).
- `test_scores.guide_react_test_score` — ReAct loop results (this campaign).
- `guide_test_score` kept as alias of the newest for UI compatibility (or
  drop and update the readers — decide in task 8).

## Part E — ReAct guide test protocol (current state)

- `src/e2e/ai-guide-quality.spec.ts`, 5 turns, Edge profile `temp/pw-edge-profile`.
- Contract: `docs_search`/`docs_fetch`/`list_routes` + `DONE`/`NO_MATCH`;
  shallow-done reprompt; auto-seed fetch of top hit; fetched-path dedup;
  deterministic "Non lo so" fallback.
- Config switch: `UPDATE config_entries ... version=version+1` + delete
  `dal:config_entries:list` Redis key (ETag recompute).
- Cerebellum flags that matter: `kv_cache_reuse` (false for mamba/hybrid and
  for exports with broken delta-prefill), `min_similarity`, `agent_max_tokens`.

## Combo matrix — dialect × kv_cache × answer_mode (campaign 2025-10-06)

Empirical crash rule discovered (2 confirmations per side):
- `answer_mode=in_context` + `kv_cache_reuse=false` → answer round prefills the
  WHOLE conversation (~4.8k tok) → WebGPU `mapAsync Invalid Buffer` crash
  (device loss / VRAM OOM). Confirmed on Coder-3B q4 AND q4f16.
- `answer_mode=separate_prompt` on q4 (int4/fp32 wasm path) → fresh answer
  prefill ~1.9k tok OOMs the WASM heap → `Aborted()` + `table index is out of
  bounds`. Confirmed WITH ort_num_threads=1 + arena/mem_pattern off — the ORT
  flags do NOT save the wasm heap on this dtype.
- q4f16 + kv_cache_reuse=true → deterministic ONNX export bug: causal-mask
  subgraph is square {q,q} vs {q,kv_total} Expand crash on first delta prefill.

| Model | dtype | dialect | kv | answer_mode | ORT opts | Result | Score | Time |
|---|---|---|---|---|---|---|---|---|
| Coder-3B | q4 | qwen_tool_call | on | in_context | yes | PASS 5/5 (T4 EN flip, `"}` residue) | 3.62 | ~83s |
| Coder-3B | q4 | react_classic | on | in_context | yes | FAIL — T2/T3 false NO_MATCH, T5 fabricated recipe | 0.99 | — |
| Coder-3B | q4 | react_classic | off | separate_prompt | yes | CRASH wasm OOB (answer prefill 4850) | — | timeout |
| Coder-3B | q4 | qwen_tool_call | on | separate_prompt | yes | CRASH wasm `Aborted()`+OOB (answer prefill 1882) | — | — |
| Coder-3B | q4f16 | react_classic | off | separate_prompt | no | **PASS 5/5, all Italian** | 3.62 | ~173s |
| Coder-3B | q4f16 | qwen_tool_call | off | separate_prompt | no | 4/5 — T4 NO_MATCH after double-fetch same doc | 2.91 | ~111s |
| Coder-3B | q4f16 | react_classic | off | in_context | no | CRASH webgpu mapAsync (answer prefill 4850) | — | — |
| Qwen3-4B | q4f16 | qwen_tool_call | on | in_context(?) | no | PASS 5/5 (baseline) | 3.62 | ~138s |

Pending: Qwen3-4B q4f16 × {react/in_ctx kv-on, react/sep kv-off, qwen/sep kv-on}.
Skipped as mechanism-bound (would crash identically): q4 kv-off+in_context
(full-convo prefill), q4f16 qwen+in_context kv-off, any q4f16 kv-on combo.

### Final combo matrix (all runs)

| Model | dtype | dialect | kv | answer_mode | Result | Score | Tot time |
|---|---|---|---|---|---|---|---|
| Coder-3B | q4 | qwen | on | in_context | ✅ 5/5 (T4 EN flip, `"}` residue) | 3.62 | ~83s |
| Coder-3B | q4 | react | on | in_context | ❌ T2/T3 false NO_MATCH, T5 fabricated | 0.99 | — |
| Coder-3B | q4 | qwen | on | separate | ❌ wasm Aborted+OOB (prefill 1882) | — | — |
| Coder-3B | q4 | react | off | separate | ❌ wasm OOB (prefill 4850) | — | — |
| Coder-3B | q4f16 | react | off | separate | ✅ **5/5, all IT** | 3.62 | ~173s |
| Coder-3B | q4f16 | qwen | off | separate | ⚠️ 4/5 (T4 double-fetch→NO_MATCH) | 2.91 | ~111s |
| Coder-3B | q4f16 | react | off | in_context | ❌ webgpu mapAsync (prefill 4850) | — | — |
| Coder-3B | q4f16 | * | on | * | ❌ deterministic Expand mask crash (export bug) | — | — |
| Qwen3-4B | q4f16 | qwen | on | in_context | ✅ 5/5 all IT (baseline) | 3.62 | ~138s |
| Qwen3-4B | q4f16 | react | on | in_context | ✅ 5/5 — T1/T3/T4 EN, stray glyphs "ỉ/ób/CELER" | 3.62 | ~168s |
| Qwen3-4B | q4f16 | qwen | on | separate | ✅ 5/5 all IT | 3.62 | ~158s |
| Qwen3-4B | q4f16 | react | off | separate | ✅ 5/5 all IT | 3.62 | ~223s |
| Qwen3-4B | q4f16 | qwen | off | separate | ✅ 5/5 all IT | 3.62 | ~208s |

Per-turn (s): q4 top=21.6/16.6/21.6/16.6/6.6 · q4f16 coder top=41.7/31.6/26.6/36.6/36.6 ·
Qwen3 base=26.6/26.6/31.6/41.6/11.6 · react+in_ctx=26.6/31.6/56.6/36.6/16.6 ·
qwen+sep kv-on=26.6/31.6/36.6/46.7/16.6 · react+sep kv-off=41.6/46.6/51.6/61.7/21.6 ·
qwen+sep kv-off=41.7/41.6/36.6/61.7/26.6

TOP per model: q4 → kv-on+qwen+in_context+ORT (83s) · Coder q4f16 → kv-off+react+separate ·
Qwen3-4B → kv-on+qwen+in_context (138s, baseline).

Cerebellum rows restored to top configs (52/25/39). NOTE: `test_scores`
persists only the LAST run per model+dtype — historical raw turns live only
in run logs.

### instruct-2507 runs + final matrix update

| Model | dtype | dialect | kv | answer_mode | Result | Score | Tot time |
|---|---|---|---|---|---|---|---|
| Qwen3-4B-instruct-2507 | q4f16 | qwen | on | in_context | ⚠️ 4/5 — T5 malformed `docs_search["q"]`→fetch irrelevant→prose fallback; T2-T4 EN | ~2.8 | ~123s |
| Qwen3-4B-instruct-2507 | q4f16 | react | on | in_context | ✅ 5/5 — answers all EN | 3.62 | ~103s |
| Qwen3-4B-instruct-2507 | q4f16 | react | off | separate | ✅ **5/5 all IT — TOP** | 3.62 | ~128s |

Per-turn (s): in_ctx+qwen=21.6/26.6/26.6/31.6/16.6 · in_ctx+react=16.6/26.6/26.6/26.6/6.5 ·
sep+react+kv-off=21.6/31.6/26.6/36.6/11.6

New finding: `separate_prompt` reliably restores Italian answers (Coder q4f16,
Qwen3-4B kv-off runs, instruct-2507) — `in_context` exposes English Thought
register. And `react_classic` fixes instruct-2507's qwen-dialect bracket-syntax
malformation + missing NO_MATCH.

Parser gap found: `docs_search["query"]` square-bracket syntax emitted by
instruct-2507 under qwen dialect got parsed with brackets inside the query —
harmless here but worth a sanitation pass.

Bug fixed: test-scores.ts `rank = COALESCE($3, rank)` — rank NULL violated
NOT NULL on models with no regex/json cases.

## Language fix + retest campaign (2025-10-06)

ROOT CAUSE of English answers with `in_context`: the answer-round user
message said "in the language the user wrote in" — a weak mid-prompt clause
vs an entirely English conversation register (Thought/Action/Observation +
English docs). Fix: explicit `Intl.DisplayNames`-resolved language directive
as the LAST line of the answer instruction
("The user writes in Italian — answer_markdown MUST be written in Italian").

Retest results (score / language):

| Model | Config | Pre-fix | Post-fix |
|---|---|---|---|
| instruct-2507 q4f16 | kv-on+react+inctx | 3.62 all EN ~103s | **3.62 all IT ~123s** |
| Qwen3-4B q4f16 | kv-on+react+inctx | 3.62 T1/T3/T4 EN ~168s | **3.62 all IT ~183s** |
| Coder-3B q4 | kv-on+qwen+inctx (top) | 3.62 T4 EN+"}" ~83s | 3.20 all IT, T4 partial (HTML/prose) ~98s |
| Coder-3B q4f16 | kv-off+react+sep (top) | 3.62 all IT ~173s | 3.62 all IT ~168s ✓ |
| instruct-2507 q4f16 | kv-off+react+sep (top) | 3.62 all IT ~128s | 3.62 all IT ~123s ✓ |
| Qwen3-4B q4f16 | kv-on+qwen+inctx (top) | 3.62 all IT ~138s | 3.62 all IT ~188s ✓ |

Outcome: language fix works on every model — `in_context` is now viable
everywhere. instruct-2507 kv-on+react+inctx is now the best guide config
overall (3.62, all IT, ~103-123s, fast delta-prefill turns). Residual
artifact: Qwen3 emits stray glyphs (ỉ, ób, CELER, peria) before tool
lines — cosmetic, parser tolerates.

### q4 react retest post-language-fix (2025-10-06)

kv-on + react_classic + in_context re-run after the language fix: **1.41,
still broken** — T2/T3 false NO_MATCH, T5 fabricated a surreal Italian cake
recipe ("pasta con le zucchine", "scolta il pane"). Language is now Italian,
but protocol/faithfulness on q4+react is a model limitation, not promptable.

FINAL VERDICT on Coder-3B q4: exactly one working config exists
(kv-on + qwen + in_context + ORT opts). Prose flaws ("ut utente",
"identacetività", inline HTML) are intrinsic to the int4 dtype — same
prompts produce clean output on q4f16. Not fixable via params or prompt.

### Guide vertical pass — batches 2+3 (2025-10-06)

Batch 2: granite-h-micro q4f16 PASSED 5/5 (3.62) ONLY with
`kv-off + qwen_tool_call + separate_prompt` — kv-on crashes on
mamba past_conv broadcast; react_classic stalls (model emits
double-encoded <tool_call> args). Slow (~4.5min) but Italian+correct.
Phi-3.5-mini: psychotic pseudo-Latin gibberish, never converges.
Phi-4-mini: repetition collapse ("calls calls calls") + mapAsync OOM.
Phi-4-mini-GQA: ONNX external-data path unresolved, won't load.

Batch 3: gemma-4-E4B meta-monologue + garbled Action Input + ~3tps →
timeout. Qwen3.5-2B/4B: zero-token hang in both kv modes (kv-on throws
`TypeError inputNames`; kv-off never emits). All reverted to
NOT_COMPATIBLE. Note: model picker filters on ai_models
compatibility_status — NOT_COMPATIBLE models load via config but are
invisible in the dropdown (spec "selected model id" check failed).

GUIDE-CAPABLE roster (5/5 = 3.62 unless noted):
1. instruct-2507 q4f16  kv-on+react+inctx  ~103s  TOP
2. Qwen3-4B q4f16      kv-on+qwen+inctx   ~138s
3. Coder-3B q4f16      kv-off+react+sep   ~168s
4. granite-h-micro     kv-off+qwen+sep    ~270s
5. Coder-3B q4         kv-on+qwen+inctx   ~83s score 3.20 prose issues

## JSON schema campaign (2026-10-06) — all compatible models

Score = json_editor_with_schema merged; rank = mean(regex, json).

| Model | dtype | Score | Rank | Note |
|---|---|---:|---:|---|
| Qwen2.5-Coder-1.5B | q4f16 | 4.60 | 4.6 | 5/5 exact |
| Qwen2.5-Coder-3B | q4f16 | 4.67 | 4.5 | 4/5 (T1 no candidate) |
| Qwen2.5-Coder-3B | q4 | 4.17 | 4.4 | 4/5 (T1 no candidate) |
| Qwen3-4B-instruct-2507 | q4f16 | 4.60 | 4.3 | 5/5 exact |
| Qwen3-4B | fp16 | 4.40 | 4.2 | 5/5 exact |
| Qwen3-4B | q4f16 | 3.93 | 4.0 | 5/5 exact |
| Llama-3.2-3B | q4f16 | 3.96 | 4.0 | 5/5 exact |
| Llama-3.2-3B | fp16 | 4.00 | 4.0 | 5/5 exact — fresh session OK; earlier "error" was VRAM contamination |
| granite-micro-web | q4f16 | 4.31 | 3.6 | 5/5 exact |
| granite-h-micro | q4f16 | 3.39 | 2.8 | T4 expectation miss |
| gpt2 | fp32 | 1.00 | 0.8 | 0/5 no candidates |
| Qwen2.5-3B | q4f16 | — | 1.0 | load error (dead HF repo), confirmed |

History snapshots: mergeTestScoreTurns now stores previous run in
history[] (newest-first, cap 5) — regression compare preserved.

## Per-assistant compatibility + default — IMPLEMENTED (2026-10-07)

### Schema (patch `ai_compatibility_is_compatible_default.sql`, applied)

- `ai_cerebellum.is_compatible` bool NOT NULL DEFAULT true — row born
  compatible so a new import is testable; false only on empirical evidence.
- `ai_cerebellum.is_default` bool NOT NULL DEFAULT false + partial unique
  `ai_cerebellum_one_default_per_assistant_uq` (one default per assistant).
- `ai_models.compatibility_status` varchar → `is_compatible` bool (same
  semantics: false only on absolute failures). All readers migrated
  (entity, dto, list-config, api-types, useAiModels, /ai page, import panel).

### FE behavior (ai-chat-panel.svelte)

- New `assistant_key` prop (guide/regex/json_config wired in wrappers).
- Model picker = alive+compatible models MINUS combos whose cerebellum row
  for that assistant is is_compatible=false. Missing row = allowed
  (compatible-by-default; block is an explicit decision).
- Default model resolution: pending-switch > cerebellum is_default >
  global `ai_assistant_model` config fallback.

### Seed (decided 2026-10-07)

Defaults (is_default): Qwen2.5-Coder-3B q4f16 for guide, regex, json_config.
Model-level is_compatible=false: gpt2, onnx-community/Qwen2.5-3B-Instruct
(bogus repo — never existed on HF), Phi-3.5-mini-GQA, Phi-4-mini, Phi-4-mini-GQA,
Phi-4-mini-web, Qwen3.5-2B, Qwen3.5-4B, gemma-4-E4B + ALL their cerebellum rows.
Guide-only NC: Coder-1.5B q4f16, Llama-3.2-3B q4f16, granite-micro-web q4f16.
Regex-only NC: granite-4.0-h-micro q4f16 (new row inserted is_compatible=false —
keeps json 3.39 + guide 3.62 compatible).

### Qwen2.5-3B hunt — evidence

- onnx-community/Qwen2.5-3B-Instruct: repo NEVER existed (401 api/models;
  catalog row was bogus → flagged NC).
- Alternative found: opalitestudios/Qwen2.5-3B-Instruct-ONNX (transformers.js,
  only q4f16). Imported + guide E2E attempted → FAILED: single 2.2GB
  `model_q4f16.onnx_data` file → browser `Array buffer allocation failed`
  during download (single contiguous buffer > browser limit). Opposite failure
  of Phi-4-GQA (too many data files vs one too-big file). Model + cerebellum
  flagged is_compatible=false. Plain Qwen2.5-3B has NO usable ONNX export.

### Phi-4-mini-GQA root cause — verified

`model_q4f16.onnx` references TWO external data files (onnx_data 1.57GB +
onnx_data_1 1.50GB). Our inspectRepoFiles detects both; the failure is upstream
transformers.js (#1460): multi-part external data unresolved. Load-time failure,
assistant-independent → model-level NC correct.

### Phi-4-mini-instruct-web-q4f16 — TESTED (2026-10-07)

Guide E2E: load fail `Tensor external data path could not be canonicalized:
No such file or directory` — same multi-part external-data upstream limit as
the GQA variant. Full NC confirmed empirically (model + cerebellum).
