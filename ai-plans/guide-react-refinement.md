# Guide ReAct refinement — coverage completion + fixes

> Continuation of `guide-score-recalibration-and-retests.md` and `model-compatibility-rework-and-react-guide-tests.md`.
> Scope: complete ReAct coverage on guide-compatible models, fix known artifacts, uniform v2 matrix. ReAct is the chosen engine — orch is historical data only.

Status: 🟠WIP — Plan date: 2026-10-08

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Create guide cerebellum row `Qwen3-4B-ONNX#fp16` (qwen_tool_call + in_context + kv-on, same as q4f16 twin) | ✅ done | 2026-10-08 | Inserted |
| 2 | Create guide cerebellum row `Llama-3.2-3B-Instruct-ONNX#fp16` (react_classic + in_context + kv-on) | ✅ done | 2026-10-08 | Inserted |
| 3 | Test ReAct guide `Qwen3-4B#fp16` | ✅ done | 2026-10-08 | **3.89 (q~4.8), 5/5 pass, zero debris** |
| 4 | Test ReAct guide `Llama-3.2-3B#fp16` | ✅ done | 2026-10-08 | **3.92 (q~4.83), 5/5 pass — best ReAct guide so far**; fp16 download stalled once on `model_fp16.onnx_data` (done_count=4/33 shards), deleted manifest+shards via Cache API and resumed clean |
| 5 | Investigate Qwen3-4B q4f16 `"} ` trailing debris | ✅ done | 2026-10-08 | Root cause: salvage path in `parseGuideResponse` kept envelope residue inside `answer_markdown`. Fixed: truncate at closing `"}`. Unit test added — 8/8 `guide-response.test.ts` green |
| 6 | Retest v2 `Coder-3B#q4f16` guide react | ✅ done | 2026-10-08 | 3.49 (q~4.59), 5/5 — T2 spuria+typo "organazione"; risposte più corte del run stale |
| 7 | Retest v2 `granite-h-micro#q4f16` guide | ⏳ partial | 2026-10-08 | T4 false-IDK (score 1) + test timeout 10min — ~100-122s/turno con kv-off, T5 mai raggiunto, score non persistito. Candidato a guide NC (troppo lento per il budget) |
| 8 | Fix T5 refusal classification (accept paraphrased refusals, not only exact "Non lo so") | ✅ done | earlier | `noDoc` regex already covers `non posso aiutarti` — the fp16-orch 0 was a stale pre-fix run |
| 9 | Decide guide→rank integration | ✅ done | 2026-10-08 | `guide_react_test_score` now rank-eligible in `test-scores.ts`; `guide_orch` stays excluded (dead engine). All `ai_models.rank` recomputed via `temp/recompute-rank.mjs` |
| 10 | granite-h-micro guide NC decision | ✅ done | 2026-10-08 | Set `is_compatible=false` on guide cerebellum — false-IDK T4 + ~100-122s/turn (kv-off forced), can't complete the 5-turn budget |

## Context — final roster (excludes all `is_compatible=false`)

| Model | dtype | dialect | guide score | status |
|---|---|---|---|---|
| Qwen3-4B-instruct-2507 | q4f16 | react_classic | 3.47 (q 4.34) | ✅ good |
| Qwen2.5-Coder-3B | q4f16 | react_classic | 3.49 (q~4.59) | ✅ good — v2 retest done |
| Qwen2.5-Coder-3B | q4 | qwen_tool_call | 3.81 (q 4.77) | ✅ good |
| granite-4.0-h-micro | q4f16 | qwen_tool_call | — (timeout) | ⚠️ false-IDK T4 + ~100s/turn — candidate guide NC |
| Qwen3-4B | q4f16 | qwen_tool_call | **3.92 (q~4.84)** | ✅ good — debris fixed, was 2.53 |
| Qwen3-4B | fp16 | qwen_tool_call | **3.89 (q~4.8)** | ✅ good |
| Llama-3.2-3B | fp16 | react_classic | **3.92 (q~4.83)** | ✅ good — top ReAct model |

## Cerebellum rows to insert

```sql
-- Qwen3-4B fp16: mirror q4f16 twin config
INSERT INTO ai_cerebellum (uuid, assistant_key, model_id, dtype, name, enable_thinking,
  temperature, top_p, max_tokens, repetition_penalty, execution_config, is_enabled,
  sort_order, is_compatible, is_default, version, created_by, updated_by)
VALUES (gen_random_uuid(), 'guide', 'onnx-community/Qwen3-4B-ONNX', 'fp16',
  'app.smart.guide.ai.cerebellum_name', false, 0.10, NULL, 1024, 1.00,
  '{"answer_mode":"in_context","agent_dialect":"qwen_tool_call","kv_cache_reuse":true,"min_similarity":0.8,"agent_max_tokens":768}',
  true, 100, true, false, 1, 'devin', 'devin');

-- Llama-3.2-3B fp16: react_classic (no <tool_call> template), in_context, kv-on
INSERT INTO ai_cerebellum (uuid, assistant_key, model_id, dtype, name, enable_thinking,
  temperature, top_p, max_tokens, repetition_penalty, execution_config, is_enabled,
  sort_order, is_compatible, is_default, version, created_by, updated_by)
VALUES (gen_random_uuid(), 'guide', 'onnx-community/Llama-3.2-3B-Instruct-ONNX', 'fp16',
  'app.smart.guide.ai.cerebellum_name', false, 0.10, NULL, 1024, 1.00,
  '{"answer_mode":"in_context","agent_dialect":"react_classic","kv_cache_reuse":true,"min_similarity":0.8,"agent_max_tokens":768}',
  true, 100, true, false, 1, 'devin', 'devin');
```

## Results log

### 2026-10-08 — Qwen3-4B#fp16 ReAct (guide_react_test_score persisted)

| T | score | s | note |
|---|---|---|---|
| 1 | 4.89 | ~60 | correct user-creation procedure |
| 2 | 4.39 | ~30 | IDP Code correct |
| 3 | 4.61 | ~67 | RBAC correct |
| 4 | 5.00 | ~92 | admin procedure complete |
| 5 | 5.00 | ~17 | clean "Non lo so" |
| **final** | **3.89** | | quality ~4.8, zero debris, 5/5 pass |

### 2026-10-08 — Llama-3.2-3B#fp16 ReAct (guide_react_test_score persisted)

| T | score | s | note |
|---|---|---|---|
| 1 | 4.92 | 51.6 | correct procedure, rel=0.71 faith=0.67 |
| 2 | 4.78 | 31.6 | IDP Code correct, 1 action off-target (organizations) |
| 3 | 4.46 | 66.7 | role-mapping procedure, 1 entity miss (`opzione`) |
| 4 | 4.98 | 91.8 | admin via "Amministratore di sistema" role |
| 5 | 5.00 | 16.6 | clean "Non lo so" — no fabrication (unlike q4f16 twin) |
| **final** | **3.92** | | quality ~4.83, 5/5 pass — **best ReAct guide model** |

Download incident: `model_fp16.onnx_data` (2.08GB) stalled at shard 4/33; deleted `__resume_manifest` + shard entries via Cache API (`temp/del-shards.mjs`), next run resumed and completed. CDN `network error`s are retried per-request by resumable-fetch — real cause was connection resets, not corrupt shards.

### 2026-10-08 — Post-debris-fix retests (v2)

**Qwen3-4B#q4f16** — `2.53 → 3.92` persisted. Zero debris on all 5 turns (parser salvage fix confirmed). Turns: 5, 4.68, 4.51, 5, 5 — q mean ~4.84.

**Coder-3B#q4f16** — `3.49` persisted. Turns: 4.38, 3.69 (spuria+typo "organazione"), 4.9, 5, 5 — q mean ~4.59. Answers noticeably shorter than stale run but correct.

**granite-h-micro#q4f16** — not persisted (test timeout). T2 4.67 @96.8s, T3 4.7 @121.8s, **T4 false-IDK score=1** ("Non lo so" on covered admin question). kv-off forces ~100-122s/turn → 5 turns don't fit the 10-min budget. Candidate for `is_compatible=false` on guide unless turns get faster.
